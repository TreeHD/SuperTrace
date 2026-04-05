import Foundation
import React

@objc(TracerouteModule)
class TracerouteModule: RCTEventEmitter {

    private var tracerouteTask: Task<Void, Never>?
    private var hasListeners = false

    override static func moduleName() -> String! {
        return "TracerouteModule"
    }

    override func supportedEvents() -> [String]! {
        return ["onHopResult", "onTraceComplete", "onTraceError"]
    }

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc
    func startTraceroute(_ host: String, maxHops: Int, timeoutMs: Int) {
        tracerouteTask?.cancel()

        tracerouteTask = Task {
            do {
                guard let targetAddress = resolveHost(host) else {
                    sendError("Failed to resolve host: \(host)")
                    return
                }

                let targetIp = targetAddress

                // Actor to track lowest TTL that hits destination safely across tasks
                actor TraceState {
                    var minDestinationTtl: Int
                    init(max: Int) { self.minDestinationTtl = max + 1 }
                    func updateMin(ttl: Int) { if ttl < minDestinationTtl { minDestinationTtl = ttl } }
                    func getMin() -> Int { return minDestinationTtl }
                }
                let state = TraceState(max: maxHops)

                await withTaskGroup(of: Void.self) { group in
                    for ttl in 1...maxHops {
                        group.addTask {
                            if Task.isCancelled { return }
                            let currentMin = await state.getMin()
                            if ttl > currentMin { return }

                            let hopResult = await self.probeHop(target: host, targetIp: targetIp, ttl: ttl, timeoutMs: timeoutMs)
                            let hopIp = hopResult["ip"] as? String
                            
                            if self.hasListeners {
                                self.sendEvent(withName: "onHopResult", body: hopResult)
                            }

                            if let ip = hopIp, ip == targetIp {
                                await state.updateMin(ttl: ttl)
                            }
                        }
                    }
                }

                if self.hasListeners {
                    self.sendEvent(withName: "onTraceComplete", body: nil)
                }
            }
        }
    }

    @objc
    func stopTraceroute() {
        tracerouteTask?.cancel()
        tracerouteTask = nil
    }

