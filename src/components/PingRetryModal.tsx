import React, {useState} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow} from '../theme';
import {pingHost} from '../services/tracerouteService';
import type {PingSummary, PingResult} from '../types';

interface PingRetryModalProps {
  visible: boolean;
  ip: string;
  onClose: () => void;
}

export default function PingRetryModal({
  visible,
  ip,
  onClose,
}: PingRetryModalProps) {
  const [count, setCount] = useState(5);
  const [pinging, setPinging] = useState(false);
  const [summary, setSummary] = useState<PingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPingingRef = React.useRef(false);

  const handlePing = async () => {
    setPinging(true);
    isPingingRef.current = true;
    setError(null);
    
    let received = 0;
    let totalRtt = 0;
    let minRtt = Infinity;
    let maxRtt = 0;
    const currentResults: PingResult[] = [];

    setSummary({
      sent: 0, received: 0, lost: 0, lossPercent: 0,
      minRtt: 0, avgRtt: 0, maxRtt: 0, results: []
    });

    try {
      for (let i = 1; i <= count; i++) {
        if (!isPingingRef.current) break;

        const singleResult = await pingHost(ip, 1, 3000);
        const hit = singleResult.results[0];
        hit.seq = i; // Override the sequential index to reflect our loop
        
        currentResults.push(hit);
        
        if (hit.rtt !== null) {
          received++;
          totalRtt += hit.rtt;
          if (hit.rtt < minRtt) minRtt = hit.rtt;
          if (hit.rtt > maxRtt) maxRtt = hit.rtt;
        }

        setSummary({
          sent: i,
          received,
          lost: i - received,
          lossPercent: ((i - received) / i) * 100,
          minRtt: minRtt === Infinity ? 0 : minRtt,
          avgRtt: received > 0 ? totalRtt / received : 0,
          maxRtt,
          results: [...currentResults] 
        });

        if (i < count && isPingingRef.current) {
          await new Promise<void>(resolve => setTimeout(() => resolve(), 200));
        }
      }
    } catch (e: any) {
      if (currentResults.length === 0) {
        setError(e.message || 'Ping failed');
      }
    } finally {
      setPinging(false);
      isPingingRef.current = false;
    }
  };

  const handleClose = () => {
    isPingingRef.current = false;
    setSummary(null);
    setError(null);
    setPinging(false);
    onClose();
  };

  const incrementCount = () => setCount(c => Math.min(c + 1, 100));
  const decrementCount = () => setCount(c => Math.max(c - 1, 1));

  const presets = [1, 5, 10, 25, 50];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Ping Test</Text>
              <Text style={styles.subtitle}>{ip}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Count selector */}
          <View style={styles.countSection}>
            <Text style={styles.countLabel}>Number of Pings</Text>
            <View style={styles.countRow}>
              <TouchableOpacity
                style={styles.countBtn}
                onPress={decrementCount}
                disabled={pinging}>
                <Icon name="minus" size={20} color={Colors.text} />
              </TouchableOpacity>
              <View style={styles.countDisplay}>
                <Text style={styles.countValue}>{count}</Text>
              </View>
              <TouchableOpacity
                style={styles.countBtn}
                onPress={incrementCount}
                disabled={pinging}>
                <Icon name="plus" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Preset buttons */}
            <View style={styles.presetRow}>
              {presets.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.presetBtn,
                    count === p && styles.presetBtnActive,
                  ]}
                  onPress={() => setCount(p)}
                  disabled={pinging}>
                  <Text
                    style={[
                      styles.presetText,
                      count === p && styles.presetTextActive,
                    ]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Start button */}
          <TouchableOpacity
            style={[styles.startButton, pinging && styles.startButtonDisabled]}
            onPress={handlePing}
            disabled={pinging}
            activeOpacity={0.7}>
            {pinging ? (
              <>
                <ActivityIndicator size="small" color={Colors.white} />
                <Text style={styles.startText}>Pinging...</Text>
              </>
            ) : (
              <>
                <Icon name="play" size={18} color={Colors.white} />
                <Text style={styles.startText}>Start Ping</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Results */}
          {summary && (
            <View style={styles.resultsSection}>
              <View style={styles.divider} />

              {/* Summary stats */}
              <View style={styles.statsRow}>
                <StatBadge
                  label="Sent"
                  value={`${summary.sent}`}
                  color={Colors.text}
                />
                <StatBadge
                  label="Received"
                  value={`${summary.received}`}
                  color={Colors.success}
                />
                <StatBadge
                  label="Lost"
                  value={`${summary.lost}`}
                  color={Colors.error}
                />
                <StatBadge
                  label="Loss %"
                  value={`${summary.lossPercent.toFixed(1)}%`}
                  color={
                    summary.lossPercent === 0
                      ? Colors.success
                      : summary.lossPercent < 50
                      ? Colors.warning
                      : Colors.error
                  }
                />
              </View>

              {/* RTT stats */}
              <View style={styles.rttStatsRow}>
                <View style={styles.rttStatItem}>
                  <Text style={styles.rttStatLabel}>Min</Text>
                  <Text style={[styles.rttStatValue, {color: Colors.success}]}>
                    {summary.minRtt.toFixed(1)} ms
                  </Text>
                </View>
                <View style={styles.rttStatItem}>
                  <Text style={styles.rttStatLabel}>Avg</Text>
                  <Text style={[styles.rttStatValue, {color: Colors.accent}]}>
                    {summary.avgRtt.toFixed(1)} ms
                  </Text>
                </View>
                <View style={styles.rttStatItem}>
                  <Text style={styles.rttStatLabel}>Max</Text>
                  <Text style={[styles.rttStatValue, {color: Colors.warning}]}>
                    {summary.maxRtt.toFixed(1)} ms
                  </Text>
                </View>
              </View>

              {/* Individual results terminal */}
              <View style={styles.terminalContainer}>
                <FlatList
                  data={summary.results}
                  keyExtractor={item => `${item.seq}`}
                  style={styles.resultsList}
                  renderItem={({item}) => {
                    const isTimeout = item.rtt === null;
                    return (
                      <Text style={[styles.terminalText, isTimeout && styles.terminalTimeout]}>
                        {isTimeout
                          ? `Request timeout for icmp_seq ${item.seq}`
                          : `64 bytes from ${ip}: icmp_seq=${item.seq} time=${item.rtt?.toFixed(1)} ms`}
                      </Text>
                    );
                  }}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, {color}]}>{value}</Text>
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
    maxHeight: '85%',
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
  title: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    marginTop: 2,
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
  countSection: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  countLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  countBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countDisplay: {
    width: 80,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countValue: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    fontFamily: FontFamily.mono,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  presetBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.round,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  presetBtnActive: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderColor: Colors.primary,
  },
  presetText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  presetTextActive: {
    color: Colors.primary,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.glow,
  },
  startButtonDisabled: {
    backgroundColor: Colors.surfaceLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  startText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    flex: 1,
  },
  resultsSection: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  statBadge: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 2,
  },
  statValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: FontFamily.mono,
  },
  rttStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rttStatItem: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  rttStatLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 4,
  },
  rttStatValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    fontFamily: FontFamily.mono,
  },
  terminalContainer: {
    marginHorizontal: Spacing.xxl,
    backgroundColor: '#0D0D0D',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 200,
  },
  resultsList: {
    flexGrow: 0,
  },
  terminalText: {
    color: '#00FF41',
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
    lineHeight: 18,
  },
  terminalTimeout: {
    color: '#FF4136',
  },
});
