# SuperTrace

SuperTrace is a high-performance network diagnostic app for Android and iOS, built on React Native 0.84 (New Architecture). It abandons the textbook sequential traceroute pattern in favour of **fully concurrent hop probing**, drives every DNS / RDNS / GeoIP enrichment in parallel, and renders the resulting path live on an embedded WebView map.

---

## Highlights

- **Concurrent traceroute engine** — Kotlin (`TracerouteModule.kt`) and Swift (`TracerouteModule.swift`) bridges fire all 30 TTLs at once through a `Semaphore(8)` gate. Hops resolve in tandem instead of marching one-by-one, and a shared `minDestinationTtl` short-circuits late probes once the destination answers.
- **Raw-UDP reverse DNS** — Custom `ReverseDnsModule` on both platforms talks DNS wire-format directly to public resolvers (`1.1.1.1`, `8.8.8.8`, `9.9.9.9`, plus three backups). Sidesteps `InetAddress.canonicalHostName` / `getnameinfo` thread-pool stalls that previously caused PTR records to silently disappear under parallel load. Includes a full PTR parser (compression-pointer aware), per-server timeouts, NXDOMAIN short-circuit, and a `reverseLookupBatch` API.
- **Real system DNS surfacing** — Pulls the actual resolvers handed out by the OS for the live network. Android reads `ConnectivityManager.getLinkProperties().dnsServers` plus `isPrivateDnsActive` for DoT; iOS reads libresolv (`res_9_ninit` + `nsaddr_list` / IPv6 `_u._ext.nsaddrs`). Switching between LTE and WiFi flips the displayed servers automatically.
- **Multi-IP DNS load-balancer resolution** — `InetAddress.getAllByName` (Android) and `CFHost` (iOS) expose every IP behind a clustered domain so users can pick which endpoint to trace.
- **Native ICMP ping** — Subprocess-based `ping` on Android (with multi-binary fallback for AOSP variants), raw socket on iOS. Bypasses `isReachable()` entirely; falls back to TCP/80 only as a last-ditch reachability check.
- **Offline geospatial mapping** — IPInfo's Alpha-2 country codes are mapped to coordinates via a baked-in O(1) lookup table, so the live map never hits a third-party geocoding API.
- **Search history** — Persisted via `@react-native-async-storage/async-storage`, surfaced as a typeahead dropdown.

---

## Architecture

```
┌────────────────────────── React Native (TS) ──────────────────────────┐
│  src/screens/TracerouteScreen.tsx     UI shell + view-mode switcher   │
│  src/components/                      InputBar, HopCard, modals, map  │
│  src/hooks/useTraceroute.ts           Hop state machine + enrichment  │
│  src/services/                                                        │
│    tracerouteService.ts               Native bridge (events + RPC)    │
│    dnsService.ts                      Inflight dedup, success cache   │
│    geoIpService.ts                    GeoIP w/ 3-way concurrency cap  │
│    networkInfoService.ts              System DNS + transport detect   │
│  src/utils/host.ts                    URL → bare hostname normalizer  │
└────────────────────┬──────────────────────────────────────────────────┘
                     │ NativeEventEmitter / Promise bridges
┌────────────────────┴──────────────────┬───────────────────────────────┐
│  Android (Kotlin)                     │  iOS (Swift)                  │
│    TracerouteModule.kt                │    TracerouteModule.swift     │
│      • ProcessBuilder ping per hop    │    • UDP socket + IP_TTL      │
│      • ConnectivityManager DNS        │    • libresolv DNS read       │
│      • CFHost-style getAllByName      │    • CFHost resolver          │
│    ReverseDnsModule.kt                │    ReverseDnsModule.swift     │
│      • Raw UDP PTR query              │    • Raw UDP PTR query        │
│      • 6-resolver fallback chain      │    • 6-resolver fallback chain│
│      • Wire-format parser             │    • Wire-format parser       │
└───────────────────────────────────────┴───────────────────────────────┘
```

### Why raw UDP for reverse DNS

`InetAddress.canonicalHostName` and `getnameinfo` route through the system resolver thread pool. Under the parallel load this app generates (30 hops × 1 PTR each), the pool stalls and PTR queries silently time out — and worse, both APIs return *the IP itself* on both "no record" and "timeout", making the two indistinguishable. The new module bypasses the OS resolver entirely:

1. Build a DNS PTR query packet by hand (12-byte header + reversed-octet QNAME).
2. Send it via `DatagramSocket` / BSD UDP socket to the first resolver in the fallback chain.
3. Parse the response with a compression-aware wire-format reader.
4. Treat NXDOMAIN as authoritative "no record" → short-circuit. Any other failure → fall through to the next resolver.
5. JS layer caches successes only (failures are retryable) and dedups inflight calls so 30 concurrent hops never make 30 redundant bridge crossings for the same IP.

---

## Development

### Prerequisites

- Node.js `^22.11.0`
- React Native CLI
- Android Studio (Android Gradle Plugin requires JDK 17 or 21 — JDK 25 is **not** supported by the bundled Gradle 8.13)
- Xcode 15+ for iOS

### Install

```bash
npm install
cd ios && pod install && cd ..
```

### Run

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

> JS / TS edits are picked up by Metro hot reload (`r` to reload). **Native changes (Kotlin, Swift, Bridge headers) require a full rebuild** — Metro doesn't know about the JNI / Obj-C layer.

### Tests

```bash
npx jest
```

Unit tests live in `__tests__/`. The host normalizer (`__tests__/host.test.ts`) covers scheme stripping, userinfo, path/query/fragment trimming, IPv6 brackets, port stripping, and FQDN canonicalization.

---

## Building for Release

### Android

A signing config in `android/app/build.gradle` is required.

```bash
cd android
./gradlew assembleRelease       # APK at app/build/outputs/apk/release/
./gradlew bundleRelease         # AAB at app/build/outputs/bundle/release/
```

The release workflow in `.github/workflows/` wires this into automated builds.

### iOS

```bash
open ios/SuperTrace.xcworkspace
```

1. **Product → Scheme → Edit Scheme** — set Build Configuration to **Release**.
2. Select **Any iOS Device (arm64)** as the target.
3. **Product → Archive**.
4. Distribute via Organizer (TestFlight / Ad Hoc / Enterprise).

---

## Project Layout

```
SuperTrace/
├── src/
│   ├── screens/          One screen, switches between trace/map view
│   ├── components/       HopCard, modals, MapWebView
│   ├── hooks/            useTraceroute, useHistory
│   ├── services/         Native bridge wrappers, GeoIP, network info
│   ├── utils/            Pure helpers (host normalizer)
│   ├── constants/        Country-code → lat/lng table
│   └── assets/           map.html (Leaflet, runs in WebView)
├── android/app/src/main/java/me/treexhd/supertrace/
│   ├── MainActivity.kt
│   ├── MainApplication.kt
│   └── traceroute/       Kotlin native modules
├── ios/SuperTrace/
│   ├── AppDelegate.swift
│   ├── TracerouteModule.swift + Bridge.m
│   └── ReverseDnsModule.swift + Bridge.m
└── __tests__/            Jest unit tests
```

---

## Permissions

**Android** (`AndroidManifest.xml`):
- `INTERNET` — DNS + GeoIP + traceroute probes
- `ACCESS_NETWORK_STATE` — `ConnectivityManager` for active network + DNS server enumeration
- `ACCESS_WIFI_STATE` — transport classification

**iOS** — no explicit Info.plist permissions required for outbound UDP / TCP traceroute on user data networks.

---

## License

This repository is part of `me.treexhd.supertrace`. See repository for licensing terms.
