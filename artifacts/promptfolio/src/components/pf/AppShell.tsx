import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Bot, Braces, Clapperboard, Library, Settings, GraduationCap, LogOut, Menu, Cloud, X,
} from 'lucide-react';
import { useLogout, getGetSessionQueryKey, type User } from '@workspace/api-client-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Logo } from './Logo';
import { ThemeLangControls } from './Controls';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: typeof Bot; testId: string };

function NavGroup({ title, items, location, onNavigate }: { title: string; items: NavItem[]; location: string; onNavigate: () => void }) {
  return (
    <div className="mb-5">
      <div className="eyebrow mb-2 px-3 !text-[0.6rem]">{title}</div>
      <div className="space-y-0.5">
        {items.map((it) => {
          const active = it.href === '/' ? location === '/' : location.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              data-testid={it.testId}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )}
            >
              <span className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all', active ? 'opacity-100' : 'opacity-0 scale-y-0')} />
              <it.icon className={cn('h-4 w-4 transition-colors', active ? 'text-primary' : 'group-hover:text-foreground')} />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        qc.clear();
        void qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
        setLocation('/');
      },
    },
  });
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const close = () => setOpen(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={close} className="flex items-center gap-2.5 px-4 pb-6 pt-5" data-testid="link-logo">
        <Logo />
        <div>
          <div className="font-display text-[17px] font-bold leading-none">PromptFolio</div>
          <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">{t('app.tagline')}</div>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2">
        <NavGroup title={t('sidebar.home')} location={location} onNavigate={close} items={[{ href: '/', label: t('sidebar.home'), icon: LayoutDashboard, testId: 'link-home' }]} />
        <NavGroup title={t('sidebar.builder')} location={location} onNavigate={close} items={[
          { href: '/builder/agents', label: t('sidebar.agents'), icon: Bot, testId: 'link-builder-agents' },
          { href: '/builder/prompts', label: t('sidebar.prompts'), icon: Braces, testId: 'link-builder-prompts' },
        ]} />
        <NavGroup title={t('sidebar.delivery')} location={location} onNavigate={close} items={[{ href: '/executor', label: t('sidebar.delivery'), icon: Clapperboard, testId: 'link-executor' }]} />
        <NavGroup title={t('sidebar.library')} location={location} onNavigate={close} items={[{ href: '/catalog', label: t('sidebar.catalog'), icon: Library, testId: 'link-catalog' }]} />
        <NavGroup title={t('sidebar.system')} location={location} onNavigate={close} items={[
          { href: '/settings', label: t('sidebar.settings'), icon: Settings, testId: 'link-settings' },
          { href: '/tutorials', label: t('sidebar.tutorials'), icon: GraduationCap, testId: 'link-tutorials' },
        ]} />
      </nav>
      <div className="m-2 rounded-xl border bg-card/60 p-3">
        <Link href="/settings?tab=storage" onClick={close} className="mb-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" data-testid="link-active-storage">
          <Cloud className="h-3.5 w-3.5 text-accent" />
          {t('sidebar.storage')} <span className="font-medium text-foreground">{t(`provider.${user.activeStorageProvider}`)}</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 border">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium" data-testid="text-username">
              <span className="truncate">{user.name}</span>
              {user.isDemo && <span className="rounded border border-warning/40 bg-warning/10 px-1 font-mono text-[9px] uppercase text-warning" data-testid="status-demo">{t('sidebar.demo')}</span>}
            </div>
            <div className="truncate text-[11px] text-muted-foreground" data-testid="text-email">{user.email}</div>
          </div>
          <button onClick={() => logout.mutate()} disabled={logout.isPending} title={t('sidebar.logout')} data-testid="button-logout" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] w-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={close} />
          <aside className="rise absolute inset-y-0 left-0 w-72 border-r bg-sidebar">
            <button onClick={close} className="absolute right-3 top-4 text-muted-foreground" data-testid="button-close-menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/75 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden" data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              {location === '/' ? t('sidebar.home') : location.split('/').filter(Boolean).slice(0, 2).join(' / ')}
            </div>
          </div>
          <ThemeLangControls />
        </header>
        <main className="safelight relative min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
