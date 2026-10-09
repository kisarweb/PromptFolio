import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Cpu, Clapperboard, Braces, AlertTriangle } from 'lucide-react';
import {
  useListPrompts, useGetDeliveryCapabilities, useListAssets, useExecuteDelivery, getListAssetsQueryKey,
  getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey, getListPromptsQueryKey,
  type Modality, type ExecuteInputAspectRatio, type PromptVariable,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, EmptyState, ErrorState } from '@/components/pf/States';
import { Markdown } from '@/components/pf/Markdown';
import { ImageCard, VideoCard, AudioCard, TextCard } from '@/components/executor/AssetCards';
import { BrandReferenceField } from '@/components/executor/BrandReferenceField';
import { useToast } from '@/hooks/use-toast';
import { MODALITIES, MODALITY_ICON, apiErrorMessage } from '@/lib/pf';
import { BRAND_VAR, toBrandInput, type BrandRef } from '@/lib/references';
import { fieldError, isRequired } from '@/lib/variables';
import { VariableInfo } from '@/components/pf/VariableInfo';
import { cn } from '@/lib/utils';
import { getLastEngine, setLastEngine } from '@/lib/engines';

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const DURATIONS = [5, 10];

function Seg<T extends string | number,>({ value, options, onChange, testid }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; testid: string }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-muted/40 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={String(o.v)} onClick={() => onChange(o.v)} data-testid={`${testid}-${o.v}`} className={cn('rounded-md py-1.5 font-mono text-xs transition-all', value === o.v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{o.label}</button>
      ))}
    </div>
  );
}

