import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow} from '../theme';
import {getCountryFlag} from '../services/geoIpService';
import type {HopData} from '../types';

interface HopDetailModalProps {
  visible: boolean;
  hop: HopData | null;
  onClose: () => void;
  onRetryPing: () => void;
}

export default function HopDetailModal({
  visible,
  hop,
  onClose,
  onRetryPing,
}: HopDetailModalProps) {
  if (!hop) return null;

  const flag = hop.geoIp?.country_code
    ? getCountryFlag(hop.geoIp.country_code)
    : '🌐';

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
              <View style={[styles.hopBadge, hop.done && styles.hopBadgeDone]}>
                <Text style={styles.hopNumber}>{hop.hop}</Text>
              </View>
              <Text style={styles.title}>Hop Details</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <ScrollView style={styles.body}>
            {/* IP */}
            <DetailRow
              icon="ip-network"
              label="IP Address"
              value={hop.ip || '* * *'}
              mono
            />

            {/* FQDN */}
            <DetailRow
              icon="dns"
              label="FQDN"
              value={hop.fqdn || 'N/A'}
              mono
            />

            <View style={styles.divider} />

            {/* Country */}
            <DetailRow
              icon="earth"
              label="Country"
              value={
                hop.geoIp
                  ? `${flag} ${hop.geoIp.country || 'Unknown'}`
                  : 'N/A'
              }
            />

            {/* City */}
            <DetailRow
              icon="city"
              label="City"
              value={hop.geoIp?.city || 'N/A'}
            />

            <View style={styles.divider} />

            {/* ASN */}
            <DetailRow
              icon="numeric"
              label="ASN"
              value={hop.geoIp?.asn ? `AS${hop.geoIp.asn}` : 'N/A'}
              mono
            />

            {/* ASN Organization */}
            <DetailRow
              icon="office-building"
              label="ASN Organization"
              value={hop.geoIp?.asn_organization || 'N/A'}
            />

            <View style={styles.divider} />

            {/* RTT */}
            <View style={styles.rttSection}>
              <Text style={styles.rttLabel}>Round Trip Time</Text>
              <View style={styles.rttRow}>
                <RttBadge label="RTT 1" value={hop.rtt1} />
                <RttBadge label="RTT 2" value={hop.rtt2} />
                <RttBadge label="RTT 3" value={hop.rtt3} />
              </View>
            </View>
          </ScrollView>

          {/* Retry Ping Button */}
          {hop.ip && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRetryPing}
              activeOpacity={0.7}>
              <Icon name="refresh" size={18} color={Colors.white} />
              <Text style={styles.retryText}>Retry Ping</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLabelRow}>
        <Icon name={icon} size={16} color={Colors.textMuted} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.detailValue, mono && styles.monoText]}
        numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function RttBadge({label, value}: {label: string; value: number | null}) {
  const color =
    value === null || value === undefined
      ? Colors.textMuted
      : value < 30
      ? Colors.success
      : value < 100
      ? Colors.warning
      : Colors.error;

  return (
    <View style={styles.rttBadge}>
      <Text style={styles.rttBadgeLabel}>{label}</Text>
      <Text style={[styles.rttBadgeValue, {color}]}>
        {value !== null && value !== undefined ? `${value.toFixed(1)} ms` : '—'}
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
    maxHeight: '80%',
    ...Shadow.modal,
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
  hopBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hopBadgeDone: {
    backgroundColor: Colors.accent,
  },
  hopNumber: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
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
  detailRow: {
    paddingVertical: Spacing.sm,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    color: Colors.text,
    fontSize: FontSize.md,
    paddingLeft: Spacing.xxl,
  },
  monoText: {
    fontFamily: FontFamily.mono,
  },
  rttSection: {
    paddingVertical: Spacing.sm,
  },
  rttLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  rttRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rttBadge: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  rttBadgeLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 4,
  },
  rttBadgeValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.mono,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.xxl,
    marginBottom: Spacing.xxl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.glow,
  },
  retryText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