    @objc
    func pingHost(_ host: String, count: Int, timeoutMs: Int,
                  resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                guard let targetIp = resolveHost(host) else {
                    reject("RESOLVE_ERROR", "Failed to resolve host", nil)
                    return
                }

                var results: [[String: Any]] = []
                var received = 0
                var totalRtt = 0.0
                var minRtt = Double.greatestFiniteMagnitude
                var maxRtt = 0.0

                for seq in 1...count {
                    if Task.isCancelled { break }

                    let startTime = CFAbsoluteTimeGetCurrent()

                    // Simple ping using Process-based approach or ICMP
                    let (success, rtt) = await simplePing(host: host, timeoutMs: timeoutMs)

                    var result: [String: Any] = [
                        "seq": seq,
                        "ip": targetIp
                    ]

                    if success {
                        result["rtt"] = rtt
                        received += 1
                        totalRtt += rtt
                        if rtt < minRtt { minRtt = rtt }
                        if rtt > maxRtt { maxRtt = rtt }
                    } else {
                        result["rtt"] = NSNull()
                        result["error"] = "timeout"
                    }

                    results.append(result)

                    if seq < count {
                        try? await Task.sleep(nanoseconds: 200_000_000) // 200ms delay
                    }
                }

                let summary: [String: Any] = [
                    "sent": count,
                    "received": received,
                    "lost": count - received,
                    "lossPercent": count > 0 ? Double(count - received) / Double(count) * 100 : 0,
                    "minRtt": minRtt == Double.greatestFiniteMagnitude ? 0 : minRtt,
                    "avgRtt": received > 0 ? totalRtt / Double(received) : 0,
                    "maxRtt": maxRtt,
                    "results": results
                ]

                resolve(summary)
            }
        }
    }

    @objc
    func resolveDns(_ host: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let hostRef = CFHostCreateWithName(nil, host as CFString).takeRetainedValue()
        var resolved = DarwinBoolean(false)
        CFHostStartInfoResolution(hostRef, .addresses, nil)
        
        guard let addresses = CFHostGetAddressing(hostRef, &resolved)?.takeUnretainedValue() as? [Data] else {
            reject("RESOLVE_ERROR", "Failed to resolve host", nil)
            return
        }
        
        var results: [String] = []
        var uniqueIps = Set<String>()
        
        for addressData in addresses {
            var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            addressData.withUnsafeBytes { ptr in
                let sockaddr = ptr.bindMemory(to: sockaddr.self).baseAddress!
                getnameinfo(sockaddr, socklen_t(addressData.count),
                           &hostname, socklen_t(hostname.count),
                           nil, 0, NI_NUMERICHOST)
            }
            let ip = String(cString: hostname)
            if !ip.isEmpty && !uniqueIps.contains(ip) {
                uniqueIps.insert(ip)
                results.append(ip)
            }
        }
        resolve(results)
    }

    private func resolveHost(_ host: String) -> String? {
        let hostRef = CFHostCreateWithName(nil, host as CFString).takeRetainedValue()
        var resolved = DarwinBoolean(false)
        CFHostStartInfoResolution(hostRef, .addresses, nil)
        guard let addresses = CFHostGetAddressing(hostRef, &resolved)?.takeUnretainedValue() as? [Data],
              let firstAddress = addresses.first else {
            return nil
        }

        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        firstAddress.withUnsafeBytes { ptr in
            let sockaddr = ptr.bindMemory(to: sockaddr.self).baseAddress!
            getnameinfo(sockaddr, socklen_t(firstAddress.count),
                       &hostname, socklen_t(hostname.count),
                       nil, 0, NI_NUMERICHOST)
        }

        return String(cString: hostname)
    }

    private func probeHop(target: String, targetIp: String, ttl: Int, timeoutMs: Int) async -> [String: Any] {
        var result: [String: Any] = ["hop": ttl]

        var rttValues: [Any] = []
        var hopIp: String? = nil

        for _ in 0..<3 {
            // Use socket-based approach with TTL
            let (ip, rtt) = await traceHop(target: target, ttl: ttl, timeoutMs: timeoutMs)

            if let ip = ip {
                hopIp = ip
                rttValues.append(rtt ?? NSNull())
            } else {
                rttValues.append(NSNull())
            }
        }

        if let ip = hopIp {
            result["ip"] = ip
        } else {
            result["ip"] = NSNull()
        }

        result["rtt1"] = rttValues.count > 0 ? rttValues[0] : NSNull()
        result["rtt2"] = rttValues.count > 1 ? rttValues[1] : NSNull()
        result["rtt3"] = rttValues.count > 2 ? rttValues[2] : NSNull()
        result["done"] = hopIp == targetIp

        return result
    }

    private func traceHop(target: String, ttl: Int, timeoutMs: Int) async -> (String?, Double?) {
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                var sendSock: Int32 = -1
                var recvSock: Int32 = -1

                defer {
                    if sendSock >= 0 { close(sendSock) }
                    if recvSock >= 0 { close(recvSock) }
                }

                // Create UDP socket for sending
                sendSock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
                guard sendSock >= 0 else {
                    continuation.resume(returning: (nil, nil))
                    return
                }

                // Set TTL
                var ttlValue = Int32(ttl)
                setsockopt(sendSock, IPPROTO_IP, IP_TTL, &ttlValue, socklen_t(MemoryLayout<Int32>.size))

                // Create ICMP socket for receiving
                recvSock = socket(AF_INET, SOCK_DGRAM, IPPROTO_ICMP)
                guard recvSock >= 0 else {
                    continuation.resume(returning: (nil, nil))
                    return
                }

                // Set timeout
                var timeout = timeval()
                timeout.tv_sec = __darwin_time_t(timeoutMs / 1000)
                timeout.tv_usec = Int32((timeoutMs % 1000) * 1000)
                setsockopt(recvSock, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

                // Resolve target
                var targetAddr = sockaddr_in()
                targetAddr.sin_family = sa_family_t(AF_INET)
                targetAddr.sin_port = UInt16(33434 + ttl).bigEndian
                inet_pton(AF_INET, target, &targetAddr.sin_addr)

                // If target is a hostname, resolve it
                if targetAddr.sin_addr.s_addr == 0 {
                    guard let hostEntry = gethostbyname(target) else {
                        continuation.resume(returning: (nil, nil))
                        return
                    }
                    memcpy(&targetAddr.sin_addr, hostEntry.pointee.h_addr_list[0],
                           Int(hostEntry.pointee.h_length))
                }

                let startTime = CFAbsoluteTimeGetCurrent()

                // Send UDP packet
                let data = [UInt8](repeating: 0, count: 32)
                let sendResult = withUnsafePointer(to: &targetAddr) { ptr in
                    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                        sendto(sendSock, data, data.count, 0, sockaddrPtr,
                               socklen_t(MemoryLayout<sockaddr_in>.size))
                    }
                }

                guard sendResult >= 0 else {
                    continuation.resume(returning: (nil, nil))
                    return
                }

                // Receive ICMP response
                var recvBuffer = [UInt8](repeating: 0, count: 1024)
                var fromAddr = sockaddr_in()
                var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)

                let recvResult = withUnsafeMutablePointer(to: &fromAddr) { ptr in
                    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                        recvfrom(recvSock, &recvBuffer, recvBuffer.count, 0, sockaddrPtr, &fromLen)
                    }
                }

                let endTime = CFAbsoluteTimeGetCurrent()
                let rtt = (endTime - startTime) * 1000 // Convert to ms

                if recvResult > 0 {
                    var ipStr = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                    inet_ntop(AF_INET, &fromAddr.sin_addr, &ipStr, socklen_t(INET_ADDRSTRLEN))
                    let ip = String(cString: ipStr)
                    continuation.resume(returning: (ip, rtt))
                } else {
                    continuation.resume(returning: (nil, nil))
                }
            }
        }
    }

    private func simplePing(host: String, timeoutMs: Int) async -> (Bool, Double) {
        // Rather than test TCP port 80, we use UDP ping (traceroute protocol) with a high TTL
        // to solicit an ICMP Port Unreachable message from the final host, which serves as a ping.
        let (_, rtt) = await traceHop(target: host, ttl: 64, timeoutMs: timeoutMs)
        if let r = rtt {
            return (true, r)
        }
        return (false, 0.0)
    }

    private func sendError(_ message: String) {
        if hasListeners {
            sendEvent(withName: "onTraceError", body: ["error": message])
        }
    }
}
