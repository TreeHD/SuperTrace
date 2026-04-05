package me.treexhd.supertrace.traceroute

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class TraceroutePackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return when (name) {
            TracerouteModule.NAME -> TracerouteModule(reactContext)
            ReverseDnsModule.NAME -> ReverseDnsModule(reactContext)
            else -> null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                TracerouteModule.NAME to ReactModuleInfo(
                    TracerouteModule.NAME,
                    TracerouteModule.NAME,
                    false,  // canOverrideExistingModule
                    false,  // needsEagerInit
                    false,  // isCxxModule
                    false    // isTurboModule
                ),
                ReverseDnsModule.NAME to ReactModuleInfo(
                    ReverseDnsModule.NAME,
                    ReverseDnsModule.NAME,
                    false,
                    false,
                    false,
                    false
                )
            )
        }
    }
}
