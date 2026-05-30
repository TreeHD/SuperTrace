package me.treexhd.supertrace.traceroute

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructTimeval
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.FileDescriptor
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

class TracerouteModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "TracerouteModule"
        private const val EVENT_HOP_RESULT = "onHopResult"
        private const val EVENT_TRACE_COMPLETE = "onTraceComplete"
        private const val EVENT_TRACE_ERROR = "onTraceError"

        // Linux uapi/in.h IP_TTL = 2. OsConstants.IP_TTL was only made public
        // in newer SDKs; the on-wire value has been stable since Linux 1.0,
        // so hardcoding is safe across every Android release we support.
        private const val IP_TTL_OPT = 2
    }

    override fun getName(): String = NAME

    private var tracerouteJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val probeSeq = AtomicInteger(0)

    @ReactMethod
    fun startTraceroute(host: String, maxHops: Int, timeoutMs: Int) {
        tracerouteJob?.cancel()

        tracerouteJob = scope.launch {
            try {
                // Robust DNS Resolution with retries and timeouts
                val targetAddress = withTimeoutOrNull(8000) {
                    var lastException: Exception? = null
                    for (attempt in 1..2) {
                        try {
                            return@withTimeoutOrNull InetAddress.getByName(host)
                        } catch (e: Exception) {
                            lastException = e
                            android.util.Log.w("SuperTrace", "DNS attempt $attempt failed for $host: ${e.message}")
                            delay(500) // Brief delay before retry
                        }
                    }
                    null
                } ?: run {
                    sendError("Could not resolve $host (Timeout or Invalid)")
                    return@launch
                }

                val targetIp = targetAddress.hostAddress ?: run {
                    sendError("Invalid target IP")
                    return@launch
                }

                val minDestinationTtl = AtomicInteger(maxHops + 1)
                val semaphore = Semaphore(8) // Limit concurrent ping sweeps to 8

                val jobs = (1..maxHops).map { ttl ->
                    async {
                        if (!isActive) return@async
                        // Check if we already found the destination at a lower TTL
                        if (ttl > minDestinationTtl.get()) return@async

                        semaphore.withPermit {
                            if (!isActive || ttl > minDestinationTtl.get()) return@withPermit
                            
                            val hopResult = probeHop(targetAddress, ttl, timeoutMs)
                            val hopIp = try { hopResult.getString("ip") } catch (e: Exception) { null }
                            
                            sendHopResult(hopResult)

                            // Check if we've reached the destination
                            if (hopIp == targetIp) {
                                var currentMin = minDestinationTtl.get()
                                while (ttl < currentMin) {
                                    if (minDestinationTtl.compareAndSet(currentMin, ttl)) {
                                        break
                                    }
                                    currentMin = minDestinationTtl.get()
                                }
                            }
                        }
                    }
                }

                jobs.awaitAll()
                sendComplete()
            } catch (e: CancellationException) {
                // Normal cancellation, ignore
            } catch (e: Exception) {
                sendError("Traceroute error: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun stopTraceroute() {
        tracerouteJob?.cancel()
        tracerouteJob = null
    }

    /**
     * Returns the DNS servers handed out by the OS for the *currently active*
     * network. On modern Android this hits ConnectivityManager.getLinkProperties,
     * which honours per-network resolvers (so cellular and WiFi report different
     * answers when both are up). Includes Private DNS (DoT) hostname when set.
     */
    @ReactMethod
    fun getSystemDnsServers(promise: Promise) {
        scope.launch {
            try {
                val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
                    as? ConnectivityManager
                if (cm == null) {
                    promise.resolve(buildDnsResult(emptyList(), null, "unknown", false))
                    return@launch
                }

                val network: Network? = cm.activeNetwork
                if (network == null) {
                    promise.resolve(buildDnsResult(emptyList(), null, "none", false))
                    return@launch
                }

                val props: LinkProperties? = cm.getLinkProperties(network)
                val caps: NetworkCapabilities? = cm.getNetworkCapabilities(network)

                val transport = when {
                    caps == null -> "unknown"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
                    else -> "other"
                }

                val servers = props?.dnsServers
                    ?.mapNotNull { it.hostAddress }
                    ?.distinct()
                    ?: emptyList()

                // Private DNS (DoT) was added in API 28. Best-effort surface it.
                var privateDnsServer: String? = null
                var privateDnsActive = false
                if (props != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    privateDnsActive = props.isPrivateDnsActive
                    privateDnsServer = props.privateDnsServerName
                }

                promise.resolve(
                    buildDnsResult(servers, privateDnsServer, transport, privateDnsActive)
                )
            } catch (e: Exception) {
                android.util.Log.w("SuperTrace", "getSystemDnsServers failed: ${e.message}")
                promise.resolve(buildDnsResult(emptyList(), null, "unknown", false))
            }
        }
    }

    private fun buildDnsResult(
        servers: List<String>,
        privateDnsServer: String?,
        transport: String,
        privateDnsActive: Boolean
    ): WritableMap {
        val map = Arguments.createMap()
        val arr = Arguments.createArray()
        for (s in servers) arr.pushString(s)
        map.putArray("servers", arr)
        map.putString("transport", transport)
        map.putBoolean("privateDnsActive", privateDnsActive)
        if (privateDnsServer != null) {
            map.putString("privateDnsServer", privateDnsServer)
        } else {
            map.putNull("privateDnsServer")
        }
        return map
    }

    @ReactMethod
    fun resolveDns(host: String, promise: Promise) {
        scope.launch {
            try {
                // Ensure we don't hang with long-running resolution
                val addresses = withTimeoutOrNull(6000) {
                    try {
                        InetAddress.getAllByName(host)
                    } catch (e: Exception) {
                        null
                    }
                }

                if (addresses == null) {
                    promise.resolve(WritableNativeArray())
                    return@launch
                }

                val results = WritableNativeArray()
                val uniqueIps = mutableSetOf<String>()
                
                for (address in addresses) {
                    val ip = address.hostAddress
                    if (ip != null && uniqueIps.add(ip)) {
                        results.pushString(ip)
                    }
                }
                
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject("RESOLVE_ERROR", e.message ?: "DNS Resolution Failed")
            }
        }
    }

    @ReactMethod
    fun pingHost(host: String, count: Int, timeoutMs: Int, promise: Promise) {
        scope.launch {
            try {
                val targetAddress = try {
                    InetAddress.getByName(host)
                } catch (e: Exception) {
                    promise.reject("RESOLVE_ERROR", "Failed to resolve host: ${e.message}")
                    return@launch
                }

                val results = WritableNativeArray()
                var received = 0
                var totalRtt = 0.0
                var minRtt = Double.MAX_VALUE
                var maxRtt = 0.0

                android.util.Log.d("SuperTrace", "pingHost: Starting $count probes to $host")

                for (seq in 1..count) {
                    if (!isActive) break

                    val result = Arguments.createMap()
                    result.putInt("seq", seq)
                    result.putString("ip", targetAddress.hostAddress)

                    var rttValue: Double? = null
                    var outputString = ""

                    try {
                        withTimeout(timeoutMs.toLong() + 2000) {
                            val startTime = System.nanoTime()
                            
                            val commandPool = listOf(
                                arrayOf("ping", "-c", "1", "-W", "1", targetAddress.hostAddress),
                                arrayOf("/system/bin/ping", "-c", "1", "-W", "2", targetAddress.hostAddress),
                                arrayOf("ping", "-c", "1", "-w", "1", targetAddress.hostAddress)
                            )

                            for (cmd in commandPool) {
                                try {
                                    val proc = ProcessBuilder(*cmd).redirectErrorStream(true).start()
                                    val out = proc.inputStream.bufferedReader().readText()
                                    proc.waitFor()
                                    
                                    val match = Regex("""time[=<]\s*([\d.]+)""").find(out)
                                    if (match != null) {
                                        rttValue = match.groupValues[1].toDoubleOrNull()
                                        outputString = out
                                        if (rttValue != null) break
                                    }
                                } catch (e: Exception) {
                                    outputString = "Error: ${e.message}"
                                }
                            }
                            
                            // Fallback to isReachable
                            if (rttValue == null) {
                                android.util.Log.d("SuperTrace", "Native ping failed, using isReachable")
                                if (targetAddress.isReachable(1000)) {
                                    rttValue = (System.nanoTime() - startTime) / 1_000_000.0
                                    outputString = "isReachable fallback"
                                }
                            }
                        }
                    } catch (e: Exception) {
                        outputString = "Probe failed: ${e.message}"
                    }

                    val finalRtt = rttValue
                    if (finalRtt != null && finalRtt > 0.0) {
                        result.putDouble("rtt", finalRtt)
                        received++
                        totalRtt += finalRtt
                        if (finalRtt < minRtt) minRtt = finalRtt
                        if (finalRtt > maxRtt) maxRtt = finalRtt
                    } else {
                        result.putNull("rtt")
                        result.putString("error", outputString.take(100))
                    }

                    results.pushMap(result)
                    if (seq < count) delay(300)
                }

                val summary = Arguments.createMap()
                summary.putInt("sent", count)
                summary.putInt("received", received)
                summary.putInt("lost", count - received)
                summary.putDouble("lossPercent", (count - received).toDouble() / count * 100.0)
                summary.putDouble("minRtt", if (received > 0) minRtt else 0.0)
                summary.putDouble("avgRtt", if (received > 0) totalRtt / received else 0.0)
                summary.putDouble("maxRtt", maxRtt)
                summary.putArray("results", results)

                promise.resolve(summary)
            } catch (e: Exception) {
                promise.reject("PING_ERROR", e.message)
            }
        }
    }

    private fun probeHop(target: InetAddress, ttl: Int, timeoutMs: Int): WritableNativeMap {
        val result = WritableNativeMap()
        result.putInt("hop", ttl)

        val rttValues = DoubleArray(3) { -1.0 }
        var hopIp: String? = null

        // 3 probes per hop. Each probe uses a fresh socket pair so we can
        // parallelise across hops without responses cross-contaminating.
        for (probe in 0 until 3) {
            val (ip, rtt) = sendProbe(target, ttl, timeoutMs)
            if (ip != null) {
                hopIp = ip
                if (rtt != null) rttValues[probe] = rtt
            }
        }

        if (hopIp != null) {
            result.putString("ip", hopIp)
        } else {
            result.putNull("ip")
        }

        for (i in 0 until 3) {
            val rtt = rttValues[i]
            if (rtt >= 0) result.putDouble("rtt${i + 1}", rtt)
            else result.putNull("rtt${i + 1}")
        }

        result.putBoolean("done", hopIp == target.hostAddress)
        return result
    }

    /**
     * One traceroute probe: send an ICMP Echo Request with TTL=ttl on an
     * unprivileged ICMP datagram socket. Linux delivers two kinds of
     * responses to that socket:
     *
     *   - ICMP Time Exceeded (type 11) from a mid-path router whose decrement
     *     hit 0. The fromAddr on recvfrom is the router's IP — that's the hop.
     *   - ICMP Echo Reply (type 0) from the destination once TTL is large
     *     enough to actually arrive. fromAddr is the destination IP.
     *
     * Why ICMP and not UDP-with-ICMP-recv: an unprivileged ICMP datagram
     * socket only demuxes responses that match its own outgoing requests.
     * UDP-out + ICMP-in (the classic raw-socket traceroute pattern) needs
     * CAP_NET_RAW, which apps never have on Android.
     *
     * Why this works on Android specifically: /proc/sys/net/ipv4/ping_group_range
     * defaults to "0 2147483647" — every app gid is allowed to open
     * SOCK_DGRAM+IPPROTO_ICMP. The kernel attaches the socket to the request
     * via its ID field and routes both Echo Replies AND in-transit
     * Time Exceeded back to it.
     *
     * The previous implementation shelled out to `ping -t <ttl>`, which
     * silently failed because Android's toybox ping interprets `-t` as
     * timeout (BSD-style) instead of TTL (iputils-style). Every probe
     * arrived at the destination with default TTL=64, so traceroute
     * appeared to terminate at hop 1.
     */
    private fun sendProbe(target: InetAddress, ttl: Int, timeoutMs: Int): Pair<String?, Double?> {
        if (target !is Inet4Address) {
            // IPv6 traceroute would need IPV6_UNICAST_HOPS + ICMPv6 — out of scope.
            return Pair(null, null)
        }

        var fd: FileDescriptor? = null
        try {
            fd = Os.socket(OsConstants.AF_INET, OsConstants.SOCK_DGRAM, OsConstants.IPPROTO_ICMP)
            // OsConstants.IP_TTL was only made public in newer SDKs; the Linux
            // uapi value (2) has been stable since the kernel's 1.0 days.
            Os.setsockoptInt(fd, OsConstants.IPPROTO_IP, IP_TTL_OPT, ttl)
            Os.setsockoptTimeval(
                fd, OsConstants.SOL_SOCKET, OsConstants.SO_RCVTIMEO,
                StructTimeval.fromMillis(timeoutMs.toLong())
            )
            // The unprivileged ICMP socket is "connected" to a kernel-assigned
            // ID by binding; without bind, sendto silently drops the packet.
            Os.bind(fd, InetAddress.getByName("0.0.0.0"), 0)

            // Build a minimal ICMP Echo Request. The kernel rewrites the ID
            // field to its own assignment regardless of what we put — so we
            // don't need to track it ourselves. Sequence is up to us.
            val seq = (ttl shl 8) or (probeSeq.incrementAndGet() and 0xFF)
            val packet = buildIcmpEcho(seq)

            val startNs = System.nanoTime()
            Os.sendto(fd, packet, 0, packet.size, 0, target, 0)

            val recvBuf = ByteArray(1500)
            val srcOut = InetSocketAddress(0)
            val received = Os.recvfrom(fd, recvBuf, 0, recvBuf.size, 0, srcOut)
            val rttMs = (System.nanoTime() - startNs) / 1_000_000.0

            if (received <= 0) return Pair(null, null)
            val srcIp = srcOut.address?.hostAddress ?: return Pair(null, null)
            return Pair(srcIp, rttMs)
        } catch (e: ErrnoException) {
            // EAGAIN / EWOULDBLOCK on recvfrom = SO_RCVTIMEO fired = no
            // response for this TTL within the budget. That's a normal
            // "* * *" hop, not an error.
            return Pair(null, null)
        } catch (e: Exception) {
            android.util.Log.w("SuperTrace", "probe ttl=$ttl failed: ${e.message}")
            return Pair(null, null)
        } finally {
            try { fd?.let { Os.close(it) } } catch (_: Exception) {}
        }
    }

    /**
     * Construct an 8-byte ICMP Echo Request header.
     *   type=8, code=0, checksum, id=0 (kernel rewrites), seq=seq
     * No payload — the kernel doesn't care and routers don't either.
     */
    private fun buildIcmpEcho(seq: Int): ByteArray {
        val pkt = ByteArray(8)
        pkt[0] = 8        // type: Echo Request
        pkt[1] = 0        // code
        pkt[2] = 0; pkt[3] = 0   // checksum (filled in below)
        pkt[4] = 0; pkt[5] = 0   // id — kernel overwrites for unprivileged ICMP socket
        pkt[6] = ((seq shr 8) and 0xFF).toByte()
        pkt[7] = (seq and 0xFF).toByte()

        // RFC 1071 internet checksum
        var sum = 0
        var i = 0
        while (i < pkt.size - 1) {
            val word = ((pkt[i].toInt() and 0xFF) shl 8) or (pkt[i + 1].toInt() and 0xFF)
            sum += word
            i += 2
        }
        while ((sum shr 16) != 0) sum = (sum and 0xFFFF) + (sum shr 16)
        val checksum = sum.inv() and 0xFFFF
        pkt[2] = ((checksum shr 8) and 0xFF).toByte()
        pkt[3] = (checksum and 0xFF).toByte()
        return pkt
    }

    private fun sendHopResult(result: WritableNativeMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_HOP_RESULT, result)
    }

    private fun sendComplete() {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_TRACE_COMPLETE, null)
    }

    private fun sendError(message: String) {
        val params = WritableNativeMap()
        params.putString("error", message)
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_TRACE_ERROR, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for event emitter
    }
}
