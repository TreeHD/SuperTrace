import Foundation
import React

@objc(ReverseDnsModule)
class ReverseDnsModule: NSObject, RCTBridgeModule {

    static func moduleName() -> String! {
        return "ReverseDnsModule"
    }

    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func reverseLookup(_ ip: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
        Task {
            let fqdn = await performReverseLookup(ip: ip)
            resolve(fqdn)
        }
    }

    private func performReverseLookup(ip: String) async -> String? {
        return await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                var addr = sockaddr_in()
                addr.sin_family = sa_family_t(AF_INET)
                inet_pton(AF_INET, ip, &addr.sin_addr)

                var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))

                let result = withUnsafePointer(to: &addr) { ptr in
                    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                        getnameinfo(sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size),
                                   &hostname, socklen_t(hostname.count),
                                   nil, 0, 0)
                    }
                }

                if result == 0 {
                    let name = String(cString: hostname)
                    // If the returned name is the IP itself, no PTR record
                    if name != ip {
                        continuation.resume(returning: name)
                    } else {
                        continuation.resume(returning: nil)
                    }
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}
