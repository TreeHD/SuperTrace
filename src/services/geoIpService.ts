import type {GeoIpResult} from '../types';
import {COUNTRY_COORDS} from '../constants/countryCoords';

const geoIpCache = new Map<string, GeoIpResult>();

// Concurrency limiter to prevent 429 errors from ipinfo.io during parallel traces
let activeRequests = 0;
const MAX_CONCURRENT = 3;
const queue: (() => void)[] = [];

async function acquireToken(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => queue.push(resolve));
}

function releaseToken() {
  activeRequests--;
  if (queue.length > 0) {
    activeRequests++;
    const next = queue.shift();
    if (next) setTimeout(next, 200); // 200ms delay between queued tasks to prevent burst blocks
  }
}

const PRIVATE_IP_REGEX =
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|::1|fe80:|fc00:|fd00:)/i;

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_REGEX.test(ip);
}

export async function lookupGeoIp(
  ip: string,
): Promise<GeoIpResult | null> {
  if (isPrivateIp(ip)) {
    return null;
  }

  const cached = geoIpCache.get(ip);
  if (cached) {
    return cached;
  }

  await acquireToken();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`https://api.ipinfo.io/lite/${ip}?token=e1b2953df4d971`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`GeoIP API error: ${response.status}`);
    }

    const data = await response.json();
    
    let asnNum = 0;
    if (data?.asn) {
      asnNum = parseInt(data.asn.toString().replace('AS', ''), 10);
    }

    const coords = COUNTRY_COORDS[data?.country_code] || { lat: 0, lng: 0 };

    const mapped: GeoIpResult = {
      ip: data?.ip || ip,
      country: data?.country || '',
      country_code: data?.country_code || '',
      region: data?.region || '',
      latitude: coords.lat,
      longitude: coords.lng,
      asn: asnNum,
      asn_organization: data?.as_name || data?.org?.replace(/^AS\d+\s*/, '') || '',
      isp: data?.org || '',
      organization: data?.org || '',
      timezone: data?.timezone || '',
      continent_code: data?.continent_code || '',
    };
    
    geoIpCache.set(ip, mapped);
    return mapped;
  } catch (error) {
    console.warn(`GeoIP lookup failed for ${ip}:`, error);
    return null;
  } finally {
    releaseToken();
  }
}

export async function lookupSelfGeoIp(): Promise<GeoIpResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://ipinfo.io/json', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Self GeoIP API error: ${response.status}`);
    }

    const data = await response.json();
    const coords = COUNTRY_COORDS[data?.country_code] || { lat: 0, lng: 0 };
    
    let asnNum = 0;
    if (data?.org?.startsWith('AS')) {
      const match = data.org.match(/^AS(\d+)/);
      if (match) asnNum = parseInt(match[1], 10);
    }

    return {
      ip: data?.ip || '',
      country: data?.country || '',
      country_code: data?.country_code || '',
      region: data?.region || '',
      latitude: coords.lat,
      longitude: coords.lng,
      asn: asnNum,
      asn_organization: data?.org?.replace(/^AS\d+\s*/, '') || '',
      isp: data?.org || '',
      organization: data?.org || '',
      timezone: data?.timezone || '',
      continent_code: data?.continent_code || '',
    };
  } catch (error) {
    console.warn('Self GeoIP lookup failed:', error);
    return null;
  }
}

export function clearGeoIpCache(): void {
  geoIpCache.clear();
}

export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return '🌐';
  }
  const offset = 127397;
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(c => c.charCodeAt(0) + offset);
  return String.fromCodePoint(...codePoints);
}
