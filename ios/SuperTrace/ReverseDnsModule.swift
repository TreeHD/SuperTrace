import Foundation
import React
import Darwin

@objc(ReverseDnsModule)
class ReverseDnsModule: NSObject, RCTBridgeModule {

    static func moduleName() -> String! {
        return "ReverseDnsModule"
    }

    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // Public recursive resolvers — first answer wins; we walk this list per-IP.
    private static let dnsServers: [String] = [
        "1.1.1.1",        // Cloudflare
        "8.8.8.8",        // Google
        "9.9.9.9",        // Quad9
        "1.0.0.1",        // Cloudflare secondary
        "8.8.4.4",        // Google secondary
        "208.67.222.222"  // OpenDNS
    ]

    private static let dnsPort: UInt16 = 53
    private static let perServerTimeoutMs: Int = 1500
    private static let totalTimeoutMs: Int = 6000
    private static let maxConcurrent: Int = 12

    // Cap parallel raw-UDP queries so we don't drown the cellular radio.
    private let semaphore = DispatchSemaphore(value: ReverseDnsModule.maxConcurrent)
    private let queue = DispatchQueue(label: "supertrace.rdns", attributes: .concurrent)
    private var txCounter: UInt16 = UInt16.random(in: 0...UInt16.max)
    private let txLock = NSLock()

    private func nextTxId() -> UInt16 {
        txLock.lock()
        defer { txLock.unlock() }
        txCounter = txCounter &+ 1
        return txCounter
    }

