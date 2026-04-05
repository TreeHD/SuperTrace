import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow } from '../theme';
import { pingHost } from '../services/tracerouteService';
import type { PingSummary, PingResult } from '../types';

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
    setSummary(null);

    let received = 0;
    let totalRtt = 0;
    let minRtt = Infinity;
    let maxRtt = 0;
    const currentResults: PingResult[] = [];

    const syncSummary = (sentCount: number) => {
      setSummary({
        sent: sentCount,
        received,
        lost: sentCount > 0 ? sentCount - received : 0,
        lossPercent: sentCount > 0 ? ((sentCount - received) / sentCount) * 100 : 0,
        minRtt: minRtt === Infinity ? 0 : minRtt,
        avgRtt: received > 0 ? totalRtt / received : 0,
        maxRtt,
        results: [...currentResults],
      });
    };

    try {
      console.log('UI: Starting ping sequence for', ip);
      
      for (let i = 1; i <= count; i++) {
        if (!isPingingRef.current) break;

        const singleResult = await pingHost(ip, 1, 3000);
        console.log('UI Data Received:', singleResult);

        if (singleResult && singleResult.results && singleResult.results.length > 0) {
          const hit = singleResult.results[0];
          console.log(`UI Debug: Processing packet seq=${i}, RTT=${hit.rtt} (${typeof hit.rtt})`);
          
          // Clone results to avoid reference issues
          const resultEntry: PingResult = {
            seq: i,
            ip: hit.ip || ip,
            rtt: typeof hit.rtt === 'number' ? hit.rtt : null,
            error: hit.error
          };
          
          currentResults.push(resultEntry);
          
          if (typeof resultEntry.rtt === 'number') {
            received++;
            totalRtt += resultEntry.rtt;
            if (resultEntry.rtt < minRtt) minRtt = resultEntry.rtt;
            if (resultEntry.rtt > maxRtt) maxRtt = resultEntry.rtt;
          }
        } else {
          currentResults.push({ seq: i, ip, rtt: null, error: 'TIMEOUT' });
        }

        syncSummary(i);

        if (i < count && isPingingRef.current) {
          await new Promise<void>(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (e: any) {
      console.error('UI ERROR:', e);
      setError(e.message || 'Ping failed');
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
            disabled={pinging}>
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

          {/* Results Section - Now Always Rendered for Stability */}
          <View style={styles.resultsSection}>
            <View style={styles.divider} />
            
            {summary ? (
              <View style={{ flex: 1 }}>
                <View style={styles.statsRow}>
                  <View style={{ position: 'absolute', top: -14, left: Spacing.xxl }}>
                     <Text style={{ color: Colors.accent, fontSize: 10, fontWeight: '700' }}>[RESULTS READY]</Text>
                  </View>
                  <StatBadge label="Sent" value={`${summary.sent}`} color={Colors.text} />
                  <StatBadge label="Online" value={`${summary.received}`} color={Colors.success} />
                  <StatBadge label="Loss" value={`${summary.lossPercent.toFixed(0)}%`} 
                    color={summary.lossPercent > 0 ? Colors.error : Colors.success} />
                </View>

                {/* RTT Summary */}
                <View style={styles.rttStatsRow}>
                  <View style={styles.rttStatItem}>
                     <Text style={styles.rttStatLabel}>Min / Avg / Max RTT (ms)</Text>
                     <Text style={[styles.rttStatValue, { color: Colors.accent, fontSize: FontSize.md }]}>
                       {summary.minRtt.toFixed(1)} / {summary.avgRtt.toFixed(1)} / {summary.maxRtt.toFixed(1)}
                     </Text>
                  </View>
                </View>

                <ScrollView 
                  style={styles.resultsScroll}
                  contentContainerStyle={styles.resultsScrollContent}>
                  {summary.results.map((item, index) => (
                    <View key={`${item.seq}-${index}`} style={styles.pingCard}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.seqText}>Seq #{item.seq}</Text>
                        <Text style={[styles.statusText, { color: typeof item.rtt === 'number' ? Colors.success : Colors.error }]}>
                          {typeof item.rtt === 'number' ? 'REPLY' : 'TIMEOUT'}
                        </Text>
                      </View>
                      <View style={styles.cardBody}>
                        {typeof item.rtt === 'number' ? (
                          <Text style={styles.rttText}>{item.rtt.toFixed(2)} ms</Text>
                        ) : (
                          <Text style={styles.cardErrorText}>Request Timeout</Text>
                        )}
                        <Text style={styles.ipText}>{ip}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={{ paddingVertical: Spacing.xl }}>
                     <Text style={{ color: 'magenta', fontSize: 10, textAlign: 'center', opacity: 0.6 }}>[ END OF DATA ]</Text>
                  </View>
                </ScrollView>
              </View>
            ) : (
              <View style={styles.placeholderContainer}>
                {pinging ? (
                  <View style={{ alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={Colors.accent} />
                    <Text style={[styles.placeholderText, { marginTop: 10 }]}>Waiting for native response...</Text>
                  </View>
                ) : (
                  <Text style={styles.placeholderText}>Hit START to begin diagnostic test</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string; }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
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
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    height: 720, // PULLED UP HIGHER
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.md, // FLOATING EFFECT
    paddingBottom: Spacing.xl,
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
    opacity: 0.7,
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
    flex: 1, // Let it fill the 720px modal
    marginTop: Spacing.sm,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
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
    padding: Spacing.sm,
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
  resultsScroll: {
    flex: 1,
    marginTop: Spacing.sm,
  },
  resultsScrollContent: {
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  pingCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: Colors.accent, // BRIGHT CYAN
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  seqText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rttText: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  ipText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
  },
  cardErrorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
