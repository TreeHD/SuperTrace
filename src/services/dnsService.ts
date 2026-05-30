import {NativeModules} from 'react-native';

const {ReverseDnsModule} = NativeModules;

// Cache successful lookups for the lifetime of the session.
// Negative results (no PTR / lookup failed) are NOT cached — a hop that
// timed out on first probe might answer fine on a second look, so users
// can re-trace and pick up names that were previously missed.
const fqdnCache = new Map<string, string>();

// Inflight dedup: if two callers ask for the same IP at the same time
// (very common when 30 hops light up in parallel), they share one
// native bridge round-trip instead of racing.
const inflight = new Map<string, Promise<string | null>>();

export async function reverseLookup(ip: string): Promise<string | null> {
  const cached = fqdnCache.get(ip);
  if (cached) return cached;

  const pending = inflight.get(ip);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const fqdn = await ReverseDnsModule.reverseLookup(ip);
      if (fqdn && typeof fqdn === 'string' && fqdn.length > 0 && fqdn !== ip) {
        fqdnCache.set(ip, fqdn);
        return fqdn;
      }
      return null;
    } catch (error) {
      console.warn(`Reverse DNS lookup failed for ${ip}:`, error);
      return null;
    } finally {
      inflight.delete(ip);
    }
  })();

  inflight.set(ip, promise);
  return promise;
}

/**
 * Look up several IPs in parallel. The native module throttles concurrency
 * internally so this won't drown the radio even with 30 hops.
 * Cached and inflight entries are reused — only genuinely-unknown IPs
 * are sent across the bridge.
 */
export async function reverseLookupBatch(
  ips: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const toFetch: string[] = [];
  const pendingPromises: Array<Promise<void>> = [];

  for (const ip of ips) {
    const cached = fqdnCache.get(ip);
    if (cached) {
      out.set(ip, cached);
      continue;
    }
    const inflightPromise = inflight.get(ip);
    if (inflightPromise) {
      pendingPromises.push(
        inflightPromise.then(name => {
          out.set(ip, name);
        }),
      );
      continue;
    }
    toFetch.push(ip);
  }

  if (toFetch.length > 0) {
    // Single bridge call for the unknowns. Native side parallelises and caps
    // its own concurrency. Each fetched IP also lands in the inflight map
    // so concurrent single-IP callers can latch on.
    const batchPromise = (async () => {
      try {
        const result: Record<string, string | null> =
          await ReverseDnsModule.reverseLookupBatch(toFetch);
        for (const ip of toFetch) {
          const name = result?.[ip];
          if (name && typeof name === 'string' && name.length > 0 && name !== ip) {
            fqdnCache.set(ip, name);
            out.set(ip, name);
          } else {
            out.set(ip, null);
          }
        }
      } catch (error) {
        console.warn('Reverse DNS batch lookup failed:', error);
        for (const ip of toFetch) out.set(ip, null);
      }
    })();

    // Register each IP in the inflight map pointing at the batch's slice
    for (const ip of toFetch) {
      const slot = batchPromise.then(() => out.get(ip) ?? null).finally(() => {
        inflight.delete(ip);
      });
      inflight.set(ip, slot);
    }
    pendingPromises.push(batchPromise);
  }

  await Promise.all(pendingPromises);
  return out;
}

export function clearDnsCache(): void {
  fqdnCache.clear();
  inflight.clear();
}
