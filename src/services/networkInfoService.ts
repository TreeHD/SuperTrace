import {NativeModules} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type {LocalNetworkInfo, SystemDnsInfo} from '../types';

const {TracerouteModule} = NativeModules;

const EMPTY_SYSTEM_DNS: SystemDnsInfo = {
  servers: [],
  transport: 'unknown',
  privateDnsActive: false,
  privateDnsServer: null,
  perTransport: {},
};

async function fetchSystemDns(): Promise<SystemDnsInfo> {
  try {
    if (!TracerouteModule?.getSystemDnsServers) return EMPTY_SYSTEM_DNS;
    const result = await TracerouteModule.getSystemDnsServers();
    const perTransport: Record<string, string[]> = {};
    if (result?.perTransport && typeof result.perTransport === 'object') {
      for (const [k, v] of Object.entries(result.perTransport)) {
        if (Array.isArray(v)) {
          perTransport[k] = v.filter((x): x is string => typeof x === 'string');
        }
      }
    }
    return {
      servers: Array.isArray(result?.servers) ? result.servers : [],
      transport: typeof result?.transport === 'string' ? result.transport : 'unknown',
      privateDnsActive: !!result?.privateDnsActive,
      privateDnsServer: result?.privateDnsServer ?? null,
      perTransport,
    };
  } catch (e) {
    console.warn('getSystemDnsServers failed:', e);
    return EMPTY_SYSTEM_DNS;
  }
}

export async function getLocalNetworkInfo(): Promise<LocalNetworkInfo> {
  const info: LocalNetworkInfo = {
    ipv4: null,
    ipv6: null,
    publicIp: null,
    dns: [],
    systemDns: EMPTY_SYSTEM_DNS,
    connectionType: 'unknown',
  };

  // Run independent fetches in parallel — none depend on each other.
  const [
    netInfoState,
    ipv4Res,
    ipv6Res,
    geoRes,
    sysDns,
    dnsProbes,
  ] = await Promise.all([
    NetInfo.fetch().catch(() => null),
    fetchWithTimeout('https://api4.ipify.org?format=json', 5000)
      .then(r => r?.json())
      .catch(() => null),
    fetchWithTimeout('https://api6.ipify.org?format=json', 5000)
      .then(r => r?.json())
      .catch(() => null),
    fetchWithTimeout('https://api.ip.sb/geoip', 5000, {
      'User-Agent': 'SuperTrace/1.0',
    })
      .then(r => r?.json())
      .catch(() => null),
    fetchSystemDns(),
    runDnsReachabilityProbes(),
  ]);

  if (netInfoState) info.connectionType = netInfoState.type;
  if (ipv4Res?.ip) info.ipv4 = ipv4Res.ip;
  if (ipv6Res?.ip) info.ipv6 = ipv6Res.ip;
  info.publicIp = geoRes?.ip || info.ipv4;
  info.systemDns = sysDns;
  // Prefer the OS-supplied DNS list. Fall back to public-resolver probes.
  if (sysDns.servers.length > 0) {
    info.dns = sysDns.servers.map(s =>
      s === sysDns.privateDnsServer ? `${s} (Private DNS)` : s,
    );
    if (sysDns.privateDnsServer && !sysDns.servers.includes(sysDns.privateDnsServer)) {
      info.dns.unshift(`${sysDns.privateDnsServer} (Private DNS)`);
    }
  } else {
    info.dns = dnsProbes;
  }

  return info;
}

function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(headers || {}),
    },
  }).finally(() => clearTimeout(timer));
}

/**
 * Latency probes against well-known public resolvers. Used as fallback
 * info when the OS-level DNS list isn't available (sandboxed iOS in some
 * configurations, or when the active network has no resolver yet).
 */
async function runDnsReachabilityProbes(): Promise<string[]> {
  const dnsTests = [
    {name: 'Cloudflare', server: '1.1.1.1'},
    {name: 'Google', server: '8.8.8.8'},
    {name: 'Quad9', server: '9.9.9.9'},
  ];

  const results: string[] = [];
  for (const test of dnsTests) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch(`https://${test.server}`, {
        signal: controller.signal,
        method: 'HEAD',
      });
      clearTimeout(timeout);
      results.push(`${test.name} (${test.server}): ${Date.now() - start}ms`);
    } catch {
      results.push(`${test.name} (${test.server}): unreachable`);
    }
  }
  return results;
}
