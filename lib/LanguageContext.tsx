import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { getLocales } from 'expo-localization';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import en from './locales/en';
import zhHant from './locales/zh-Hant';
import zhHans from './locales/zh-Hans';

export type LocaleCode = 'en' | 'zh-Hant' | 'zh-Hans';

type LanguageContextType = {
  locale: LocaleCode;
  t: (key: string, params?: Record<string, string>) => string;
  changeLanguage: (locale: LocaleCode) => void;
};

const translations: Record<LocaleCode, Record<string, string>> = {
  en,
  'zh-Hant': zhHant,
  'zh-Hans': zhHans,
};

const LanguageContext = createContext<LanguageContextType>({
  locale: 'en',
  t: (key: string) => key,
  changeLanguage: () => {},
});

function getDeviceLocale(): LocaleCode {
  try {
    const locales = getLocales();
    const primary = locales?.[0]?.languageTag || '';
    if (primary.startsWith('zh-Hant') || primary.startsWith('zh-TW') || primary.startsWith('zh-HK')) {
      return 'zh-Hant';
    }
    if (primary.startsWith('zh-Hans') || primary.startsWith('zh-CN') || primary.startsWith('zh-SG')) {
      return 'zh-Hans';
    }
    if (primary.startsWith('zh')) {
      // Generic zh with no region — default to Simplified
      return 'zh-Hans';
    }
    return 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocale] = useState<LocaleCode>(getDeviceLocale());

  useEffect(() => {
    if (user) {
      (async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('preferred_language')
            .eq('id', user.id)
            .single();

          if (
            profile?.preferred_language &&
            (profile.preferred_language === 'en' ||
              profile.preferred_language === 'zh-Hant' ||
              profile.preferred_language === 'zh-Hans')
          ) {
            setLocale(profile.preferred_language as LocaleCode);
          }
        } catch (error) {
          console.error('Error loading language preference:', error);
        }
      })();
    }
  }, [user]);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const strings = translations[locale] || en;
      let value = strings[key];
      if (value === undefined) {
        // Fallback: try English
        value = en[key];
      }
      if (value === undefined) {
        return key; // key not found, return the key itself
      }
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, v);
        }
      }
      return value;
    },
    [locale]
  );

  const changeLanguage = useCallback((newLocale: LocaleCode) => {
    setLocale(newLocale);
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, t, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