    @objc
    func reverseLookup(_ ip: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self = self else { resolve(NSNull()); return }
            self.semaphore.wait()
            defer { self.semaphore.signal() }

            let fqdn = self.performLookup(ip: ip,
                                          deadline: Date().addingTimeInterval(Double(Self.totalTimeoutMs) / 1000.0))
            if let fqdn = fqdn {
                resolve(fqdn)
            } else {
                resolve(NSNull())
            }
        }
    }

    @objc
    func reverseLookupBatch(_ ips: NSArray,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self = self else { resolve([:]); return }
            let group = DispatchGroup()
            let resultLock = NSLock()
            var result: [String: Any] = [:]

            for case let ip as String in ips {
                group.enter()
                self.queue.async { [weak self] in
                    guard let self = self else { group.leave(); return }
                    self.semaphore.wait()
                    let fqdn = self.performLookup(ip: ip,
                                                  deadline: Date().addingTimeInterval(Double(Self.totalTimeoutMs) / 1000.0))
                    self.semaphore.signal()
                    resultLock.lock()
                    result[ip] = fqdn ?? NSNull()
                    resultLock.unlock()
                    group.leave()
                }
            }

            group.wait()
            resolve(result)
        }
    }

    private enum PtrOutcome {
        case found(String)
        case noRecord
        case failed
    }

    private func performLookup(ip: String, deadline: Date) -> String? {
        guard let arpa = buildArpaName(ip: ip) else { return nil }
        for server in Self.dnsServers {
            if Date() >= deadline { return nil }
            let outcome = queryPtr(server: server, arpaName: arpa)
            switch outcome {
            case .found(let name):
                return name
            case .noRecord:
                return nil
            case .failed:
                continue
            }
        }
        return nil
    }

    private func queryPtr(server: String, arpaName: String) -> PtrOutcome {
        let sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        if sock < 0 { return .failed }
        defer { close(sock) }

        var tv = timeval()
        tv.tv_sec = Self.perServerTimeoutMs / 1000
        tv.tv_usec = Int32((Self.perServerTimeoutMs % 1000) * 1000)
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = Self.dnsPort.bigEndian
        if inet_pton(AF_INET, server, &addr.sin_addr) != 1 {
            return .failed
        }

        let txId = nextTxId()
        let query = buildPtrQuery(txId: txId, arpaName: arpaName)

        let sendResult = query.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> Int in
            withUnsafePointer(to: &addr) { ptr -> Int in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa -> Int in
                    sendto(sock, raw.baseAddress, raw.count, 0, sa,
                           socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
        }
        if sendResult < 0 { return .failed }

        var buffer = [UInt8](repeating: 0, count: 512)
        var fromAddr = sockaddr_in()
        var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        let received = withUnsafeMutablePointer(to: &fromAddr) { ptr -> Int in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa -> Int in
                recvfrom(sock, &buffer, buffer.count, 0, sa, &fromLen)
            }
        }
        if received <= 0 { return .failed }

        return parsePtrResponse(buffer: buffer, length: received, expectedTxId: txId)
    }

    /// "1.2.3.4" → "4.3.2.1.in-addr.arpa"; IPv6 → 32 reversed nibbles + ".ip6.arpa"
    private func buildArpaName(ip: String) -> String? {
        var v4 = in_addr()
        if inet_pton(AF_INET, ip, &v4) == 1 {
            let raw = withUnsafeBytes(of: &v4.s_addr) { Array($0) }
            // s_addr is in network byte order; bytes are already MSB-first in network terms,
            // but Darwin stores it little-endian on-host. We need the four octets as written
            // ("1.2.3.4") and reverse them. Use inet_ntoa trip to get a canonical form.
            var canonical = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            inet_ntop(AF_INET, &v4, &canonical, socklen_t(INET_ADDRSTRLEN))
            let canonicalStr = String(cString: canonical)
            let octets = canonicalStr.split(separator: ".")
            if octets.count != 4 { return nil }
            return octets.reversed().joined(separator: ".") + ".in-addr.arpa"
        }

        var v6 = in6_addr()
        if inet_pton(AF_INET6, ip, &v6) == 1 {
            let bytes: [UInt8] = withUnsafeBytes(of: &v6) { raw in
                Array(raw.bindMemory(to: UInt8.self))
            }
            guard bytes.count == 16 else { return nil }
            var sb = ""
            for i in stride(from: 15, through: 0, by: -1) {
                let b = bytes[i]
                sb += String(b & 0x0F, radix: 16) + "."
                sb += String((b >> 4) & 0x0F, radix: 16) + "."
            }
            sb += "ip6.arpa"
            return sb
        }
        return nil
    }

    private func buildPtrQuery(txId: UInt16, arpaName: String) -> [UInt8] {
        let labels = arpaName.split(separator: ".").map { String($0) }
        var out: [UInt8] = []

        // Header: txId, flags=0x0100 (RD), QD=1, AN/NS/AR=0
        out.append(UInt8((txId >> 8) & 0xFF))
        out.append(UInt8(txId & 0xFF))
        out.append(0x01); out.append(0x00)
        out.append(0x00); out.append(0x01)
        out.append(0x00); out.append(0x00)
        out.append(0x00); out.append(0x00)
        out.append(0x00); out.append(0x00)

        for label in labels {
            let bytes = [UInt8](label.utf8)
            out.append(UInt8(bytes.count))
            out.append(contentsOf: bytes)
        }
        out.append(0x00) // root

        // QTYPE=PTR(12), QCLASS=IN(1)
        out.append(0x00); out.append(0x0C)
        out.append(0x00); out.append(0x01)
        return out
    }

    private func parsePtrResponse(buffer: [UInt8], length: Int, expectedTxId: UInt16) -> PtrOutcome {
        if length < 12 { return .failed }
        let txId = (UInt16(buffer[0]) << 8) | UInt16(buffer[1])
        if txId != expectedTxId { return .failed }

        let flags = (UInt16(buffer[2]) << 8) | UInt16(buffer[3])
        let rcode = Int(flags & 0x000F)
        let qdCount = Int((UInt16(buffer[4]) << 8) | UInt16(buffer[5]))
        let anCount = Int((UInt16(buffer[6]) << 8) | UInt16(buffer[7]))

        var pos = 12
        for _ in 0..<qdCount {
            guard let np = skipName(buffer: buffer, start: pos, length: length) else { return .failed }
            pos = np
            if pos + 4 > length { return .failed }
            pos += 4
        }

        if rcode == 3 { return .noRecord }     // NXDOMAIN
        if rcode != 0 { return .failed }
        if anCount == 0 { return .noRecord }

        for _ in 0..<anCount {
            guard let np = skipName(buffer: buffer, start: pos, length: length) else { return .failed }
            pos = np
            if pos + 10 > length { return .failed }
            let rrType = (Int(buffer[pos]) << 8) | Int(buffer[pos + 1])
            let rdLength = (Int(buffer[pos + 8]) << 8) | Int(buffer[pos + 9])
            pos += 10
            if pos + rdLength > length { return .failed }

            if rrType == 12 { // PTR
                guard let name = readName(buffer: buffer, start: pos, length: length) else { return .failed }
                let cleaned = name.trimmingCharacters(in: CharacterSet(charactersIn: "."))
                return cleaned.isEmpty ? .noRecord : .found(cleaned)
            }
            pos += rdLength
        }
        return .noRecord
    }

    private func skipName(buffer: [UInt8], start: Int, length: Int) -> Int? {
        var pos = start
        while pos < length {
            let b = Int(buffer[pos])
            if b == 0 { return pos + 1 }
            if (b & 0xC0) == 0xC0 {
                if pos + 2 > length { return nil }
                return pos + 2
            }
            pos += 1 + b
        }
        return nil
    }

    private func readName(buffer: [UInt8], start: Int, length: Int) -> String? {
        var sb = ""
        var pos = start
        var hops = 0
        let maxHops = 32

        while pos < length {
            if hops > maxHops { return nil }
            let b = Int(buffer[pos])
            if b == 0 { break }
            if (b & 0xC0) == 0xC0 {
                if pos + 1 >= length { return nil }
                let pointer = ((b & 0x3F) << 8) | Int(buffer[pos + 1])
                if pointer >= length { return nil }
                pos = pointer
                hops += 1
                continue
            }
            if pos + 1 + b > length { return nil }
            if !sb.isEmpty { sb.append(".") }
            let labelBytes = Array(buffer[(pos + 1)..<(pos + 1 + b)])
            if let label = String(bytes: labelBytes, encoding: .ascii) {
                sb.append(label)
            } else {
                return nil
            }
            pos += 1 + b
        }
        return sb
    }
}
