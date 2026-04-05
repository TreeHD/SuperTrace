import React, {useState, useCallback} from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  StatusBar,
  Text,
  Animated,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import InputBar from '../components/InputBar';
import HopCard from '../components/HopCard';
import HopDetailModal from '../components/HopDetailModal';
import PingRetryModal from '../components/PingRetryModal';
import InfoModal from '../components/InfoModal';
import MapWebView from '../components/MapWebView';
import DnsSelectionModal from '../components/DnsSelectionModal';
import {useTraceroute} from '../hooks/useTraceroute';
import {useHistory} from '../hooks/useHistory';
import {resolveDns} from '../services/tracerouteService';
import {Colors, Spacing, FontSize, FontFamily} from '../theme';
import type {HopData, ViewMode} from '../types';

export default function TracerouteScreen() {
  const insets = useSafeAreaInsets();
  const {hops, status, target, error, trace, stop, reset} = useTraceroute();

  const [viewMode, setViewMode] = useState<ViewMode>('trace');
  const [selectedHop, setSelectedHop] = useState<HopData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showPing, setShowPing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [pingTarget, setPingTarget] = useState('');

  const {history, addHistory, clearHistory} = useHistory();
  const [showDnsModal, setShowDnsModal] = useState(false);
  const [dnsOptions, setDnsOptions] = useState<string[]>([]);
  const [pendingDomain, setPendingDomain] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const handleTrace = useCallback(
    async (host: string) => {
      addHistory(host);
      const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');
      
      if (isIp) {
        trace(host);
        return;
      }
      
      setIsResolving(true);
      const ips = await resolveDns(host);
      setIsResolving(false);
      
      if (ips.length > 1) {
        setPendingDomain(host);
        setDnsOptions(ips);
        setShowDnsModal(true);
      } else if (ips.length === 1) {
        trace(ips[0]);
      } else {
        trace(host);
      }
    },
    [trace, addHistory],
  );

  const handleDnsSelect = useCallback((ip: string) => {
    setShowDnsModal(false);
    trace(ip);
  }, [trace]);

  const handleToggleMap = useCallback(() => {
    setViewMode(prev => (prev === 'trace' ? 'map' : 'trace'));
  }, []);

  const handleHopPress = useCallback((hop: HopData) => {
    setSelectedHop(hop);
    setShowDetail(true);
  }, []);

  const handleRetryPing = useCallback(() => {
    if (selectedHop?.ip) {
      setPingTarget(selectedHop.ip);
      setShowDetail(false);
      setShowPing(true);
    }
  }, [selectedHop]);

  const renderHop = useCallback(
    ({item, index}: {item: HopData; index: number}) => (
      <HopCard
        hop={item}
        onPress={() => handleHopPress(item)}
        isLast={item.done}
      />
    ),
    [handleHopPress],
  );

  const keyExtractor = useCallback((item: HopData) => `${item.hop}`, []);

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {status === 'idle' && hops.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🌐</Text>
          <Text style={styles.emptyTitle}>SuperTrace</Text>
          <Text style={styles.emptySubtitle}>
            Enter an IP address or domain to start tracing
          </Text>
        </View>
      )}
      {target && (
        <View style={styles.targetBanner}>
          <Text style={styles.targetLabel}>Tracing to</Text>
          <Text style={styles.targetValue}>{target}</Text>
          {status === 'done' && (
            <Text style={styles.targetDone}>
              ✓ {hops.length} hops
            </Text>
          )}
        </View>
      )}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}
    </View>
  );

  const renderFooter = () => {
    if (status !== 'running') return null;
    return (
      <View style={styles.loadingFooter}>
        <View style={styles.pulsingDot} />
        <Text style={styles.loadingText}>Probing hop {hops.length + 1}...</Text>
      </View>
    );
  };

  if (viewMode === 'map') {
    return (
      <View style={[styles.container, {paddingTop: insets.top}]}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <InputBar
          onTrace={handleTrace}
          onStop={stop}
          onToggleMap={handleToggleMap}
          onShowInfo={() => setShowInfo(true)}
          status={status}
          viewMode={viewMode}
          isResolving={isResolving}
          history={history}
          clearHistory={clearHistory}
        />

        {/* Top 50%: Trace results */}
        <View style={styles.splitTop}>
          <FlatList
            data={hops}
            renderItem={renderHop}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.splitListContent}
            ListHeaderComponent={
              target ? (
                <View style={styles.targetBannerCompact}>
                  <Text style={styles.targetValueCompact}>{target}</Text>
                  {status === 'done' && (
                    <Text style={styles.targetDoneCompact}>
                      ✓ {hops.length} hops
                    </Text>
                  )}
                </View>
              ) : null
            }
            ListFooterComponent={renderFooter}
          />
        </View>

        {/* Bottom 50%: Map */}
        <View style={styles.splitBottom}>
          <View style={styles.mapDivider}>
            <View style={styles.mapDividerHandle} />
          </View>
          <MapWebView hops={hops} />
        </View>

        {/* Modals */}
        <HopDetailModal
          visible={showDetail}
          hop={selectedHop}
          onClose={() => setShowDetail(false)}
          onRetryPing={handleRetryPing}
        />
        <PingRetryModal
          visible={showPing}
          ip={pingTarget}
          onClose={() => setShowPing(false)}
        />
        <InfoModal
          visible={showInfo}
          onClose={() => setShowInfo(false)}
        />
        <DnsSelectionModal
          visible={showDnsModal}
          domain={pendingDomain}
          ips={dnsOptions}
          onSelect={handleDnsSelect}
          onClose={() => setShowDnsModal(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <InputBar
        onTrace={handleTrace}
        onStop={stop}
        onToggleMap={handleToggleMap}
        onShowInfo={() => setShowInfo(true)}
        status={status}
        viewMode={viewMode}
        isResolving={isResolving}
        history={history}
        clearHistory={clearHistory}
      />
      <FlatList
        data={hops}
        renderItem={renderHop}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
      />

      {/* Modals */}
      <HopDetailModal
        visible={showDetail}
        hop={selectedHop}
        onClose={() => setShowDetail(false)}
        onRetryPing={handleRetryPing}
      />
      <PingRetryModal
        visible={showPing}
        ip={pingTarget}
        onClose={() => setShowPing(false)}
      />
      <InfoModal
        visible={showInfo}
        onClose={() => setShowInfo(false)}
      />
      <DnsSelectionModal
        visible={showDnsModal}
        domain={pendingDomain}
        ips={dnsOptions}
        onSelect={handleDnsSelect}
        onClose={() => setShowDnsModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  listHeader: {
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: Spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  targetBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  targetLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  targetValue: {
    color: Colors.accent,
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
    fontWeight: '600',
    flex: 1,
  },
  targetDone: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  errorBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
  },
  loadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  // Map split view
  splitTop: {
    flex: 1,
  },
  splitListContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  splitBottom: {
    flex: 1,
    borderTopWidth: 0,
  },
  mapDivider: {
    height: 12,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  mapDividerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
  },
  targetBannerCompact: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  targetValueCompact: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
    fontWeight: '600',
    flex: 1,
  },
  targetDoneCompact: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
