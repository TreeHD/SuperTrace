import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily} from '../theme';
import {getCountryFlag} from '../services/geoIpService';
import type {HopData} from '../types';

interface HopCardProps {
  hop: HopData;
  onPress: () => void;
  isLast: boolean;
}

export default function HopCard({hop, onPress, isLast}: HopCardProps) {
  const avgRtt = computeAvgRtt(hop);
  const flag = hop.geoIp?.country_code
    ? getCountryFlag(hop.geoIp.country_code)
    : null;

  return (
    <TouchableOpacity
      style={[styles.container, isLast && styles.lastHop]}
      onPress={onPress}
      activeOpacity={0.6}>
      {/* Hop number badge */}
      <View style={[styles.hopBadge, hop.done && styles.hopBadgeDone]}>
        <Text style={styles.hopNumber}>{hop.hop}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Top row: IP + FQDN */}
        <View style={styles.topRow}>
          {hop.ip ? (
            <Text style={styles.ipText} numberOfLines={1}>
              {hop.ip}
            </Text>
          ) : (
            <Text style={styles.timeoutText}>* * *</Text>
          )}
          {hop.fqdnLoading ? (
            <ActivityIndicator
              size="small"
              color={Colors.textMuted}
              style={styles.miniLoader}
            />
          ) : hop.fqdn ? (
            <Text style={styles.fqdnText} numberOfLines={1}>
              {hop.fqdn}
            </Text>
          ) : null}
        </View>

        {/* Bottom row: Geo info */}
        <View style={styles.bottomRow}>
          {hop.geoLoading ? (
            <View style={styles.geoLoading}>
              <ActivityIndicator
                size="small"
                color={Colors.accent}
              />
              <Text style={styles.loadingText}>resolving...</Text>
            </View>
          ) : hop.geoIp ? (
            <View style={styles.geoInfo}>
              <Text style={styles.flagText}>{flag} </Text>
              <Text style={styles.geoText} numberOfLines={1}>
                {hop.geoIp.country}
              </Text>
            </View>
          ) : hop.ip ? (
            <Text style={styles.privateText}>Private / Unknown</Text>
          ) : null}
        </View>
      </View>

      {/* RTT */}
      <View style={styles.rttContainer}>
        {hop.ip ? (
          <>
            <Text style={[styles.rttValue, getRttColor(avgRtt)]}>
              {avgRtt !== null ? `${avgRtt.toFixed(1)}` : '—'}
            </Text>
            <Text style={styles.rttUnit}>ms</Text>
          </>
        ) : (
          <Icon name="timer-sand" size={16} color={Colors.textMuted} />
        )}
      </View>

      {/* Chevron */}
      <Icon
        name="chevron-right"
        size={18}
        color={Colors.textMuted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

function computeAvgRtt(hop: HopData): number | null {
  const rtts = [hop.rtt1, hop.rtt2, hop.rtt3].filter(
    (r): r is number => r !== null && r !== undefined && r >= 0,
  );
  if (rtts.length === 0) return null;
  return rtts.reduce((a, b) => a + b, 0) / rtts.length;
}

function getRttColor(rtt: number | null): {color: string} {
  if (rtt === null) return {color: Colors.textMuted};
  if (rtt < 30) return {color: Colors.success};
  if (rtt < 100) return {color: Colors.warning};
  return {color: Colors.error};
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  lastHop: {
    borderColor: Colors.accent,
    backgroundColor: Colors.hopActive,
  },
  hopBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  hopBadgeDone: {
    backgroundColor: Colors.accent,
  },
  hopNumber: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  topRow: {
    flexDirection: 'column',
    marginBottom: 2,
  },
  ipText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
    fontWeight: '600',
  },
  fqdnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
    marginTop: 1,
  },
  timeoutText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
    fontWeight: '600',
  },
  bottomRow: {
    marginTop: 4,
  },
  geoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagText: {
    fontSize: FontSize.sm,
  },
  geoText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  geoLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
  miniLoader: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  privateText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
  rttContainer: {
    alignItems: 'flex-end',
    minWidth: 50,
    marginRight: Spacing.xs,
  },
  rttValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.mono,
  },
  rttUnit: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  chevron: {
    marginLeft: Spacing.xs,
  },
});
