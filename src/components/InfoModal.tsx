import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow} from '../theme';
import {getLocalNetworkInfo} from '../services/networkInfoService';
import {useT} from '../i18n';
import type {LocalNetworkInfo} from '../types';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function InfoModal({visible, onClose}: InfoModalProps) {
  const t = useT();
  const [info, setInfo] = useState<LocalNetworkInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchInfo();
    }
  }, [visible]);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await getLocalNetworkInfo();
      setInfo(data);
    } catch (e) {
      console.warn('Failed to fetch network info:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Icon name="information" size={22} color={Colors.accent} />
              </View>
              <Text style={styles.title}>{t('networkInfo')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>{t('fetchingNetworkInfo')}</Text>
            </View>
          ) : info ? (
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}>
              <View style={styles.body}>
              {/* Connection Type */}
              <InfoRow
                icon="wifi"
                label={t('connectionType')}
                value={info.connectionType.toUpperCase()}
                color={Colors.accent}
              />

              <View style={styles.divider} />

              {/* IPv4 */}
              <InfoRow
                icon="numeric-4-box"
                label={t('publicIpv4')}
                value={info.ipv4 || t('notAvailable')}
                mono
              />

              {/* IPv6 */}
              <InfoRow
                icon="numeric-6-box"
                label={t('publicIpv6')}
                value={info.ipv6 || t('notAvailable')}
                mono
                small
              />

              <View style={styles.divider} />

              {/* DNS — adapts header to whatever the OS is actually using.
                  Single transport (just WiFi, or just LTE) → one labelled
                  block ("WIFI DNS" / "CELLULAR DNS"). Multiple transports
                  connected at once → one block per transport so users can
                  see their LTE resolvers separately from WiFi. Falls back
                  to "System DNS" when getprop was the only working path
                  and we couldn't classify by transport. */}
              <DnsBlock systemDns={info.systemDns} />

              <View style={styles.divider} />

              {/* DNS Reachability — public-resolver latency probes */}
              <View style={styles.dnsSection}>
                <View style={styles.dnsHeader}>
                  <Icon name="speedometer" size={16} color={Colors.textMuted} />
                  <Text style={styles.dnsLabel}>{t('publicResolverLatency')}</Text>
                </View>
                {info.dns.map((dns, index) => (
                  <View key={`probe-${index}`} style={styles.dnsRow}>
                    <View style={styles.dnsDot} />
                    <Text style={styles.dnsText}>{dns}</Text>
                  </View>
                ))}
              </View>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={32} color={Colors.error} />
              <Text style={styles.errorText}>{t('fetchInfoFailed')}</Text>
            </View>
          )}

          {/* Refresh button */}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={fetchInfo}
            disabled={loading}
            activeOpacity={0.7}>
            <Icon name="refresh" size={18} color={Colors.white} />
            <Text style={styles.refreshText}>{t('refresh')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function DnsBlock({systemDns}: {systemDns: import('../types').SystemDnsInfo}) {
  const transports = Object.entries(systemDns.perTransport).filter(
    ([, ips]) => ips.length > 0,
  );

  // Decide what to render based on how many transports we have DNS for.
  // - 0 transports: native couldn't classify (likely getprop fallback path).
  //   Fall through to the legacy `servers` list with a generic "System DNS"
  //   header so users still see something.
  // - 1 transport: single labelled block, no duplication.
  // - 2+: one block per transport — what users with WiFi+LTE want to see.
  const showFallback = transports.length === 0;

  return (
    <View style={styles.dnsSection}>
      {showFallback ? (
        <DnsGroup
          icon="dns"
          label="System DNS"
          ips={systemDns.servers}
          privateDnsServer={systemDns.privateDnsServer}
          privateDnsActive={systemDns.privateDnsActive}
          emptyText={
            systemDns.privateDnsServer
              ? `${systemDns.privateDnsServer} · DoT`
              : 'not exposed by OS'
          }
        />
      ) : (
        transports.map(([transport, ips], idx) => (
          <View
            key={transport}
            style={idx > 0 ? {marginTop: Spacing.md} : undefined}>
            <DnsGroup
              icon={iconForTransport(transport)}
              label={`${transport.toUpperCase()} DNS`}
              ips={ips}
              privateDnsServer={systemDns.privateDnsServer}
              privateDnsActive={systemDns.privateDnsActive}
              emptyText="hidden"
            />
          </View>
        ))
      )}
    </View>
  );
}

function DnsGroup({
  icon,
  label,
  ips,
  privateDnsServer,
  privateDnsActive,
  emptyText,
}: {
  icon: string;
  label: string;
  ips: string[];
  privateDnsServer: string | null;
  privateDnsActive: boolean;
  emptyText: string;
}) {
  return (
    <>
      <View style={styles.dnsHeader}>
        <Icon name={icon} size={16} color={Colors.textMuted} />
        <Text style={styles.dnsLabel}>{label}</Text>
      </View>
      {ips.length > 0 ? (
        ips.map((ip, i) => {
          const isPrivate = privateDnsActive && ip === privateDnsServer;
          return (
            <View key={`${label}-${i}`} style={styles.dnsRow}>
              <View
                style={[
                  styles.dnsDot,
                  isPrivate && {backgroundColor: Colors.success},
                ]}
              />
              <Text style={styles.dnsText}>
                {ip}
                {isPrivate && ' · DoT'}
              </Text>
            </View>
          );
        })
      ) : (
        <View style={styles.dnsRow}>
          <Text style={[styles.dnsText, {fontStyle: 'italic'}]}>
            {emptyText}
          </Text>
        </View>
      )}
    </>
  );
}

function iconForTransport(transport: string): string {
  switch (transport) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
      return 'signal';
    case 'ethernet':
      return 'ethernet';
    case 'vpn':
      return 'vpn';
    default:
      return 'dns';
  }
}

function InfoRow({
  icon,
  label,
  value,
  mono,
  color,
  small,
}: {
  icon: string;
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
  small?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelRow}>
        <Icon name={icon} size={16} color={Colors.textMuted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text
        style={[
          styles.infoValue,
          mono && styles.monoText,
          color ? {color} : {},
          small ? {fontSize: FontSize.xs} : {},
        ]}
        numberOfLines={2}
        selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.surfaceBorder,
    paddingBottom: Spacing.xxl,
    // Cap modal at 85% of viewport. Without this the modal grows
    // with content and the close button on the header rolls off the
    // top of the screen for users with WiFi + LTE + lots of DNS info.
    maxHeight: '85%',
    ...Shadow.modal,
  },
  scrollArea: {
    // ScrollView shrinks to fit by default — flexShrink keeps the header
    // pinned and lets the middle area give up space when content grows.
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  closeBtn: {
    padding: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.xxl,
    marginVertical: Spacing.sm,
  },
  body: {
    paddingHorizontal: Spacing.xxl,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.md,
  },
  infoRow: {
    paddingVertical: Spacing.md,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 6,
  },
  infoLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    color: Colors.text,
    fontSize: FontSize.md,
    paddingLeft: Spacing.xxl,
  },
  monoText: {
    fontFamily: FontFamily.mono,
  },
  dnsSection: {
    paddingVertical: Spacing.md,
  },
  dnsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dnsLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xxl,
    gap: Spacing.sm,
  },
  dnsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  dnsText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  refreshText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
