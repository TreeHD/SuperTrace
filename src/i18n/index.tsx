import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {NativeModules, Platform} from 'react-native';
import {en, type TranslationKey, type Translations} from './en';
import {zhTW} from './zhTW';

export type Locale = 'en' | 'zh-TW';
const SUPPORTED_LOCALES: Locale[] = ['en', 'zh-TW'];

const dictionaries: Record<Locale, Translations> = {
  'en': en,
  'zh-TW': zhTW,
};

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const {LocaleModule} = NativeModules as {
  LocaleModule?: {
    getApplicationLocale: () => Promise<string | null>;
    setApplicationLocale: (tag: string | null) => Promise<void>;
  };
};

/**
 * Match a BCP-47 locale tag (whatever the platform reports — could be
 * "zh-Hant-TW", "zh-TW", "en-US", "en") to one of our supported locales.
 * We treat "zh-*" with a TW or Hant subtag as zh-TW; everything else
 * falls back to English. This is intentionally simple — we ship two
 * languages, not a locale matcher.
 */
function pickLocale(tag: string | null | undefined): Locale {
  if (!tag) return 'en';
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh') && (lower.includes('tw') || lower.includes('hant'))) {
    return 'zh-TW';
  }
  return 'en';
}

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({children}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>('en');

  // On mount, ask the platform what locale this app is running in.
  // On Android 13+ this consults the per-app locale set via system
  // Settings; below that, AppCompatDelegate's stored value.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android' && LocaleModule?.getApplicationLocale) {
          const tag = await LocaleModule.getApplicationLocale();
          if (!cancelled) setLocaleState(pickLocale(tag));
        }
      } catch {
        // Stay on default 'en' — better than crashing the app.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    setLocaleState(next);
    // Best-effort persist via native — failure here doesn't affect the
    // in-memory switch we just did, so the UI updates regardless.
    if (Platform.OS === 'android' && LocaleModule?.setApplicationLocale) {
      LocaleModule.setApplicationLocale(next).catch(() => {});
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const dict = dictionaries[locale] ?? en;
      let str: string = dict[key] ?? en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({locale, setLocale, t}), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

/** Shortcut hook for components that only need `t`. */
export function useT() {
  return useI18n().t;
}

export {SUPPORTED_LOCALES};
export type {TranslationKey};
