import { Moon, Sun, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUpdatePreferences, useGetSession } from '@workspace/api-client-react';
import { useSettingsStore, type Lang, type ThemeMode } from '@/store/useSettingsStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Theme + language preference controller; persists to server when logged in. */
export function usePreferenceActions() {
  const { theme, language, setTheme, setLanguage } = useSettingsStore();
  const { data: session } = useGetSession();
  const update = useUpdatePreferences();
  const authed = !!session?.authenticated;
  return {
    theme,
    language,
    changeTheme: (t: ThemeMode) => {
      setTheme(t);
      if (authed) update.mutate({ data: { theme: t } });
    },
    changeLanguage: (l: Lang) => {
      setLanguage(l);
      if (authed) update.mutate({ data: { language: l } });
    },
  };
}

export function ThemeLangControls({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, language, changeTheme, changeLanguage } = usePreferenceActions();
  return (
    <div className={cn('flex items-center gap-1 rounded-full border bg-card/70 p-1 backdrop-blur', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            data-testid="button-toggle-theme"
            onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
            className="pop relative grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('topbar.theme')}</TooltipContent>
      </Tooltip>
      <div className="flex items-center rounded-full bg-muted/60 p-0.5">
        <Languages className="mx-1 h-3 w-3 text-muted-foreground" />
        {(['pt-BR', 'en-US'] as Lang[]).map((l) => (
          <button
            key={l}
            data-testid={`button-lang-${l}`}
            onClick={() => changeLanguage(l)}
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[10px] font-medium transition-all',
              language === l ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {l === 'pt-BR' ? 'PT' : 'EN'}
          </button>
        ))}
      </div>
    </div>
  );
}
