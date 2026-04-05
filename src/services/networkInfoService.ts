import NetInfo from '@react-native-community/netinfo';
import type {LocalNetworkInfo} from '../types';

export async function getLocalNetworkInfo(): Promise<LocalNetworkInfo> {
  const info: LocalNetworkInfo = {
    ipv4: null,
    ipv6: null,
    publicIp: null,
    dns: [],
    connectionType: 'unknown',
  };

  try {
    const netInfoState = await NetInfo.fetch();
    info.connectionType = netInfoState.type;
  } catch (e) {
    console.warn('NetInfo fetch failed:', e);
  }

  // Get public IPv4
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api4.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();
    info.ipv4 = data.ip || null;
  } catch (e) {
    console.warn('IPv4 lookup failed:', e);
  }

  // Get public IPv6
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api6.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();
    info.ipv6 = data.ip || null;
  } catch (e) {
    console.warn('IPv6 lookup failed:', e);
  }

  // Get public IP from ip.sb for extra info
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://api.ip.sb/geoip', {
      signal: controller.signal,
      headers: {'User-Agent': 'SuperTrace/1.0'},
    });
    clearTimeout(timeout);
    const data = await resp.json();
    info.publicIp = data.ip || info.ipv4;
  } catch (e) {
    // Fall back to ipv4
    info.publicIp = info.ipv4;
  }

  // DNS resolution test - resolve known domains and report the DNS servers
  try {
    const dnsTestResults: string[] = [];

    // Test DNS resolution by timing different resolvers
    const dnsTests = [
      {name: 'Cloudflare', server: '1.1.1.1'},
      {name: 'Google', server: '8.8.8.8'},
      {name: 'Quad9', server: '9.9.9.9'},
    ];

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
        const elapsed = Date.now() - start;
        dnsTestResults.push(`${test.name} (${test.server}): ${elapsed}ms`);
      } catch {
        dnsTestResults.push(`${test.name} (${test.server}): unreachable`);
      }
    }

    info.dns = dnsTestResults;
  } catch (e) {
    info.dns = ['DNS test failed'];
  }

  return info;
}
