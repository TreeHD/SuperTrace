/**
 * English dictionary. This is the source of truth for translation keys —
 * every key that exists here MUST also exist in zhTW.ts (TypeScript will
 * enforce this via the `Translations` type derived from `en`).
 *
 * Keep keys flat (no nesting) and grouped by component prefix. Placeholder
 * tokens use {name} syntax — t('foo', {name: 'bar'}).
 */
export const en = {
  // Common
  cancel: 'Cancel',
  close: 'Close',
  ok: 'OK',
  retry: 'Retry',
  loading: 'Loading…',

  // App / TracerouteScreen
  appName: 'SuperTrace',
  emptyStateSubtitle: 'Enter an IP address or domain to start tracing',
  tracingTo: 'Tracing to',
  hopsCompleted: '✓ {count} hops',
  probingHop: 'Probing hop {hop}…',

  // InputBar
  inputPlaceholder: 'Enter IP or domain (e.g. 8.8.8.8)',
  buttonResolving: 'Resolving…',
  buttonStop: 'Stop',
  buttonTrace: 'Trace',
  recentTraces: 'Recent Traces',
  clear: 'Clear',

  // HopCard
  resolving: 'resolving…',
  privateOrUnknown: 'Private / Unknown',

  // HopDetailModal
  hopDetails: 'Hop Details',
  retryPing: 'Retry Ping',
  ipAddress: 'IP Address',
  country: 'Country',
  city: 'City',
  asnOrganization: 'ASN Organization',

  // PingRetryModal
  pingTest: 'Ping Test',
  numberOfPings: 'Number of Pings',
  startPing: 'Start Ping',
  pinging: 'Pinging…',
  requestTimeout: 'Request Timeout',
  waitingForNative: 'Waiting for native response…',
  hitStart: 'Hit START to begin diagnostic test',
  roundTripTime: 'Round Trip Time',
  sent: 'Sent',
  online: 'Online',
  loss: 'Loss',

  // InfoModal — Network info panel
  networkInfo: 'Network Info',
  fetchingNetworkInfo: 'Fetching network info…',
  fetchInfoFailed: 'Failed to fetch info',
  refresh: 'Refresh',
  connectionType: 'Connection Type',
  publicIpv4: 'Public IPv4',
  publicIpv6: 'Public IPv6',
  notAvailable: 'Not available',
  dnsSection: 'DNS',
  systemDns: 'System DNS',
  dnsSuffix: 'DNS',           // Suffix used as "{TRANSPORT} DNS"
  publicResolverLatency: 'Public Resolver Latency',
  dnsNotExposed: 'not exposed by OS',
  dnsHidden: 'hidden',
  privateDnsLabel: 'DoT',

  // DnsSelectionModal
  multipleIpsDetected: 'Multiple IPs Detected',
  pickEndpoint: 'Pick an endpoint to trace',
  domainResolvesTo: '{domain} resolves to {count} IPs',

  // Settings
  settings: 'Settings',
  language: 'Language',
  languageEnglish: 'English',
  languageZhTW: '繁體中文',
  systemDefault: 'System default',
  about: 'About',
  version: 'Version',
} as const;

export type Translations = typeof en;
export type TranslationKey = keyof Translations;
