import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2, Pencil, Check, X, Sparkles, ImageOff, Timer, Search } from 'lucide-react';
import {
  useListReferences, useGetReferenceStats, useUpdateReferenceSettings, useCleanupReferences, useBulkDeleteReferences,
  useRenameReference, useDeleteReference, getListReferencesQueryKey, getGetReferenceStatsQueryKey,
  type ReferenceImage, type ListReferencesSort, type ReferenceDeleteResult,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/pf/States';
import { useToast } from '@/hooks/use-toast';
import { useReferenceUpload } from '@/hooks/use-reference-upload';
import { apiErrorMessage } from '@/lib/pf';
import { formatBytes } from '@/lib/references';
import { cn } from '@/lib/utils';

const OFF = 'off';
const DAY_OPTIONS = [30, 60, 90];

type Pending = { title: string; body: string; run: () => Promise<ReferenceDeleteResult> } | null;

export function ReferencesTab() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ListReferencesSort>('recent');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cleanDays, setCleanDays] = useState('60');
  const [confirm, setConfirm] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const params = { search: search || undefined, sort, limit: 500 };
  const list = useListReferences(params);
  const stats = useGetReferenceStats();
  const updateSettings = useUpdateReferenceSettings();
  const cleanup = useCleanupReferences();
  const bulk = useBulkDeleteReferences();
  const del = useDeleteReference();
  const { upload, pending } = useReferenceUpload();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListReferencesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetReferenceStatsQueryKey() });
  };
  const fail = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });
  const freedToast = (r: ReferenceDeleteResult) => toast({ title: t('references.deletedN', { count: r.count, size: formatBytes(r.freedBytes) }) });

  const items = list.data ?? [];
  const allSelected = items.length > 0 && items.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const setAuto = (v: string) => {
    updateSettings.mutate({ data: { autoCleanupDays: v === OFF ? null : Number(v) } }, {
      onSuccess: (s) => { qc.setQueryData(getGetReferenceStatsQueryKey(), s); refresh(); toast({ title: t('common.saved') }); },
      onError: fail,
    });
  };

  const previewCleanup = () => {
    const days = Number(cleanDays);
    cleanup.mutate({ data: { unusedForDays: days, dryRun: true } }, {
      onSuccess: (r) => {
        if (!r.count) {
          toast({ title: t('references.nothingToClean', { days }) });
          return;
        }
        setConfirm({
          title: t('references.cleanupConfirmTitle', { count: r.count }),
          body: t('references.cleanupConfirmBody', { count: r.count, size: formatBytes(r.freedBytes), days }),
          run: () => cleanup.mutateAsync({ data: { unusedForDays: days, dryRun: false } }),
        });
      },
      onError: fail,
    });
  };

  const askBulk = () => {
    const ids = [...selected];
    const size = items.filter((r) => selected.has(r.id)).reduce((a, r) => a + r.sizeBytes, 0);
    setConfirm({
      title: t('references.bulkConfirmTitle', { count: ids.length }),
      body: t('references.bulkConfirmBody', { count: ids.length, size: formatBytes(size) }),
      run: () => bulk.mutateAsync({ data: { ids } }),
    });
  };

  const askDelete = (r: ReferenceImage) => setConfirm({
    title: t('references.deleteConfirmTitle', { code: r.code }),
    body: t('references.deleteConfirmBody', { size: formatBytes(r.sizeBytes) }),
    run: () => del.mutateAsync({ id: r.id }),
  });

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const r = await confirm.run();
      freedToast(r);
      setSelected(new Set());
      refresh();
      setConfirm(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language) : t('references.never'));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold">{t('references.title')}</h2>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{t('references.body')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: t('references.statCount'), value: stats.data ? String(stats.data.count) : null },
            { label: t('references.statSize'), value: stats.data ? formatBytes(stats.data.totalBytes) : null },
            { label: t('references.statNeverUsed'), value: stats.data ? String(stats.data.neverUsedCount) : null },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <div className="eyebrow">{s.label}</div>
              {s.value === null ? <Skeleton className="mt-2 h-7 w-20" /> : <div className="mt-1 font-display text-2xl font-semibold" data-testid={`stat-${s.label}`}>{s.value}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 font-medium"><Timer className="h-4 w-4 text-primary" />{t('references.autoTitle')}</div>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">{t('references.autoBody')}</p>
          <Select value={stats.data?.autoCleanupDays ? String(stats.data.autoCleanupDays) : OFF} onValueChange={setAuto} disabled={!stats.data || updateSettings.isPending}>
            <SelectTrigger className="max-w-xs" data-testid="select-auto-cleanup"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={OFF}>{t('references.autoOff')}</SelectItem>
              {DAY_OPTIONS.map((d) => <SelectItem key={d} value={String(d)}>{t('references.autoDays', { days: d })}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" />{t('references.cleanTitle')}</div>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">{t('references.cleanBody')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={cleanDays} onValueChange={setCleanDays}>
              <SelectTrigger className="w-48" data-testid="select-clean-days"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 7, ...DAY_OPTIONS].map((d) => <SelectItem key={d} value={String(d)}>{d === 0 ? t('references.cleanAll') : t('references.unusedFor', { days: d })}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={previewCleanup} disabled={cleanup.isPending} data-testid="button-preview-cleanup"><Trash2 className="h-4 w-4" />{t('references.cleanButton')}</Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('references.searchPlaceholder')} className="pl-9" data-testid="input-references-search" />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as ListReferencesSort)}>
            <SelectTrigger className="w-44" data-testid="select-references-sort"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['recent', 'lastUsed', 'size', 'code'] as const).map((s) => <SelectItem key={s} value={s}>{t(`references.sort.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => fileRef.current?.click()} disabled={pending > 0} data-testid="button-upload-reference"><Upload className="h-4 w-4" />{pending ? t('references.uploading', { count: pending }) : t('references.upload')}</Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(Array.from(e.target.files ?? []), 'upload'); e.target.value = ''; }} />
        </div>

        {items.length > 0 && (
          <div className="mb-3 flex items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={(c) => setSelected(c ? new Set(items.map((r) => r.id)) : new Set())} data-testid="checkbox-select-all" />
              {t('references.selectAll')}
            </label>
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={askBulk} data-testid="button-bulk-delete"><Trash2 className="h-3.5 w-3.5" />{t('references.deleteSelected', { count: selected.size })}</Button>
            )}
          </div>
        )}

        {list.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-xl" />)}</div>
        ) : list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !items.length ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            <ImageOff className="h-6 w-6" />{search ? t('references.noMatch', { q: search }) : t('references.emptyLibrary')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((r) => (
              <RefCard key={r.id} r={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} onDelete={() => askDelete(r)} fmtDate={fmtDate} onRenamed={refresh} />
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void runConfirm(); }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
              {t('references.deleteForever')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RefCard({ r, checked, onToggle, onDelete, fmtDate, onRenamed }: { r: ReferenceImage; checked: boolean; onToggle: () => void; onDelete: () => void; fmtDate: (iso?: string | null) => string; onRenamed: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const rename = useRenameReference();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(r.code);

  const save = () => {
    if (code.trim().replace(/^@/, '') === r.code) return setEditing(false);
    rename.mutate({ id: r.id, data: { code } }, {
      onSuccess: () => { setEditing(false); onRenamed(); },
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    });
  };

  return (
    <div className={cn('group overflow-hidden rounded-xl border bg-card transition-all', checked && 'border-primary ring-2 ring-primary/30')} data-testid={`card-reference-${r.code}`}>
      <div className="relative">
        <a href={r.fileUrl} target="_blank" rel="noreferrer"><img src={r.thumbUrl} alt={r.code} loading="lazy" className="aspect-square w-full bg-muted object-cover" /></a>
        <div className="absolute left-2 top-2 rounded bg-background/80 p-1 backdrop-blur"><Checkbox checked={checked} onCheckedChange={onToggle} aria-label={r.code} data-testid={`checkbox-reference-${r.code}`} /></div>
        <button onClick={onDelete} title={t('references.deleteForever')} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100" data-testid={`button-delete-reference-${r.code}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1 p-2.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input value={code} autoFocus onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setCode(r.code); setEditing(false); } }} className="h-7 px-2 font-mono text-xs" data-testid={`input-rename-${r.code}`} />
            <button onClick={save} disabled={rename.isPending} className="grid h-7 w-7 place-items-center rounded-md text-success hover:bg-muted"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setCode(r.code); setEditing(false); }} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex w-full items-center gap-1 text-left font-mono text-[12px] font-medium hover:text-primary" title={t('references.rename')} data-testid={`button-rename-${r.code}`}>
            <span className="truncate">@{r.code}</span><Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
        )}
        <div className="font-mono text-[10.5px] text-muted-foreground">{r.width}×{r.height} · {formatBytes(r.sizeBytes)}</div>
        <div className="flex justify-between text-[10.5px] text-muted-foreground">
          <span>{t('references.uses', { count: r.useCount })}</span>
          <span title={t('references.lastUsed')}>{fmtDate(r.lastUsedAt)}</span>
        </div>
      </div>
    </div>
  );
}
