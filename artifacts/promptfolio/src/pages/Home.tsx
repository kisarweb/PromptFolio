import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { ArrowUpRight, Bot, Braces, Clapperboard, Library, Cloud, Sparkles, Rocket, MessageSquare, Plug } from 'lucide-react';
import {
  useGetDashboardSummary, useGetRecentActivity, useGetSession, useGetStorageOverview, type ActivityItemKind,
} from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, ErrorState } from '@/components/pf/States';
import { MODALITIES, MODALITY_HUE, MODALITY_ICON } from '@/lib/pf';

const KIND_ICON: Record<ActivityItemKind, typeof Bot> = {
  prompt_published: Braces, agent_published: Bot, asset_generated: Sparkles, session_started: MessageSquare,
};

export default function Home() {
  const { t, i18n } = useTranslation();
  const { data: session } = useGetSession();
  const summary = useGetDashboardSummary();
  const activity = useGetRecentActivity();
  const storage = useGetStorageOverview();
  const s = summary.data;
  const locale = i18n.language === 'pt-BR' ? ptBR : enUS;
  const first = session?.user?.name.split(' ')[0] ?? '';
  const maxAssets = Math.max(1, ...(s?.assetsByModality.map((m) => m.count) ?? [1]));

  const stats = s ? [
    { label: t('home.prompts'), value: s.totalPrompts, sub: t('home.published', { count: s.publishedPrompts }), icon: Braces },
    { label: t('home.agents'), value: s.totalAgents, sub: t('home.custom', { count: s.customAgents }), icon: Bot },
    { label: t('home.sessions'), value: s.builderSessions, sub: '', icon: MessageSquare },
    { label: t('home.assets'), value: s.totalAssets, sub: t('home.connectors', { count: s.activeMcpConnections }), icon: Rocket },
  ] : [];

  const quick = [
    { href: '/builder/agents', title: t('home.qAgent'), body: t('home.qAgentBody'), icon: Bot },
    { href: '/builder/prompts', title: t('home.qPrompt'), body: t('home.qPromptBody', { variable: '{{variable}}', 'variável': '{{variável}}' }), icon: Braces },
    { href: '/executor', title: t('home.qExec'), body: t('home.qExecBody'), icon: Clapperboard },
    { href: '/catalog', title: t('home.qCatalog'), body: t('home.qCatalogBody'), icon: Library },
  ];

  const drive = storage.data?.googleDrive;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader eyebrow={t('home.eyebrow')} title={t('home.greeting', { name: first })} subtitle={t('home.subtitle')} />

      {summary.isError ? <ErrorState onRetry={() => summary.refetch()} /> : (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border lg:grid-cols-4">
          {summary.isLoading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card p-5"><Skeleton className="h-4 w-20" /><Skeleton className="mt-4 h-10 w-16" /></div>) :
            stats.map((st, i) => (
              <div key={st.label} className="rise bg-card p-5" style={{ animationDelay: `${i * 60}ms` }} data-testid={`stat-${i}`}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">{st.label}<st.icon className="h-4 w-4" /></div>
                <div className="mt-3 font-display text-4xl font-bold tabular-nums">{st.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{st.sub || '\u00a0'}</div>
              </div>
            ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-4 font-display font-semibold">{t('home.byModality')}</div>
            <div className="space-y-3">
              {MODALITIES.map((m, i) => {
                const c = s?.assetsByModality.find((x) => x.modality === m)?.count ?? 0;
                const Icon = MODALITY_ICON[m];
                return (
                  <div key={m} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="w-16 text-sm">{t(`modality.${m}`)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full origin-left rounded-full transition-transform duration-700" style={{ background: MODALITY_HUE[m], transform: `scaleX(${summary.isLoading ? 0 : c / maxAssets})`, transitionDelay: `${i * 80}ms` }} />
                    </div>
                    <span className="w-8 text-right font-mono text-xs tabular-nums">{c}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="eyebrow mb-3">{t('home.quick')}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quick.map((q, i) => (
                <Link key={q.href} href={q.href} data-testid={`link-quick-${i}`} className="rise group relative overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md" style={{ animationDelay: `${120 + i * 60}ms` }}>
                  <div className="flex items-start justify-between">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/12 text-primary"><q.icon className="h-4 w-4" /></div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-3 font-medium">{q.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{q.body}</div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border bg-card p-5">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/15 blur-2xl" />
            <div className="eyebrow mb-3 flex items-center gap-2"><Cloud className="h-3.5 w-3.5 text-accent" />{t('home.storage')}</div>
            {storage.isLoading ? <Skeleton className="h-12 w-full" /> : storage.data && (
              <>
                <div className="font-display text-2xl font-bold" data-testid="text-active-storage">{t(`provider.${storage.data.activeProvider}`)}</div>
                {storage.data.activeProvider === 'google_drive_mcp' && drive && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {drive.isDemoSimulated ? t('settings.driveDemo') : drive.linkedViaLogin ? t('settings.driveLinked', { email: drive.accountEmail ?? '' }) : t('settings.driveNot')}
                    <div className="mt-2 font-mono text-foreground/80">{drive.rootFolderPath}</div>
                  </div>
                )}
              </>
            )}
            <Link href="/settings?tab=storage" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary" data-testid="link-manage-storage">{t('home.storageCta')} <ArrowUpRight className="h-3 w-3" /></Link>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between font-display font-semibold">{t('home.activity')}<Plug className="h-4 w-4 text-muted-foreground" /></div>
            {activity.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> :
              activity.isError ? <ErrorState onRetry={() => activity.refetch()} /> :
              !activity.data?.length ? <p className="py-6 text-center text-sm text-muted-foreground">{t('home.noActivity')}</p> : (
                <ol className="relative space-y-4 border-l pl-5">
                  {activity.data.slice(0, 10).map((a, i) => {
                    const Icon = KIND_ICON[a.kind] ?? Sparkles;
                    return (
                      <li key={a.id} className="rise relative" style={{ animationDelay: `${i * 40}ms` }} data-testid={`activity-${a.id}`}>
                        <span className="absolute -left-[27px] top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-card bg-primary" />
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" />{t(`home.kind.${a.kind}`)}{a.modality && <> · {t(`modality.${a.modality}`)}</>}</div>
                        <div className="truncate text-sm font-medium">{a.title}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale })}{a.storageProvider && <> · {t(`provider.${a.storageProvider}`)}</>}</div>
                      </li>
                    );
                  })}
                </ol>
              )}
          </section>
        </div>
      </div>
    </div>
  );
}
