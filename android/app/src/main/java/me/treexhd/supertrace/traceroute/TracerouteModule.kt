package me.treexhd.supertrace.traceroute

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
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

        val rttValues = mutableListOf<Double>()
        var hopIp: String? = null

        // Send 3 probes per hop
        for (probe in 0 until 3) {
            try {
                val socket = DatagramSocket()
                socket.soTimeout = timeoutMs

                // Set TTL
                val channel = socket.channel
                if (channel != null) {
                    channel.setOption(java.net.StandardSocketOptions.IP_MULTICAST_TTL, ttl)
                }

                // For DatagramSocket, use connect approach with TTL
                // We'll use a different approach - use InetAddress.isReachable with TTL
                val startTime = System.nanoTime()

                try {
                    // Create a UDP packet to a high port
                    val port = 33434 + ttl
                    val data = ByteArray(32) { 0 }
                    val packet = DatagramPacket(data, data.size, target, port)

                    // We need to set TTL via socket options
                    val rawSocket = DatagramSocket()
                    rawSocket.soTimeout = timeoutMs

                    // Use TrafficClass to manipulate - actually on Android
                    // the best approach is using the socket's underlying impl

                    // Simplified approach: use Process to run ping with TTL
                    val process = Runtime.getRuntime().exec(
                        arrayOf("ping", "-c", "1", "-t", ttl.toString(), "-W",
                            (timeoutMs / 1000).coerceAtLeast(1).toString(),
                            target.hostAddress)
                    )

                    val output = process.inputStream.bufferedReader().readText()
                    val errorOutput = process.errorStream.bufferedReader().readText()
                    process.waitFor()

                    val endTime = System.nanoTime()
                    val rtt = (endTime - startTime) / 1_000_000.0

                    // Parse the output to find the responding IP
                    // Typical output: "From 192.168.1.1 icmp_seq=1 Time to live exceeded"
                    // Or: "64 bytes from 8.8.8.8: icmp_seq=1 ttl=119 time=5.23 ms"
                    val fromPattern = Regex("""[Ff]rom\s+([\d.]+|[0-9a-fA-F:]+)""")
                    val timePattern = Regex("""time[=<]\s*([\d.]+)\s*ms""")

                    val fromMatch = fromPattern.find(output) ?: fromPattern.find(errorOutput)
                    val timeMatch = timePattern.find(output)

                    if (fromMatch != null) {
                        hopIp = fromMatch.groupValues[1]
                        val parsedRtt = timeMatch?.groupValues?.get(1)?.toDoubleOrNull() ?: rtt
                        rttValues.add(parsedRtt)
                    } else {
                        rttValues.add(-1.0) // Timeout
                    }

                    rawSocket.close()
                } catch (e: SocketTimeoutException) {
                    rttValues.add(-1.0)
                } catch (e: Exception) {
                    rttValues.add(-1.0)
                }

                socket.close()
            } catch (e: Exception) {
                rttValues.add(-1.0)
            }
        }

        if (hopIp != null) {
            result.putString("ip", hopIp)
        } else {
            result.putNull("ip")
        }

        // Set RTT values
        for (i in 0 until 3) {
            val rtt = rttValues.getOrNull(i) ?: -1.0
            if (rtt >= 0) {
                result.putDouble("rtt${i + 1}", rtt)
            } else {
                result.putNull("rtt${i + 1}")
            }
        }

        result.putBoolean("done", hopIp == target.hostAddress)

        return result
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
