import {NativeModules} from 'react-native';

const {ReverseDnsModule} = NativeModules;

const fqdnCache = new Map<string, string | null>();

export async function reverseLookup(ip: string): Promise<string | null> {
  const cached = fqdnCache.get(ip);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const fqdn = await ReverseDnsModule.reverseLookup(ip);
    fqdnCache.set(ip, fqdn || null);
    return fqdn || null;
  } catch (error) {
    console.warn(`Reverse DNS lookup failed for ${ip}:`, error);
    fqdnCache.set(ip, null);
    return null;
  }
}

export function clearDnsCache(): void {
  fqdnCache.clear();
}