export default function Executor() {
  const { t } = useTranslation();
  const params = useParams<{ modality?: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const modality: Modality = (MODALITIES as string[]).includes(params.modality ?? '') ? (params.modality as Modality) : 'image';
  const initialPrompt = new URLSearchParams(search).get('prompt') ?? '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader eyebrow={t('sidebar.delivery')} title={t('delivery.title')} subtitle={t('delivery.subtitle')} />
      <div className="rise mb-6 flex gap-1 overflow-x-auto rounded-2xl border bg-card p-1.5">
        {MODALITIES.map((m) => {
          const Icon = MODALITY_ICON[m];
          return (
            <button key={m} onClick={() => setLocation(`/executor/${m}`)} data-testid={`tab-${m}`}
              className={cn('relative flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 sm:px-4 text-sm font-medium transition-all', modality === m ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <Icon className="h-4 w-4" />{t(`delivery.tabs.${m}`)}
            </button>
          );
        })}
      </div>
      <Workspace key={modality} modality={modality} initialPrompt={initialPrompt} />
    </div>
  );
}

function Workspace({ modality, initialPrompt }: { modality: Modality; initialPrompt: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const prompts = useListPrompts({ publishedOnly: true, modality });
  const caps = useGetDeliveryCapabilities();
  const assets = useListAssets({ modality });
  const exec = useExecuteDelivery();

  const [promptId, setPromptId] = useState(initialPrompt);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState('');
  const [brandRefs, setBrandRefs] = useState<BrandRef[]>([]);
  const [engine, setEngine] = useState('');
  const [aspect, setAspect] = useState<ExecuteInputAspectRatio>(modality === 'video' ? '16:9' : '1:1');
  const [duration, setDuration] = useState(5);
  const [voice, setVoice] = useState('alloy');
  const [elapsed, setElapsed] = useState(0);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const prompt = prompts.data?.find((p) => p.id === promptId);
  const inputVars = prompt?.variables.filter((v) => v.name !== BRAND_VAR) ?? [];
  const brandVar = prompt?.variables.find((v) => v.name === BRAND_VAR);
  const brandMissing = !!brandVar && isRequired(brandVar) && brandRefs.length === 0;
  const problems: { v: PromptVariable; kind: 'required' | 'option' }[] = [
    ...(brandMissing && brandVar ? [{ v: brandVar, kind: 'required' as const }] : []),
    ...inputVars.flatMap((v) => { const e = fieldError(v, values[v.name]); return e ? [{ v, kind: e }] : []; }),
  ];
  const [showErrors, setShowErrors] = useState(false);
  const invalid = new Set(problems.map((p) => p.v.name));
  const focusField = (name: string) => document.querySelector<HTMLElement>(name === BRAND_VAR ? '[data-testid="input-brand-reference"]' : `[data-testid="input-var-${name}"]`)?.focus();
  // Only engines that can actually run this modality right now; the user always picks one explicitly.
  const engines = useMemo(() => (caps.data?.find((c) => c.modality === modality)?.engines ?? []).filter((e) => e.available), [caps.data, modality]);
  const missingReason = caps.data?.find((c) => c.modality === modality)?.engines.find((e) => !e.available)?.reason;
  const selected = engines.find((e) => e.id === engine);
  const voices = selected?.voices?.length ? selected.voices : VOICES;
  const durations = selected?.durations?.length ? selected.durations : DURATIONS;

  useEffect(() => {
    if (!engines.length || engines.some((e) => e.id === engine)) return;
    const preferred = prompt?.preferredMcpId ?? undefined;
    const last = getLastEngine(modality);
    setEngine((engines.find((e) => e.id === preferred) ?? engines.find((e) => e.id === last) ?? engines[0]).id);
  }, [engines, engine, prompt?.preferredMcpId, modality]);

  useEffect(() => {
    if (!prompt?.preferredMcpId) return;
    if (engines.some((e) => e.id === prompt.preferredMcpId)) setEngine(prompt.preferredMcpId);
  }, [prompt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!voices.includes(voice)) setVoice(voices[0]); }, [voices, voice]);
  useEffect(() => {
    if (!durations.includes(duration)) setDuration(durations.reduce((a, b) => (Math.abs(b - 5) < Math.abs(a - 5) ? b : a)));
  }, [durations, duration]);
  const pickEngine = (id: string) => { setEngine(id); setLastEngine(modality, id); };

  useEffect(() => {
    if (!promptId && prompts.data?.length) setPromptId(prompts.data[0].id);
  }, [prompts.data, promptId]);

  useEffect(() => {
    if (!prompt) return;
    const v: Record<string, string> = {};
    prompt.variables.forEach((x) => (v[x.name] = x.defaultValue ?? ''));
    setValues(v);
    setShowErrors(false);
  }, [prompt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!exec.isPending) return;
    setElapsed(0);
    const start = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(iv);
  }, [exec.isPending]);

  const run = () => {
    if (!prompt || !selected) return;
    if (problems.length) {
      setShowErrors(true);
      focusField(problems[0].v.name);
      return;
    }
    setLastError(null);
    exec.mutate({
      data: {
        promptId: prompt.id, modality, variables: values, engineId: selected.id,
        extraInstructions: extra || null,
        brandReferences: brandRefs.map(toBrandInput),
        ...(modality === 'image' || modality === 'video' ? { aspectRatio: aspect } : {}),
        ...(modality === 'video' ? { durationSeconds: duration } : {}),
        ...(modality === 'audio' ? { voice } : {}),
      },
    }, {
      onSuccess: (a) => {
        setFreshId(a.id);
        qc.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        qc.invalidateQueries({ queryKey: getListPromptsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        toast({
          title: t('delivery.done'),
          description: a.storageStatus === 'saved' ? t('delivery.autosave_badge', { provider: t(`provider.${a.storageProviderUsed}`) }) : a.storageStatus === 'simulated' ? t('delivery.simulated') : `${t('delivery.failed')}: ${a.storageMessage ?? ''}`,
          variant: a.storageStatus === 'failed' ? 'destructive' : 'default',
        });
      },
      onError: (e) => {
        const msg = apiErrorMessage(e);
        setLastError(msg);
        toast({ variant: 'destructive', title: t('common.error'), description: msg });
      },
    });
  };

  const stages = t('delivery.stages', { returnObjects: true }) as string[];
  const stageIdx = Math.min(stages.length - 1, elapsed < 2 ? 0 : elapsed < 5 ? 1 : elapsed < 25 ? 2 : 3);
  const Card = modality === 'image' ? ImageCard : modality === 'video' ? VideoCard : modality === 'audio' ? AudioCard : TextCard;
  const Icon = MODALITY_ICON[modality];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rise rounded-2xl border bg-card p-4">
          <Label className="eyebrow">{t('delivery.prompt')}</Label>
          {prompts.isLoading ? <Skeleton className="mt-2 h-10" /> : !prompts.data?.length ? (
            <div className="mt-2 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              {t('delivery.noPrompts', { modality: t(`modality.${modality}`).toLowerCase() })}
              <Link href="/builder/prompts" className="mt-2 flex items-center justify-center gap-1 font-medium text-primary" data-testid="link-build-prompt"><Braces className="h-3.5 w-3.5" />{t('delivery.noPromptsCta')}</Link>
            </div>
          ) : (
            <Select value={promptId} onValueChange={setPromptId}>
              <SelectTrigger className="mt-2 min-w-0 [&>span]:truncate" data-testid="select-prompt"><SelectValue placeholder={t('delivery.pickPrompt')} /></SelectTrigger>
              <SelectContent>{prompts.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.title} <span className="ml-1 font-mono text-[10px] text-muted-foreground">v{p.version}</span></SelectItem>)}</SelectContent>
            </Select>
          )}
          {prompt && (
            <div className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-muted/50 p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground"><Markdown content={prompt.promptTemplate} className="text-[11.5px]" /></div>
          )}
        </div>

        {prompt && (
          <div className="rise rounded-2xl border bg-card p-4" style={{ animationDelay: '60ms' }}>
            <div className="eyebrow mb-3">{t('delivery.inputs')}</div>
            <div className={cn('mb-4 border-b pb-4', showErrors && brandMissing && '[&_[data-testid=input-brand-reference]]:border-destructive')}><BrandReferenceField value={brandRefs} onChange={setBrandRefs} variable={brandVar} /></div>
            {inputVars.length === 0 ? <p className="text-xs italic text-muted-foreground">{t('delivery.noVars')}</p> : (
              <div className="space-y-3">
                {inputVars.map((v) => {
                  const set = (val: string) => setValues((cur) => ({ ...cur, [v.name]: val }));
                  const err = showErrors && invalid.has(v.name);
                  const errCls = err ? 'border-destructive focus-visible:ring-destructive/40' : '';
                  return (
                    <div key={v.name}>
                      <Label className="flex items-center gap-1.5 text-xs">
                        <span className="min-w-0 truncate">{v.label || v.name}</span>
                        <VariableInfo variable={v} onUseExample={v.options?.length ? undefined : set} />
                        <span className="var-chip ml-auto min-w-0 max-w-[48%] truncate">{`{{${v.name}}}`}</span>
                      </Label>
                      {v.options?.length ? (
                        <Select value={v.options.includes(values[v.name] ?? '') ? values[v.name] : ''} onValueChange={set}>
                          <SelectTrigger className={cn('mt-1.5', errCls)} data-testid={`input-var-${v.name}`}><SelectValue placeholder={t('fieldInfo.choose')} /></SelectTrigger>
                          <SelectContent>{v.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (v.defaultValue?.length ?? 0) > 60 || (v.examples ?? []).some((ex) => ex.length > 80) ? (
                        <Textarea value={values[v.name] ?? ''} onChange={(e) => set(e.target.value)} placeholder={v.description ?? v.examples?.[0] ?? ''} className={cn('mt-1.5 min-h-[70px] text-sm', errCls)} data-testid={`input-var-${v.name}`} />
                      ) : (
                        <Input value={values[v.name] ?? ''} onChange={(e) => set(e.target.value)} placeholder={v.description ?? v.examples?.[0] ?? ''} className={cn('mt-1.5', errCls)} data-testid={`input-var-${v.name}`} />
                      )}
                      {err && <p className="mt-1 text-[11px] text-destructive">{fieldError(v, values[v.name]) === 'option' ? t('fieldInfo.errOption') : t('fieldInfo.errRequired')}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4"><Label className="text-xs">{t('delivery.extra')}</Label><Textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={t('delivery.extraPlaceholder')} className="mt-1.5 min-h-[60px] text-sm" data-testid="input-extra" /></div>
          </div>
        )}

        <div className="rise space-y-4 rounded-2xl border bg-card p-4" style={{ animationDelay: '120ms' }}>
          <div>
            <Label className="eyebrow flex items-center gap-1.5"><Cpu className="h-3 w-3" />{t('delivery.engine')}</Label>
            {caps.isLoading ? <Skeleton className="mt-2 h-10" /> : !engines.length ? (
              <div className="mt-2 rounded-lg border border-dashed border-warning/50 p-3 text-xs text-warning" data-testid="text-no-engine">
                {t('delivery.noEngine', { kind: t(`settings.kind.${modality}`) })}
                {missingReason && <span className="mt-1 block text-muted-foreground">{missingReason}</span>}
                <Link href="/settings" className="mt-1.5 block font-medium text-primary">{t('settings.mcpTitle')}</Link>
              </div>
            ) : (
              <>
                <Select value={selected ? engine : ''} onValueChange={pickEngine}>
                  <SelectTrigger className="mt-2 min-w-0 [&>span]:truncate" data-testid="select-engine"><SelectValue placeholder={t('delivery.pickEngine')} /></SelectTrigger>
                  <SelectContent>
                    {engines.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{t('delivery.engineHint', { kind: t(`settings.kind.${modality}`) })}</p>
              </>
            )}
          </div>
          {(modality === 'image' || modality === 'video') && (
            <div>
              <Label className="eyebrow">{t('delivery.aspect')}</Label>
              <div className="mt-2"><Seg value={aspect} onChange={(v) => setAspect(v)} testid="button-aspect" options={(modality === 'image' ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16']).map((v) => ({ v: v as ExecuteInputAspectRatio, label: v }))} /></div>
            </div>
          )}
          {modality === 'video' && (
            <div><Label className="eyebrow">{t('delivery.duration')}</Label><div className="mt-2"><Seg value={duration} onChange={(v) => setDuration(v)} testid="button-duration" options={durations.map((d) => ({ v: d, label: `${d}s` }))} /></div></div>
          )}
          {modality === 'audio' && (
            <div>
              <Label className="eyebrow">{t('delivery.voice')}</Label>
              <div className="mt-2 grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto">
                {voices.map((v) => <button key={v} onClick={() => setVoice(v)} data-testid={`button-voice-${v}`} className={cn('rounded-lg border py-1.5 text-xs capitalize transition-all', voice === v ? 'border-accent bg-accent/12 text-accent' : 'text-muted-foreground hover:bg-muted')}>{v}</button>)}
              </div>
            </div>
          )}
          {prompt && problems.length > 0 && (
            <div className="rounded-lg border border-dashed px-3 py-2 text-[11.5px] text-muted-foreground" data-testid="text-missing-fields">
              <span>{t('fieldInfo.blocked', { count: problems.length })} </span>
              {problems.map((p, i) => (
                <span key={p.v.name}>
                  <button type="button" onClick={() => { setShowErrors(true); focusField(p.v.name); }} className="font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary">{p.v.label || p.v.name}</button>
                  {i < problems.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
          <Button onClick={run} disabled={!prompt || !selected || exec.isPending || problems.length > 0} size="lg" className="pop h-12 w-full text-[15px]" data-testid="button-execute">
            {exec.isPending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('delivery.executing')}</> : <><Play />{t('delivery.execute')}</>}
          </Button>
        </div>
      </aside>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="font-display text-lg font-semibold">{t('delivery.results')}</div>
          <span className="font-mono text-xs text-muted-foreground">{assets.data?.length ?? 0}</span>
        </div>

        {exec.isPending && (
          <div className="rise relative mb-6 overflow-hidden rounded-2xl border border-primary/30 bg-card p-6" data-testid="status-executing">
            <div className="scan absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
            <div className="relative flex items-center gap-4">
              <div className="relative grid h-14 w-14 place-items-center">
                <div className="spin-slow absolute inset-0 rounded-full border-2 border-dashed border-primary/50" />
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-display text-lg font-semibold">{stages[stageIdx]}</div>
                <div className="font-mono text-xs text-muted-foreground">{t('delivery.elapsed', { s: elapsed })}</div>
              </div>
            </div>
            <div className="relative mt-5 grid grid-cols-4 gap-2">
              {stages.map((s, i) => (
                <div key={s}>
                  <div className="h-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full origin-left bg-primary transition-transform duration-700', i < stageIdx ? 'scale-x-100' : i === stageIdx ? 'scale-x-50 animate-pulse' : 'scale-x-0')} /></div>
                  <div className={cn('mt-1.5 text-[10.5px]', i <= stageIdx ? 'text-foreground' : 'text-muted-foreground')}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lastError && !exec.isPending && (
          <div className="rise mb-6 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 p-4 text-sm" data-testid="text-execute-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1"><div className="font-medium text-destructive">{t('common.error')}</div><div className="text-muted-foreground">{lastError}</div></div>
            <Link href="/settings?tab=mcp" className="text-xs font-medium text-primary">{t('settings.tabs.mcp')}</Link>
          </div>
        )}

        {assets.isLoading ? (
          <div className={cn('grid gap-4', modality === 'image' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'xl:grid-cols-2')}>{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}</div>
        ) : assets.isError ? <ErrorState onRetry={() => assets.refetch()} /> : !assets.data?.length ? (
          !exec.isPending && <EmptyState icon={Clapperboard} title={t('delivery.noResults')} body={t('delivery.noResultsBody')} />
        ) : (
          <div className={cn('grid gap-4', modality === 'image' ? 'sm:grid-cols-2 xl:grid-cols-3' : modality === 'text' ? 'grid-cols-1' : 'xl:grid-cols-2')}>
            {assets.data.map((a, i) => <div key={a.id} className="rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}><Card asset={a} fresh={a.id === freshId} /></div>)}
          </div>
        )}
      </section>
    </div>
  );
}
