import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow} from '../theme';
import {getLocalNetworkInfo} from '../services/networkInfoService';
import type {LocalNetworkInfo} from '../types';

interface InfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function InfoModal({visible, onClose}: InfoModalProps) {
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
              <Text style={styles.title}>Network Info</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Fetching network info...</Text>
            </View>
          ) : info ? (
            <View style={styles.body}>
              {/* Connection Type */}
              <InfoRow
                icon="wifi"
                label="Connection Type"
                value={info.connectionType.toUpperCase()}
                color={Colors.accent}
              />

              <View style={styles.divider} />

              {/* IPv4 */}
              <InfoRow
                icon="numeric-4-box"
                label="Public IPv4"
                value={info.ipv4 || 'Not available'}
                mono
              />

              {/* IPv6 */}
              <InfoRow
                icon="numeric-6-box"
                label="Public IPv6"
                value={info.ipv6 || 'Not available'}
                mono
                small
              />

              <View style={styles.divider} />

              {/* DNS */}
              <View style={styles.dnsSection}>
                <View style={styles.dnsHeader}>
                  <Icon name="dns" size={16} color={Colors.textMuted} />
                  <Text style={styles.dnsLabel}>DNS Resolution Test</Text>
                </View>
                {info.dns.map((dns, index) => (
                  <View key={index} style={styles.dnsRow}>
                    <View style={styles.dnsDot} />
                    <Text style={styles.dnsText}>{dns}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={32} color={Colors.error} />
              <Text style={styles.errorText}>Failed to fetch info</Text>
            </View>
          )}

          {/* Refresh button */}
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={fetchInfo}
            disabled={loading}
            activeOpacity={0.7}>
            <Icon name="refresh" size={18} color={Colors.white} />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
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
