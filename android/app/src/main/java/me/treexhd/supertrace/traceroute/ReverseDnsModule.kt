package me.treexhd.supertrace.traceroute

import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicInteger

class ReverseDnsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ReverseDnsModule"
        private const val TAG = "SuperTraceRDNS"

        // Public recursive resolvers, ordered by reliability/speed.
        // First match wins; we walk the list per-IP until one answers.
        private val DNS_SERVERS = listOf(
            "1.1.1.1",       // Cloudflare
            "8.8.8.8",       // Google
            "9.9.9.9",       // Quad9
            "1.0.0.1",       // Cloudflare secondary
            "8.8.4.4",       // Google secondary
            "208.67.222.222" // OpenDNS
        )

        private const val DNS_PORT = 53
        // 1500ms per server attempt — tight enough to fall through quickly,
        // generous enough for high-latency mobile links.
        private const val PER_SERVER_TIMEOUT_MS = 1500
        // Hard ceiling per IP across all servers + retries.
        private const val TOTAL_TIMEOUT_MS = 6000
        // Limit concurrent in-flight raw UDP queries so we don't flood the radio.
        private const val MAX_CONCURRENT = 12
    }

    override fun getName(): String = NAME

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val txIdCounter = AtomicInteger((Math.random() * 65535).toInt())
    private val gate = Semaphore(MAX_CONCURRENT)

    @ReactMethod
    fun reverseLookup(ip: String, promise: Promise) {
        scope.launch {
            try {
                val fqdn = withTimeoutOrNull(TOTAL_TIMEOUT_MS.toLong()) {
                    gate.withPermit { performLookup(ip) }
                }
                promise.resolve(fqdn)
            } catch (e: Exception) {
                android.util.Log.w(TAG, "reverseLookup($ip) failed: ${e.message}")
                promise.resolve(null)
            }
        }
    }

    /**
     * Batch lookup — accepts an array of IPs and returns a map { ip: fqdn|null }.
     * Internally throttled by the same semaphore so it can't drown the network.
     */
    @ReactMethod
    fun reverseLookupBatch(ips: ReadableArray, promise: Promise) {
        scope.launch {
            try {
                val ipList = (0 until ips.size()).mapNotNull { ips.getString(it) }
                val results = WritableNativeMap()
                val mutex = kotlinx.coroutines.sync.Mutex()

                coroutineScope {
                    ipList.map { ip ->
                        async {
                            val fqdn = withTimeoutOrNull(TOTAL_TIMEOUT_MS.toLong()) {
                                gate.withPermit { performLookup(ip) }
                            }
                            mutex.lock()
                            try {
                                if (fqdn != null) results.putString(ip, fqdn)
                                else results.putNull(ip)
                            } finally {
                                mutex.unlock()
                            }
                        }
                    }.awaitAll()
                }
                promise.resolve(results)
            } catch (e: Exception) {
                android.util.Log.w(TAG, "reverseLookupBatch failed: ${e.message}")
                promise.resolve(WritableNativeMap())
            }
        }
    }

    /**
     * Try every DNS server in order. First non-empty PTR wins.
     * Each server gets one shot; a NOERROR-with-empty-answer is treated as
     * "no PTR record" and short-circuits — we don't keep asking other servers
     * for an answer that doesn't exist.
     */
    private suspend fun performLookup(ip: String): String? {
        val arpaName = buildArpaName(ip) ?: return null

        for (server in DNS_SERVERS) {
            val outcome = queryPtr(server, arpaName)
            when (outcome) {
                is PtrOutcome.Found -> return outcome.name
                is PtrOutcome.NoRecord -> return null  // authoritative "doesn't exist"
                is PtrOutcome.Failed -> continue       // try next server
            }
        }
        return null
    }

    private sealed class PtrOutcome {
        data class Found(val name: String) : PtrOutcome()
        object NoRecord : PtrOutcome()
        object Failed : PtrOutcome()
    }

    private suspend fun queryPtr(server: String, arpaName: String): PtrOutcome =
        withContext(Dispatchers.IO) {
            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket()
                socket.soTimeout = PER_SERVER_TIMEOUT_MS

                val txId = (txIdCounter.incrementAndGet() and 0xFFFF)
                val query = buildPtrQuery(txId, arpaName)
                val serverAddr = InetAddress.getByName(server)
                val sendPacket = DatagramPacket(query, query.size, serverAddr, DNS_PORT)
                socket.send(sendPacket)

                val buf = ByteArray(512)
                val recvPacket = DatagramPacket(buf, buf.size)
                socket.receive(recvPacket)

                parsePtrResponse(buf, recvPacket.length, txId)
            } catch (e: Exception) {
                PtrOutcome.Failed
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }

    /**
     * Translate "1.2.3.4" → "4.3.2.1.in-addr.arpa"
     * or IPv6 "2001:db8::1" → 32 reversed nibbles + ".ip6.arpa"
     */
    private fun buildArpaName(ip: String): String? {
        return try {
            val addr = InetAddress.getByName(ip)
            val bytes = addr.address
            when (bytes.size) {
                4 -> bytes.reversed().joinToString(".") { (it.toInt() and 0xFF).toString() } + ".in-addr.arpa"
                16 -> {
                    val sb = StringBuilder()
                    for (i in 15 downTo 0) {
                        val b = bytes[i].toInt() and 0xFF
                        sb.append(Integer.toHexString(b and 0x0F)).append('.')
                        sb.append(Integer.toHexString((b shr 4) and 0x0F)).append('.')
                    }
                    sb.append("ip6.arpa")
                    sb.toString()
                }
                else -> null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun buildPtrQuery(txId: Int, arpaName: String): ByteArray {
        val labels = arpaName.split('.').filter { it.isNotEmpty() }
        // 12 byte header + sum(label_len + label) + 1 (root) + 4 (type+class)
        val size = 12 + labels.sumOf { it.length + 1 } + 1 + 4
        val buf = ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN)

        // Header: txId, flags=0x0100 (standard query, RD set), QD=1, AN=0, NS=0, AR=0
        buf.putShort(txId.toShort())
        buf.putShort(0x0100.toShort())
        buf.putShort(1)
        buf.putShort(0)
        buf.putShort(0)
        buf.putShort(0)

        // Question: QNAME
        for (label in labels) {
            val bytes = label.toByteArray(Charsets.US_ASCII)
            buf.put(bytes.size.toByte())
            buf.put(bytes)
        }
        buf.put(0.toByte()) // root

        // QTYPE=PTR(12), QCLASS=IN(1)
        buf.putShort(12)
        buf.putShort(1)

        return buf.array()
    }

    private fun parsePtrResponse(buf: ByteArray, len: Int, expectedTxId: Int): PtrOutcome {
        if (len < 12) return PtrOutcome.Failed

        val bb = ByteBuffer.wrap(buf, 0, len).order(ByteOrder.BIG_ENDIAN)
        val txId = bb.short.toInt() and 0xFFFF
        if (txId != expectedTxId) return PtrOutcome.Failed

        val flags = bb.short.toInt() and 0xFFFF
        val rcode = flags and 0x000F
        val qdCount = bb.short.toInt() and 0xFFFF
        val anCount = bb.short.toInt() and 0xFFFF

        // Skip questions
        var pos = 12
        for (i in 0 until qdCount) {
            pos = skipName(buf, pos, len)
            if (pos < 0 || pos + 4 > len) return PtrOutcome.Failed
            pos += 4 // QTYPE + QCLASS
        }

        // rcode 3 = NXDOMAIN, treat as authoritative "no record"
        if (rcode == 3) return PtrOutcome.NoRecord
        if (rcode != 0) return PtrOutcome.Failed
        if (anCount == 0) return PtrOutcome.NoRecord

        // Walk answer records, return the first PTR
        for (i in 0 until anCount) {
            pos = skipName(buf, pos, len)
            if (pos < 0 || pos + 10 > len) return PtrOutcome.Failed
            val rrType = ((buf[pos].toInt() and 0xFF) shl 8) or (buf[pos + 1].toInt() and 0xFF)
            val rdLength = ((buf[pos + 8].toInt() and 0xFF) shl 8) or (buf[pos + 9].toInt() and 0xFF)
            pos += 10

            if (pos + rdLength > len) return PtrOutcome.Failed

            if (rrType == 12) { // PTR
                val name = readName(buf, pos, len) ?: return PtrOutcome.Failed
                val cleaned = name.trimEnd('.')
                return if (cleaned.isEmpty()) PtrOutcome.NoRecord else PtrOutcome.Found(cleaned)
            }
            pos += rdLength
        }
        return PtrOutcome.NoRecord
    }

    /** Skip a (possibly compressed) DNS name. Returns the offset past the name, or -1 on error. */
    private fun skipName(buf: ByteArray, start: Int, len: Int): Int {
        var pos = start
        while (pos < len) {
            val b = buf[pos].toInt() and 0xFF
            if (b == 0) return pos + 1
            if ((b and 0xC0) == 0xC0) {
                // pointer — consumes 2 bytes total
                if (pos + 2 > len) return -1
                return pos + 2
            }
            pos += 1 + b
        }
        return -1
    }

    /**
     * Read a DNS name starting at `start`, following compression pointers.
     * Returns the dotted name, or null on malformed input.
     */
    private fun readName(buf: ByteArray, start: Int, len: Int): String? {
        val sb = StringBuilder()
        var pos = start
        var jumped = false
        var hops = 0
        // Cap pointer chasing to defeat malformed loops.
        val maxHops = 32

        while (pos < len) {
            if (hops > maxHops) return null
            val b = buf[pos].toInt() and 0xFF
            if (b == 0) {
                if (!jumped) pos += 1
                break
            }
            if ((b and 0xC0) == 0xC0) {
                if (pos + 1 >= len) return null
                val pointer = ((b and 0x3F) shl 8) or (buf[pos + 1].toInt() and 0xFF)
                if (pointer >= len) return null
                pos = pointer
                jumped = true
                hops++
                continue
            }
            // length-prefixed label
            if (pos + 1 + b > len) return null
            if (sb.isNotEmpty()) sb.append('.')
            sb.append(String(buf, pos + 1, b, Charsets.US_ASCII))
            pos += 1 + b
        }
        return sb.toString()
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
