#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ReverseDnsModule, NSObject)

RCT_EXTERN_METHOD(reverseLookup:(NSString *)ip
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
