export interface HopResult {
  hop: number;
  ip: string | null;
  rtt1: number | null;
  rtt2: number | null;
  rtt3: number | null;
  done: boolean;
  error?: string;
}

export interface GeoIpResult {
  ip: string;
  country: string;
  country_code: string;
  region: string;
  latitude: number;
  longitude: number;
  asn: number;
  asn_organization: string;
  isp: string;
  organization: string;
  timezone: string;
  continent_code: string;
}

export interface HopData extends HopResult {
  geoIp?: GeoIpResult | null;
  fqdn?: string | null;
  geoLoading?: boolean;
  fqdnLoading?: boolean;
}

export interface PingResult {
  seq: number;
  ip: string;
  rtt: number | null;
  error?: string;
}

export interface PingSummary {
  sent: number;
  received: number;
  lost: number;
  lossPercent: number;
  minRtt: number;
  avgRtt: number;
  maxRtt: number;
  results: PingResult[];
}

export interface LocalNetworkInfo {
  ipv4: string | null;
  ipv6: string | null;
  publicIp: string | null;
  dns: string[];
  connectionType: string;
}

export type ViewMode = 'trace' | 'map';

export type TracerouteStatus = 'idle' | 'running' | 'done' | 'error';
