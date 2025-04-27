import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from './en/translation.json';
import translationZH from './zh/translation.json';

// 本地存储语言选择的键
export const LANGUAGE_STORAGE_KEY = 'midscene_browser_language';

// 资源
const resources = {
  en: {
    translation: translationEN
  },
  zh: {
    translation: translationZH
  }
};

// 从localStorage获取语言设置
const getSavedLanguage = () => {
  try {
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return savedLanguage || 'zh'; // 默认中文
  } catch (e) {
    console.error('Failed to get language from localStorage', e);
    return 'zh';
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// 设置语言
export const setLanguage = (language: string) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    i18n.changeLanguage(language);
  } catch (e) {
    console.error('Failed to save language to localStorage', e);
  }
};

export default i18n; 