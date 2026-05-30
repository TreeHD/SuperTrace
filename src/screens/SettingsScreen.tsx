import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useI18n, type Locale} from '../i18n';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontFamily,
} from '../theme';

interface LanguageOption {
  locale: Locale;
  // We deliberately label the entries in their own native script so users
  // who can't read the current UI language can still find the right one.
  label: string;
  subtitle: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {locale: 'en', label: 'English', subtitle: 'en-US'},
  {locale: 'zh-TW', label: '繁體中文', subtitle: 'zh-TW'},
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const {t, locale, setLocale} = useI18n();

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.6}>
          <Icon name="chevron-left" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Language section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('language')}</Text>
          <View style={styles.card}>
            {LANGUAGE_OPTIONS.map((option, idx) => {
              const selected = option.locale === locale;
              return (
                <TouchableOpacity
                  key={option.locale}
                  onPress={() => setLocale(option.locale)}
                  style={[
                    styles.row,
                    idx > 0 && styles.rowDivider,
                  ]}
                  activeOpacity={0.6}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{option.label}</Text>
                    <Text style={styles.rowSubtitle}>{option.subtitle}</Text>
                  </View>
                  {selected && (
                    <Icon name="check" size={20} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* About section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('about')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('appName')}</Text>
              <Text style={styles.rowValueMono}>1.0</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  scrollContent: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  section: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: Colors.text,
    fontSize: FontSize.md,
  },
  rowSubtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.mono,
    marginTop: 2,
  },
  rowValueMono: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.mono,
  },
});
