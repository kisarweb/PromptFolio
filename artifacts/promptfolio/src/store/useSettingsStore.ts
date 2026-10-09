import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/lib/i18n';

export type ThemeMode = 'light' | 'dark';
export type Lang = 'pt-BR' | 'en-US';

interface SettingsState {
  theme: ThemeMode;
  language: Lang;
  setTheme: (t: ThemeMode) => void;
  setLanguage: (l: Lang) => void;
}

export function applyTheme(t: ThemeMode) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'pt-BR',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setLanguage: (language) => {
        void i18n.changeLanguage(language);
        document.documentElement.lang = language;
        set({ language });
      },
    }),
    {
      name: 'pf-settings',
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? 'dark');
        if (state?.language) void i18n.changeLanguage(state.language);
      },
    },
  ),
);
