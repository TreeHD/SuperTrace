#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(TracerouteModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startTraceroute:(NSString *)host maxHops:(int)maxHops timeoutMs:(int)timeoutMs)
RCT_EXTERN_METHOD(stopTraceroute)
RCT_EXTERN_METHOD(pingHost:(NSString *)host count:(int)count timeoutMs:(int)timeoutMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(resolveDns:(NSString *)host
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
