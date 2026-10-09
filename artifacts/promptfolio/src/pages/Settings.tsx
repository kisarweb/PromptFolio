import { useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Palette, Bot, Plug, HardDrive, Images, Moon, Sun, Check } from 'lucide-react';
import { PageHeader } from '@/components/pf/States';
import { usePreferenceActions } from '@/components/pf/Controls';
import { AgentsTab } from '@/components/settings/AgentsTab';
import { McpTab } from '@/components/settings/McpTab';
import { StorageTab } from '@/components/settings/StorageTab';
import { ReferencesTab } from '@/components/settings/ReferencesTab';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'appearance', icon: Palette },
  { id: 'agents', icon: Bot },
  { id: 'mcp', icon: Plug },
  { id: 'storage', icon: HardDrive },
  { id: 'references', icon: Images },
] as const;

function Appearance() {
  const { t } = useTranslation();
  const { theme, language, changeTheme, changeLanguage } = usePreferenceActions();
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold">{t('settings.theme')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('settings.themeBody')}</p>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          {(['dark', 'light'] as const).map((m) => (
            <button key={m} onClick={() => changeTheme(m)} data-testid={`button-theme-${m}`} className={cn('group overflow-hidden rounded-2xl border text-left transition-all', theme === m ? 'border-primary ring-2 ring-primary/30' : 'hover:border-foreground/30')}>
              <div className={cn('relative h-32 p-3', m === 'dark' ? 'bg-[hsl(222_28%_6%)]' : 'bg-[hsl(38_30%_94%)]')}>
                <div className={cn('absolute inset-y-3 left-3 w-12 rounded-md', m === 'dark' ? 'bg-[hsl(222_30%_9%)]' : 'bg-[hsl(36_26%_88%)]')} />
                <div className={cn('absolute left-[4.5rem] right-3 top-3 h-14 rounded-md', m === 'dark' ? 'bg-[hsl(222_26%_10%)]' : 'bg-[hsl(40_38%_98%)]')} />
                <div className="absolute bottom-3 left-[4.5rem] h-6 w-20 rounded-md" style={{ background: m === 'dark' ? 'hsl(12 95% 58%)' : 'hsl(11 88% 50%)' }} />
                <div className="absolute bottom-3 left-[10.5rem] h-6 w-10 rounded-md" style={{ background: m === 'dark' ? 'hsl(166 62% 52%)' : 'hsl(168 52% 32%)' }} />
              </div>
              <div className="flex items-center gap-2 bg-card px-4 py-3 text-sm font-medium">
                {m === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{t(`topbar.${m}`)}
                {theme === m && <Check className="ml-auto h-4 w-4 text-primary" />}
              </div>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-xl font-bold">{t('settings.language')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('settings.languageBody')}</p>
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          {([['pt-BR', 'Português (Brasil)'], ['en-US', 'English (US)']] as const).map(([code, label]) => (
            <button key={code} onClick={() => changeLanguage(code)} data-testid={`button-language-${code}`} className={cn('flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all', language === code ? 'border-primary ring-2 ring-primary/30' : 'hover:border-foreground/30')}>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted font-mono text-xs font-semibold">{code.slice(0, 2).toUpperCase()}</span>
              <div><div className="font-medium">{label}</div><div className="font-mono text-[11px] text-muted-foreground">{code}</div></div>
              {language === code && <Check className="ml-auto h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const raw = new URLSearchParams(search).get('tab');
  const tab = TABS.some((x) => x.id === raw) ? raw! : 'appearance';
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader eyebrow={t('sidebar.system')} title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="rise mb-8 flex gap-1 overflow-x-auto border-b">
        {TABS.map((x) => (
          <button key={x.id} onClick={() => setLocation(`/settings?tab=${x.id}`)} data-testid={`tab-settings-${x.id}`} className={cn('relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm transition-colors', tab === x.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <x.icon className={cn('h-4 w-4', tab === x.id && 'text-primary')} />{t(`settings.tabs.${x.id}`)}
            <span className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-transform', tab === x.id ? 'scale-x-100' : 'scale-x-0')} />
          </button>
        ))}
      </div>
      <div key={tab} className="rise">
        {tab === 'appearance' && <Appearance />}
        {tab === 'agents' && <AgentsTab />}
        {tab === 'mcp' && <McpTab />}
        {tab === 'storage' && <StorageTab />}
        {tab === 'references' && <ReferencesTab />}
      </div>
    </div>
  );
}
