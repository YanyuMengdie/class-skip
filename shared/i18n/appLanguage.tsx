import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { AppLanguage, AppPreferences } from '@/types';
import { installLegacyUiLocalization } from '@/shared/i18n/uiCatalog';

const APP_PREFERENCES_STORAGE_KEY = 'classSkip_appPreferences_v1';

const isAppLanguage = (value: unknown): value is AppLanguage => value === 'zh-CN' || value === 'en';

export const detectBrowserLanguage = (languages?: readonly string[]): AppLanguage => {
  const candidates = languages
    ?? (typeof navigator !== 'undefined'
      ? (navigator.languages?.length ? navigator.languages : [navigator.language])
      : []);
  const preferred = candidates.find((language) => Boolean(language?.trim()))?.toLowerCase() ?? '';
  return preferred === 'zh' || preferred.startsWith('zh-') ? 'zh-CN' : 'en';
};

export const loadLocalAppPreferences = (): AppPreferences | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    if (parsed.version !== 1 || !isAppLanguage(parsed.language)) return null;
    return {
      version: 1,
      language: parsed.language,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
};

export const saveLocalAppPreferences = (preferences: AppPreferences): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The application remains usable when storage is unavailable.
  }
};

let runtimeLanguage: AppLanguage = loadLocalAppPreferences()?.language ?? detectBrowserLanguage();

export const getCurrentAppLanguage = (): AppLanguage => runtimeLanguage;

export const setCurrentAppLanguage = (language: AppLanguage): void => {
  runtimeLanguage = language;
};

export const getAIOutputLanguageInstruction = (language: AppLanguage = runtimeLanguage): string => {
  if (language === 'en') {
    return `APPLICATION OUTPUT LANGUAGE (highest priority): English.
Write every learner-visible explanation, heading, question, option, summary, feedback, warning, and generated label in natural English, even when the user message, source PDF, earlier chat, or another prompt is Chinese. Preserve source quotations, filenames, citations, schema keys, IDs, and enum values exactly. If the user explicitly requests another response language in the current message, follow that request for this response only.`;
  }
  return `应用输出语言（最高优先级）：简体中文。
所有面向学习者的解释、标题、问题、选项、总结、反馈、警告和生成标签都使用自然的简体中文，即使材料或既有聊天是其他语言。原文引用、文件名、引文、Schema 字段、ID 和枚举值保持原样。若用户在本轮明确要求另一种回复语言，只对本轮服从该要求。`;
};

interface AppLanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  text: (chinese: string, english: string) => string;
}

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

export const AppLanguageProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => (
    loadLocalAppPreferences()?.language ?? detectBrowserLanguage()
  ));

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setCurrentAppLanguage(nextLanguage);
    setLanguageState(nextLanguage);
    saveLocalAppPreferences({ version: 1, language: nextLanguage, updatedAt: Date.now() });
  }, []);

  useEffect(() => {
    setCurrentAppLanguage(language);
    saveLocalAppPreferences({ version: 1, language, updatedAt: Date.now() });
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'Class Skip' : '逃课神器';
  }, [language]);

  useLayoutEffect(() => installLegacyUiLocalization(language), [language]);

  const text = useCallback(
    (chinese: string, english: string) => (language === 'en' ? english : chinese),
    [language],
  );

  const value = useMemo<AppLanguageContextValue>(() => ({ language, setLanguage, text }), [language, setLanguage, text]);
  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
};

export const useAppLanguage = (): AppLanguageContextValue => {
  const value = useContext(AppLanguageContext);
  if (!value) throw new Error('useAppLanguage must be used within AppLanguageProvider');
  return value;
};

export const localizeText = (
  chinese: string,
  english: string,
  language: AppLanguage = runtimeLanguage,
): string => (language === 'en' ? english : chinese);
