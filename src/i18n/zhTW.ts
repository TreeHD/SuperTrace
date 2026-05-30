import type {Translations} from './en';

export const zhTW: Translations = {
  // Common
  cancel: '取消',
  close: '關閉',
  ok: '確定',
  retry: '重試',
  loading: '載入中…',

  // App / TracerouteScreen
  appName: 'SuperTrace',
  emptyStateSubtitle: '輸入 IP 或網域開始追蹤路由',
  tracingTo: '追蹤目標',
  hopsCompleted: '✓ {count} 個節點',
  probingHop: '正在探測第 {hop} 個節點…',

  // InputBar
  inputPlaceholder: '輸入 IP 或網域（例如 8.8.8.8）',
  buttonResolving: '解析中…',
  buttonStop: '停止',
  buttonTrace: '追蹤',
  recentTraces: '最近追蹤',
  clear: '清除',

  // HopCard
  resolving: '解析中…',
  privateOrUnknown: '私有 / 未知',

  // HopDetailModal
  hopDetails: '節點詳細資料',
  retryPing: '重新 Ping',
  ipAddress: 'IP 位址',
  country: '國家',
  city: '城市',
  asnOrganization: 'ASN 組織',

  // PingRetryModal
  pingTest: 'Ping 測試',
  numberOfPings: 'Ping 次數',
  startPing: '開始 Ping',
  pinging: 'Ping 中…',
  requestTimeout: '請求逾時',
  waitingForNative: '等待原生回應…',
  hitStart: '按下「開始」執行診斷測試',
  roundTripTime: '往返時間',
  sent: '送出',
  online: '在線',
  loss: '遺失',

  // InfoModal
  networkInfo: '網路資訊',
  fetchingNetworkInfo: '正在取得網路資訊…',
  fetchInfoFailed: '取得資訊失敗',
  refresh: '重新整理',
  connectionType: '連線類型',
  publicIpv4: '公共 IPv4',
  publicIpv6: '公共 IPv6',
  notAvailable: '無',
  dnsSection: 'DNS',
  systemDns: '系統 DNS',
  dnsSuffix: 'DNS',
  publicResolverLatency: '公共解析器延遲',
  dnsNotExposed: '系統未公開',
  dnsHidden: '已隱藏',
  privateDnsLabel: 'DoT',

  // DnsSelectionModal
  multipleIpsDetected: '偵測到多個 IP',
  pickEndpoint: '選擇要追蹤的端點',
  domainResolvesTo: '{domain} 解析到 {count} 個 IP',

  // Settings
  settings: '設定',
  language: '語言',
  languageEnglish: 'English',
  languageZhTW: '繁體中文',
  systemDefault: '跟隨系統',
  about: '關於',
  version: '版本',
};
