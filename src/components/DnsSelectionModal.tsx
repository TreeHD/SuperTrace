import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Spacing, BorderRadius, FontSize, FontFamily, Shadow} from '../theme';

interface DnsSelectionModalProps {
  visible: boolean;
  domain: string;
  ips: string[];
  onSelect: (ip: string) => void;
  onClose: () => void;
}

export default function DnsSelectionModal({
  visible,
  domain,
  ips,
  onSelect,
  onClose,
}: DnsSelectionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Multiple IPs Detected</Text>
              <Text style={styles.subtitle}>{domain} resolves to {ips.length} IPs</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <FlatList
            data={ips}
            keyExtractor={item => item}
            style={styles.list}
            renderItem={({item}) => (
              <TouchableOpacity
                style={styles.ipRow}
                onPress={() => onSelect(item)}
                activeOpacity={0.7}>
                <View style={styles.ipContent}>
                  <Icon name="ip-network" size={20} color={Colors.accent} style={styles.ipIcon} />
                  <Text style={styles.ipText}>{item}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
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
    maxHeight: '75%',
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
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
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
    marginBottom: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  ipContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ipIcon: {
    marginRight: Spacing.sm,
  },
  ipText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: FontFamily.mono,
    fontWeight: '600',
  },
});
