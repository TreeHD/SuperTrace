import React, {useState} from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Text,
  Keyboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow} from '../theme';
import type {TracerouteStatus, ViewMode} from '../types';

interface InputBarProps {
  onTrace: (host: string) => void;
  onStop: () => void;
  onToggleMap: () => void;
  onShowInfo: () => void;
  status: TracerouteStatus;
  viewMode: ViewMode;
  isResolving?: boolean;
  history?: string[];
  clearHistory?: () => void;
}

export default function InputBar({
  onTrace,
  onStop,
  onToggleMap,
  onShowInfo,
  status,
  viewMode,
  isResolving = false,
  history = [],
  clearHistory,
}: InputBarProps) {
  const [host, setHost] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const isRunning = status === 'running' || isResolving;

  const handleTrace = () => {
    const trimmed = host.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setIsFocused(false);
    onTrace(trimmed);
  };

  const handleStop = () => {
    onStop();
  };

  const handleSelectHistory = (h: string) => {
    setHost(h);
    Keyboard.dismiss();
    setIsFocused(false);
    onTrace(h);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <Icon name="server-network" size={18} color={Colors.textMuted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Enter IP or domain (e.g. 8.8.8.8)"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="go"
            onSubmitEditing={handleTrace}
            editable={!isRunning}
            selectionColor={Colors.primary}
          />
          {host.length > 0 && !isRunning && (
            <TouchableOpacity onPress={() => setHost('')} style={styles.clearBtn}>
              <Icon name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.traceButton,
            isRunning && styles.stopButton,
            !host.trim() && !isRunning && styles.disabledButton,
          ]}
          onPress={isRunning ? handleStop : handleTrace}
          disabled={!host.trim() && !isRunning}
          activeOpacity={0.7}>
          {isResolving ? (
            <>
              <ActivityIndicator size="small" color={Colors.white} />
              <Text style={styles.buttonText}>Resolving...</Text>
            </>
          ) : isRunning ? (
            <>
              <ActivityIndicator size="small" color={Colors.white} />
              <Text style={styles.buttonText}>Stop</Text>
            </>
          ) : (
            <>
              <Icon name="radar" size={18} color={Colors.white} />
              <Text style={styles.buttonText}>Trace</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.iconButton,
            viewMode === 'map' && styles.iconButtonActive,
          ]}
          onPress={onToggleMap}
          activeOpacity={0.7}>
          <Icon
            name="map-marker-path"
            size={20}
            color={viewMode === 'map' ? Colors.primary : Colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={onShowInfo}
          activeOpacity={0.7}>
          <Icon
            name="information-outline"
            size={20}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* History Dropdown Overlay */}
      {isFocused && history.length > 0 && !isRunning && (
        <View style={styles.historyContainer}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Recent Traces</Text>
            <TouchableOpacity onPress={clearHistory}>
              <Text style={styles.historyClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          {history.map((h, i) => (
            <TouchableOpacity 
              key={i} 
              style={styles.historyItem}
              onPress={() => handleSelectHistory(h)}>
              <Icon name="history" size={16} color={Colors.textMuted} />
              <Text style={styles.historyText} numberOfLines={1}>{h}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    zIndex: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    zIndex: 11,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    height: 44,
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  traceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.glow,
  },
  stopButton: {
    backgroundColor: Colors.error,
    shadowColor: Colors.error,
  },
  disabledButton: {
    backgroundColor: Colors.surfaceLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
  },
  clearBtn: {
    padding: Spacing.xs,
  },
  historyContainer: {
    position: 'absolute',
    top: 70, // Below the input bar
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: Spacing.xs,
    zIndex: 99,
    ...Shadow.glow,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    marginBottom: Spacing.xs,
  },
  historyTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  historyClear: {
    color: Colors.accent,
    fontSize: FontSize.xs,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  historyText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
  },
});
