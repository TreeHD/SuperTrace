package me.treexhd.supertrace.traceroute

import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import java.net.InetAddress

class ReverseDnsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ReverseDnsModule"
    }

    override fun getName(): String = NAME

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @ReactMethod
    fun reverseLookup(ip: String, promise: Promise) {
        scope.launch {
            try {
                val address = InetAddress.getByName(ip)
                val fqdn = address.canonicalHostName

                // If canonicalHostName returns the IP itself, it means no PTR record was found
                if (fqdn == ip || fqdn == address.hostAddress) {
                    promise.resolve(null)
                } else {
                    promise.resolve(fqdn)
                }
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
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
