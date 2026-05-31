package me.treexhd.supertrace.traceroute

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkInfo
import android.net.RouteInfo
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.net.InetAddress
import java.util.concurrent.TimeUnit
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
        private const val TAG = "SuperTraceTraceroute"

        // IPv4 dotted quad after a "from" keyword.
        private val FROM_PATTERN_V4 = Regex("""[Ff]rom\s+([0-9]{1,3}(?:\.[0-9]{1,3}){3})""")
        // IPv6 address after a "from" keyword (e.g. "From 2001:db8::1" or "from 2001:db8::1:")
        private val FROM_PATTERN_V6 = Regex("""[Ff]rom\s+([0-9a-fA-F:]+(?::[0-9a-fA-F]+)+)""")
        // Round-trip time on Echo Reply lines.
        private val RTT_PATTERN = Regex("""time[=<]\s*([\d.]+)\s*ms""")
    }

    override fun getName(): String = NAME

    private var tracerouteJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

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
                // Concurrency = 4. Higher than this and parallel `ping`
                // shells contend for CPU enough to inflate the RTT readings
                // (we saw ~45ms hops at 8-way parallel that were really 5ms).
                // Lower than this (we tried 1) and a single ping-blocked
                // router stalls the whole list for the full -W timeout
                // every time. 4 is the sweet spot: blocked hops still cost
                // 5s each but they don't stall responsive ones behind them,
                // and direct-ping timing stays honest.
                val semaphore = Semaphore(4)

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
     * Resolve every DNS server the OS would consult right now.
     *
     * Strategy mirrors `besttrace`'s DnsServersDetector chain (the de-facto
     * reference for "give me the real LTE/WiFi DNS"): walk every connected
     * network, classify by default-route presence so primary resolvers come
     * first, group results by transport so the UI can render "WiFi:..."
     * and "Cellular:..." separately, then fall back to `getprop` parsing
     * for OEMs that hide DNS from sandboxed apps.
     *
     * Result shape:
     *   {
     *     servers: ["1.1.1.1", ...],            // union, default-route first
     *     transport: "wifi" | "cellular" | ...,  // active network's transport
     *     privateDnsActive: bool,
     *     privateDnsServer: string | null,
     *     perTransport: {                        // detailed per-network split
     *       wifi: [...], cellular: [...], ethernet: [...], vpn: [...], other: [...]
     *     }
     *   }
     */
    @ReactMethod
    fun getSystemDnsServers(promise: Promise) {
        scope.launch {
            try {
                val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
                    as? ConnectivityManager

                // Active network's transport — used by the UI as the headline
                // ("System DNS · WIFI"). Independent of the per-transport map.
                val activeTransport = cm?.activeNetwork?.let { transportName(cm, it) } ?: "unknown"

                // Phase 1: enumerate every connected network and bucket DNS
                // servers by transport + default-route. Default-route networks
                // are what the OS would actually resolve through, so we
                // surface them as the primary list.
                val perTransport = LinkedHashMap<String, MutableList<String>>()
                val primary = mutableListOf<String>()   // default-route networks
                val secondary = mutableListOf<String>() // others (peer / niche routes)
                var privateDnsActive = false
                var privateDnsServer: String? = null

                if (cm != null) {
                    val networks: Array<Network> = try { cm.allNetworks } catch (e: Exception) {
                        emptyArray()
                    }
                    for (network in networks) {
                        val info: NetworkInfo? = try { cm.getNetworkInfo(network) } catch (e: Exception) { null }
                        if (info == null || !info.isConnected) continue

                        val lp: LinkProperties = cm.getLinkProperties(network) ?: continue
                        val transport = transportName(cm, network)
                        val isDefault = lp.routes.any { it.isDefaultRoute }

                        val ips = lp.dnsServers.mapNotNull { it.hostAddress }
                        val bucket = perTransport.getOrPut(transport) { mutableListOf() }
                        for (ip in ips) {
                            if (ip !in bucket) bucket.add(ip)
                            val target = if (isDefault) primary else secondary
                            if (ip !in target) target.add(ip)
                        }

                        // Private DNS (DoT) — surface from whichever network has it on.
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !privateDnsActive) {
                            if (lp.isPrivateDnsActive) {
                                privateDnsActive = true
                                privateDnsServer = lp.privateDnsServerName
                            }
                        }
                    }
                }

                // Mirror besttrace: if no default-route network gave anything,
                // fall back to the secondary bucket so something shows up.
                val combined = if (primary.isNotEmpty()) primary else secondary

                // Phase 2: getprop fallback. Some OEM ROMs return empty
                // dnsServers from ConnectivityManager for sandboxed apps as
                // a privacy measure — `getprop` still leaks the per-radio
                // properties (`net.rmnet0.dns1`, `vendor.net.dns1`, etc.).
                val finalCombined = if (combined.isEmpty()) {
                    val viaProp = readDnsViaGetprop()
                    if (viaProp.isNotEmpty() && perTransport.isEmpty()) {
                        // Couldn't classify by transport, so park it under
                        // "other" so the UI still shows something useful.
                        perTransport["other"] = viaProp.toMutableList()
                    }
                    viaProp
                } else combined

                promise.resolve(
                    buildDnsResult(finalCombined, privateDnsServer, activeTransport, privateDnsActive, perTransport)
                )
            } catch (e: Exception) {
                android.util.Log.w("SuperTrace", "getSystemDnsServers failed: ${e.message}")
                promise.resolve(buildDnsResult(emptyList(), null, "unknown", false, emptyMap()))
            }
        }
    }

    private fun transportName(cm: ConnectivityManager, network: Network): String {
        val caps: NetworkCapabilities? = try { cm.getNetworkCapabilities(network) } catch (e: Exception) { null }
        return when {
            caps == null -> "unknown"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
            else -> "other"
        }
    }

    /**
     * Parse `getprop` output for any property whose key ends with `.dns`,
     * `.dns1`, `.dns2`, `.dns3`, or `.dns4` and whose value is a valid IP.
     *
     * Modern ROMs put cellular DNS under vendor-prefixed keys like
     * `net.rmnet0.dns1` or `vendor.net.dns1`, which is why we match by
     * suffix instead of looking for the bare `net.dns1`. Same approach
     * besttrace uses (DnsServersDetector.f).
     */
    private fun readDnsViaGetprop(): List<String> {
        val out = LinkedHashSet<String>()
        try {
            val proc = ProcessBuilder("getprop").redirectErrorStream(true).start()
            proc.inputStream.bufferedReader().use { reader ->
                while (true) {
                    val line = reader.readLine() ?: break
                    // getprop format: "[key]: [value]"
                    val keyEnd = line.indexOf("]: [")
                    if (keyEnd <= 1) continue
                    val key = line.substring(1, keyEnd)
                    val valueEnd = line.length - 1
                    val valueStart = keyEnd + 4
                    if (valueEnd < valueStart) continue
                    val value = line.substring(valueStart, valueEnd)
                    if (value.isEmpty()) continue
                    if (!(key.endsWith(".dns") || key.endsWith(".dns1")
                                || key.endsWith(".dns2") || key.endsWith(".dns3")
                                || key.endsWith(".dns4"))) continue
                    // Validate — getprop sometimes contains stale or malformed
                    // entries. Only keep things that parse as a real IP.
                    try {
                        val addr = java.net.InetAddress.getByName(value)
                        val host = addr.hostAddress
                        if (!host.isNullOrEmpty() && host != "0.0.0.0" && host != "::") {
                            out.add(host)
                        }
                    } catch (_: Exception) { /* not an IP */ }
                }
            }
            proc.waitFor()
        } catch (e: Exception) {
            android.util.Log.v(TAG, "getprop DNS fallback failed: ${e.message}")
        }
        return out.toList()
    }

    private fun buildDnsResult(
        servers: List<String>,
        privateDnsServer: String?,
        transport: String,
        privateDnsActive: Boolean,
        perTransport: Map<String, List<String>>
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
        val perTransportMap = Arguments.createMap()
        for ((t, ips) in perTransport) {
            val a = Arguments.createArray()
            for (ip in ips) a.pushString(ip)
            perTransportMap.putArray(t, a)
        }
        map.putMap("perTransport", perTransportMap)
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
                            val ip = targetAddress.hostAddress ?: ""

                            val commandPool = if (isIPv6(targetAddress)) {
                                listOf(
                                    arrayOf("ping6", "-c", "1", "-W", "1", ip),
                                    arrayOf("/system/bin/ping6", "-c", "1", "-W", "2", ip),
                                    arrayOf("ping", "-6", "-c", "1", "-W", "1", ip)
                                )
                            } else {
                                listOf(
                                    arrayOf("ping", "-c", "1", "-W", "1", ip),
                                    arrayOf("/system/bin/ping", "-c", "1", "-W", "2", ip),
                                    arrayOf("ping", "-c", "1", "-w", "1", ip)
                                )
                            }

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

        // Phase 1: TTL discovery — find which router is at this hop.
        val (hopIp, ttlRtts, parsedAtTtl) = pingTtlDiscover(target, ttl, timeoutMs)
        if (hopIp == null) {
            result.putNull("ip")
            for (i in 0 until 3) result.putNull("rtt${i + 1}")
            result.putBoolean("done", false)
            return result
        }

        // Emit a partial result NOW so the row appears with IP + "—" RTTs
        // before we go off and do the direct ping. Otherwise hops that
        // block direct ping for the full 5s timeout don't show up at all
        // until the timeout, even though we already know their IP.
        val partial = WritableNativeMap().apply {
            putInt("hop", ttl)
            putString("ip", hopIp)
            for (i in 0 until 3) putNull("rtt${i + 1}")
            putBoolean("done", hopIp == target.hostAddress)
        }
        sendHopResult(partial)

        result.putString("ip", hopIp)

        // Phase 2: accurate RTT. If discovery already saw a kernel-printed
        // Echo Reply (we hit the destination at this TTL), reuse those —
        // they're real. Otherwise direct-ping the discovered IP and stream
        // each probe back to the UI as it lands, so the user sees rtt1
        // appear, then rtt2, then rtt3 instead of three at once.
        val finalRtts = DoubleArray(3) { -1.0 }
        if (parsedAtTtl) {
            for (i in 0 until 3) ttlRtts.getOrNull(i)?.let { finalRtts[i] = it }
        } else {
            pingDirectStreaming(hopIp, timeoutMs) { idx, rttMs ->
                if (idx in 0..2 && rttMs != null && rttMs >= 0) {
                    finalRtts[idx] = rttMs
                    // Emit a fresh snapshot after every probe.
                    val snapshot = WritableNativeMap().apply {
                        putInt("hop", ttl)
                        putString("ip", hopIp)
                        for (i in 0 until 3) {
                            if (finalRtts[i] >= 0) putDouble("rtt${i + 1}", finalRtts[i])
                            else putNull("rtt${i + 1}")
                        }
                        putBoolean("done", hopIp == target.hostAddress)
                    }
                    sendHopResult(snapshot)
                }
            }
        }

        for (i in 0 until 3) {
            val rtt = finalRtts[i]
            if (rtt >= 0) result.putDouble("rtt${i + 1}", rtt)
            else result.putNull("rtt${i + 1}")
        }

        result.putBoolean("done", hopIp == target.hostAddress)
        return result
    }

    private fun isIPv6(address: InetAddress): Boolean {
        return address is java.net.Inet6Address
    }

    /**
     * Discovery probe — fire `ping -c 1 -t TTL <target>` (or ping6 for IPv6)
     * and parse the "From X" line to identify the router at this TTL.
     *
     * Single probe (-c 1) is intentional: discovery only needs the hop IP,
     * not timing. Going to -c 3 here was costing ~3× wall-clock per hop
     * for no benefit — the accurate RTT comes from `pingDirect` afterwards.
     *
     * Returns (hopIp, rtts, parsed): if `parsed` is true the rtts came
     * from a kernel Echo Reply (we already hit the destination at this
     * TTL — accurate); otherwise rtts is empty and the caller should
     * direct-ping the discovered IP for real timing.
     */
    private fun pingTtlDiscover(
        target: InetAddress,
        ttl: Int,
        timeoutMs: Int
    ): Triple<String?, List<Double?>, Boolean> {
        val timeoutSec = (timeoutMs / 1000).coerceAtLeast(1).toString()
        val targetIp = target.hostAddress ?: return Triple(null, emptyList(), false)
        val isV6 = isIPv6(target)

        val variants = if (isV6) {
            listOf(
                arrayOf("ping6", "-c", "1", "-t", ttl.toString(), "-W", timeoutSec, targetIp),
                arrayOf("ping6", "-c", "1", "-h", ttl.toString(), "-W", timeoutSec, targetIp),
                arrayOf("/system/bin/ping6", "-c", "1", "-t", ttl.toString(), "-W", timeoutSec, targetIp),
                arrayOf("ping", "-6", "-c", "1", "-t", ttl.toString(), "-W", timeoutSec, targetIp)
            )
        } else {
            listOf(
                arrayOf("ping", "-c", "1", "-t", ttl.toString(), "-W", timeoutSec, targetIp),
                arrayOf("/system/bin/ping", "-c", "1", "-t", ttl.toString(), "-W", timeoutSec, targetIp)
            )
        }

        val fromPattern = if (isV6) FROM_PATTERN_V6 else FROM_PATTERN_V4

        for (cmd in variants) {
            try {
                val proc = ProcessBuilder(*cmd).redirectErrorStream(true).start()
                val output = proc.inputStream.bufferedReader().use { it.readText() }
                val finished = proc.waitFor(timeoutMs.toLong() + 2000, TimeUnit.MILLISECONDS)
                if (!finished) proc.destroyForcibly()

                if (output.isEmpty()) continue
                val firstFrom = fromPattern.find(output) ?: continue
                val ip = firstFrom.groupValues[1]
                val parsedRtts = RTT_PATTERN.findAll(output)
                    .mapNotNull { it.groupValues[1].toDoubleOrNull() }
                    .toList()
                val rttList: List<Double?> = (0 until 3).map { parsedRtts.getOrNull(it) }

                android.util.Log.d(TAG, "discover ttl=$ttl ip=$ip parsed=${parsedRtts.size}")
                return Triple(ip, rttList, parsedRtts.isNotEmpty())
            } catch (e: Exception) {
                android.util.Log.v(TAG, "discover variant failed (ttl=$ttl): ${e.message}")
                continue
            }
        }
        return Triple(null, emptyList(), false)
    }

    /**
     * Direct ping to a known hop IP — no TTL restriction, so we get real
     * Echo Replies with kernel-printed RTT.
     *
     * Streams probe results back through `onProbe(idx, rttMs)` as each
     * `time=X ms` line is read from ping's stdout. This means flaky hops
     * (where probe 1 succeeds but 2 and 3 hang on -W timeout) still
     * surface their first reading immediately rather than blocking the
     * whole row for ~5s. `idx` is 0-based; rttMs is null when ping never
     * answered for that probe (the caller can choose how to render it).
     *
     * 3 probes at 200ms intervals = ~600ms wall-clock per hop in the
     * happy path; up to ~3× -W when probes drop.
     */
    private fun pingDirectStreaming(
        hopIp: String,
        timeoutMs: Int,
        onProbe: (idx: Int, rttMs: Double?) -> Unit
    ) {
        val timeoutSec = (timeoutMs / 1000).coerceAtLeast(1).toString()
        val isV6 = hopIp.contains(':')

        val variants = if (isV6) {
            listOf(
                arrayOf("ping6", "-c", "3", "-i", "0.2", "-W", timeoutSec, hopIp),
                arrayOf("/system/bin/ping6", "-c", "3", "-i", "0.2", "-W", timeoutSec, hopIp),
                arrayOf("ping", "-6", "-c", "3", "-i", "0.2", "-W", timeoutSec, hopIp)
            )
        } else {
            listOf(
                arrayOf("ping", "-c", "3", "-i", "0.2", "-W", timeoutSec, hopIp),
                arrayOf("/system/bin/ping", "-c", "3", "-i", "0.2", "-W", timeoutSec, hopIp)
            )
        }

        for (cmd in variants) {
            try {
                val proc = ProcessBuilder(*cmd).redirectErrorStream(true).start()
                var emitted = 0
                proc.inputStream.bufferedReader().use { reader ->
                    while (true) {
                        val line = reader.readLine() ?: break
                        val m = RTT_PATTERN.find(line)
                        if (m != null) {
                            val rtt = m.groupValues[1].toDoubleOrNull()
                            if (rtt != null && emitted < 3) {
                                onProbe(emitted, rtt)
                                emitted++
                            }
                        }
                    }
                }
                val finished = proc.waitFor(timeoutMs.toLong() * 3 + 3000, TimeUnit.MILLISECONDS)
                if (!finished) proc.destroyForcibly()

                while (emitted < 3) {
                    onProbe(emitted, null)
                    emitted++
                }

                android.util.Log.d(TAG, "direct $hopIp emitted=$emitted")
                return
            } catch (e: Exception) {
                android.util.Log.v(TAG, "direct ping variant failed: ${e.message}")
                continue
            }
        }
        for (i in 0 until 3) onProbe(i, null)
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
