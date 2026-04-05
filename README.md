# SuperTrace 🌐

SuperTrace is a high-performance, cross-platform Android and iOS network diagnostic application built with React Native. It fundamentally abandons standard sequential node checking for **parallel concurrent tracing**, dramatically boosting trace speeds while plotting routes seamlessly to a live map view.

## ✨ Key Features

- **Blazing Fast Concurrent Traceroute Engine**: A highly parallelized Kotlin (`TracerouteModule.kt`) and Swift (`TracerouteModule.swift`) bridge utilizing UDP TTL manipulation, allowing hops to be resolved in tandem without congesting the OS socket pools.
- **Multi-IP DNS Load Balancer Resolving**: Directly taps into native OS DNS resolvers (`InetAddress.getAllByName` & iOS `CFHost`) to intercept multi-IP clustered domains, allowing manual endpoint tracing.
- **Hardcore ICMP Ping Logging**: Simulates Linux-like ICMP Ping Output Terminal styles using raw sub-processes (`Runtime.getRuntime().exec("ping")`) and UDP Unreachable mechanisms, entirely bypassing Java's flawed `isReachable()` APIs.
- **Geospatial Offline Mapping**: Avoids third-party Geocoding API rate limits by mapping IPInfo's `Alpha-2` country codes locally offline to pure O(1) coordinates, rendering visually aesthetic node jumps on a React Native WebView map.
- **Search History State**: Zero-hassle caching utilizing `@react-native-async-storage/async-storage` allowing seamless selection of previously traced IP endpoints.

---

## 💻 Development Guide

Because SuperTrace relies **heavily** on deeply nested custom Native Modules (Kotlin / Swift), you cannot just rely on Expo Go or standard Metro Hot Reloading when core network functions change.

### Prerequisites
- Node.js `^22.11.0`
- React Native CLI
- Android Studio (for Android builds via Gradle)
- Xcode (for iOS builds via CocoaPods)

### 1. Install Dependencies
```bash
# Install node packages
npm install

# Install iOS CocoaPods
cd ios && pod install && cd ..
```

### 2. Run the Development Server & App
Always make sure you re-compile the app natively when changing Kotlin or Swift code:

**For Android:**
```bash
npx react-native run-android
```
**For iOS:**
```bash
npx react-native run-ios
```

> **Note**: For JS/TS changes inside `/src`, the Metro Bundler's fast refresh feature (`r`) works perfectly. You only need to rebuild using the commands above when making native system changes.

---

## 🚀 Building for Release (Production)

### Android Build
Android requires a generated keystore file. Configure your `android/app/build.gradle` `signingConfigs` block with your release keystore before proceeding.

1. **Generate APK**:
```bash
cd android
./gradlew assembleRelease
# Output located at: android/app/build/outputs/apk/release/app-release.apk
```

2. **Generate AAB (Android App Bundle for Play Store)**:
```bash
cd android
./gradlew bundleRelease
# Output located at: android/app/build/outputs/bundle/release/app-release.aab
```

### iOS Build

1. Open the `.xcworkspace` file located inside the `ios/` directory using Xcode.
```bash
open ios/SuperTrace.xcworkspace
```
2. Navigate to **Product -> Scheme -> Edit Scheme** and ensure the build configuration is set to **Release**.
3. Select **Any iOS Device (arm64)** from the target device dropdown at the top.
4. Click **Product -> Archive** to begin the packaging process.
5. Once complete, the **Xcode Organizer** will open, allowing you to `Distribute App` directly to TestFlight or configure a standalone `ipa` file for enterprise deployment.
