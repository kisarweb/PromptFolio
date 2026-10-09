import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from '@/locales/pt-BR.json';
import enUS from '@/locales/en-US.json';

const stored = (() => {
  try {
    const raw = localStorage.getItem('pf-settings');
    return raw ? (JSON.parse(raw).state?.language as string | undefined) : undefined;
  } catch {
    return undefined;
  }
})();

i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, 'en-US': { translation: enUS } },
  lng: stored ?? 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

export default i18n;
