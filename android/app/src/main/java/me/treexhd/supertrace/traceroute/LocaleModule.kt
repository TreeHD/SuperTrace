package me.treexhd.supertrace.traceroute

import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.facebook.react.bridge.*
import java.util.Locale

/**
 * Per-app language switcher.
 *
 * `AppCompatDelegate.setApplicationLocales` is the right API to use here:
 * on Android 13+ (API 33) it delegates to the platform LocaleManager so the
 * choice shows up in the system Settings → Languages page, and on older
 * versions AppCompat keeps the same value in its own DataStore so the app
 * stays consistent across launches. Either way, calling it triggers a
 * configuration update — Activity will be recreated unless `locale` is
 * declared in android:configChanges (we add that in the manifest).
 *
 * Reading the current locale via getApplicationLocales gives us the
 * authoritative value the platform will use, even if the user changed it
 * from the system Settings while the app was backgrounded.
 */
class LocaleModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "LocaleModule"
    }

    override fun getName(): String = NAME

    /**
     * Returns a BCP-47 tag like "en", "zh-TW", or null when the user hasn't
     * picked a language yet (so the app should fall back to system default).
     */
    @ReactMethod
    fun getApplicationLocale(promise: Promise) {
        try {
            val list = AppCompatDelegate.getApplicationLocales()
            val tag = if (list.isEmpty) null else list.toLanguageTags()
            // toLanguageTags() returns comma-separated when the list has many
            // entries; we only ever set one, so first segment is fine.
            val first = tag?.split(',')?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }
            promise.resolve(first)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    /**
     * Set the app's preferred locale. Pass null (or empty string) to clear
     * the override and follow the system locale again.
     */
    @ReactMethod
    fun setApplicationLocale(tag: String?, promise: Promise) {
        try {
            val locales = if (tag.isNullOrBlank()) {
                LocaleListCompat.getEmptyLocaleList()
            } else {
                LocaleListCompat.forLanguageTags(tag)
            }
            // setApplicationLocales must be called on the main thread on
            // older AppCompat versions; the modern release tolerates either,
            // but we marshal to be safe.
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    AppCompatDelegate.setApplicationLocales(locales)
                }
            } else {
                AppCompatDelegate.setApplicationLocales(locales)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("LOCALE_ERROR", e.message ?: "Failed to set locale")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
