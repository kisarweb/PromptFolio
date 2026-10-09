import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Search, X, Download, Upload, CloudUpload, Play, Trash2, Bot, Plug, Library, FileText, Save, ChevronDown, FolderClosed } from 'lucide-react';
import {
  useListPrompts, useGetPromptFacets, useListCategories, useExportPrompts, getExportPromptsQueryKey, useImportPrompts,
  useBackupPromptsToCloud, useGetPrompt, getGetPromptQueryKey, useUpdatePrompt, useDeletePrompt, getListPromptsQueryKey,
  getGetPromptFacetsQueryKey, getGetDashboardSummaryQueryKey, useListMcpConnections,
  type Modality, type Prompt, type ListPromptsParams, type PromptVariable,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PageHeader, EmptyState, ErrorState } from '@/components/pf/States';
import { Markdown } from '@/components/pf/Markdown';
import { useToast } from '@/hooks/use-toast';
import { MODALITIES, MODALITY_ICON, MODALITY_HUE, apiErrorMessage, detectVariables, downloadText } from '@/lib/pf';
import { cn } from '@/lib/utils';
import { VariableEditor, cleanVariables } from '@/components/builder/VariableEditor';

const ALL = '__all__';

export default function Catalog() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchText, setSearchText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState(ALL);
  const [folder, setFolder] = useState(ALL);
  const [tag, setTag] = useState(ALL);
  const [modality, setModality] = useState<Modality | typeof ALL>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const h = setTimeout(() => setDebounced(searchText.trim()), 220); return () => clearTimeout(h); }, [searchText]);

  const params: ListPromptsParams = {
    ...(debounced ? { search: debounced } : {}), ...(categoryId !== ALL ? { categoryId } : {}), ...(folder !== ALL ? { folder } : {}),
    ...(tag !== ALL ? { tag } : {}), ...(modality !== ALL ? { modality } : {}),
  };
  const prompts = useListPrompts(params);
  const facets = useGetPromptFacets();
  const cats = useListCategories();
  const exportJson = useExportPrompts({ format: 'json' }, { query: { enabled: false, queryKey: getExportPromptsQueryKey({ format: 'json' }) } });
  const exportMd = useExportPrompts({ format: 'markdown' }, { query: { enabled: false, queryKey: getExportPromptsQueryKey({ format: 'markdown' }) } });
  const importer = useImportPrompts();
  const backup = useBackupPromptsToCloud();

  const filtered = Object.keys(params).length > 0;
  const clear = () => { setSearchText(''); setCategoryId(ALL); setFolder(ALL); setTag(ALL); setModality(ALL); };
  const err = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });

  const doExport = async (fmt: 'json' | 'markdown') => {
    const r = await (fmt === 'json' ? exportJson : exportMd).refetch();
    if (r.data) downloadText(r.data.content, r.data.filename, r.data.mimeType);
    else if (r.error) err(r.error);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const content = await f.text();
    importer.mutate({ data: { content } }, {
      onSuccess: (r) => {
        toast({ title: t('catalog.imported', { imported: r.imported, skipped: r.skipped }) });
        qc.invalidateQueries({ queryKey: getListPromptsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetPromptFacetsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
      onError: err,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const doBackup = () => backup.mutate(undefined, {
    onSuccess: (r) => toast({
      variant: r.status === 'failed' ? 'destructive' : 'default',
      title: r.status === 'failed' ? t('delivery.failed') : t('catalog.backupDone', { filename: r.filename }),
      description: `${t(`provider.${r.provider}`)}${r.status === 'simulated' ? ` · ${t('delivery.simulated')}` : ''}${r.message ? ` · ${r.message}` : ''}`,
      action: r.remoteViewUrl ? <a href={r.remoteViewUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">{t('delivery.view')}</a> : undefined,
    }),
    onError: err,
  });

  const FilterSelect = ({ value, onChange, label, items, testid }: { value: string; onChange: (v: string) => void; label: string; items: { v: string; l: string }[]; testid: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-9 w-auto min-w-[130px] gap-2 rounded-full text-xs', value !== ALL && 'border-primary/50 bg-primary/8 text-primary')} data-testid={testid}><span className="text-muted-foreground">{label}:</span><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{t('common.all')}</SelectItem>{items.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <PageHeader eyebrow={t('sidebar.library')} title={t('catalog.title')} subtitle={t('catalog.subtitle')} actions={<>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" data-testid="button-export"><Download />{t('catalog.export')}<ChevronDown className="opacity-60" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => doExport('json')} data-testid="menu-export-json">{t('catalog.exportJson')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => doExport('markdown')} data-testid="menu-export-md">{t('catalog.exportMd')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importer.isPending} data-testid="button-import"><Upload />{t('catalog.import')}</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="input-import-file" />
        <Button onClick={doBackup} disabled={backup.isPending} className="pop" data-testid="button-backup">{backup.isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <CloudUpload />}{t('catalog.backup')}</Button>
      </>} />

      <div className="rise sticky top-14 z-10 -mx-4 mb-6 border-b bg-background/80 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={t('catalog.search')} className="h-11 rounded-xl pl-10 text-[15px]" data-testid="input-search" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border bg-card p-1">
            <button onClick={() => setModality(ALL)} className={cn('rounded-full px-3 py-1 text-xs', modality === ALL ? 'bg-foreground text-background' : 'text-muted-foreground')} data-testid="filter-modality-all">{t('common.all')}</button>
            {MODALITIES.map((m) => {
              const Icon = MODALITY_ICON[m];
              const c = facets.data?.modalityCounts.find((x) => x.modality === m)?.count;
              return <button key={m} onClick={() => setModality(m)} data-testid={`filter-modality-${m}`} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors', modality === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}><Icon className="h-3 w-3" />{t(`modality.${m}`)}{c !== undefined && <span className="font-mono opacity-60">{c}</span>}</button>;
            })}
          </div>
          <FilterSelect value={categoryId} onChange={setCategoryId} label={t('catalog.category')} testid="filter-category" items={(cats.data ?? []).map((c) => ({ v: c.id, l: `${c.name} (${c.promptCount})` }))} />
          <FilterSelect value={folder} onChange={setFolder} label={t('catalog.folder')} testid="filter-folder" items={(facets.data?.folders ?? []).map((f) => ({ v: f, l: f }))} />
          <FilterSelect value={tag} onChange={setTag} label={t('catalog.tag')} testid="filter-tag" items={(facets.data?.tags ?? []).map((f) => ({ v: f, l: `#${f}` }))} />
          {filtered && <button onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-testid="button-clear-filters"><X className="h-3 w-3" />{t('catalog.clear')}</button>}
          <span className="ml-auto font-mono text-xs text-muted-foreground">{t('catalog.count', { count: prompts.data?.length ?? 0 })}</span>
        </div>
      </div>

      {prompts.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
      ) : prompts.isError ? <ErrorState onRetry={() => prompts.refetch()} /> : !prompts.data?.length ? (
        <EmptyState icon={Library} title={filtered ? t('catalog.noMatch') : t('catalog.empty')} body={filtered ? undefined : t('catalog.emptyBody')} action={filtered ? <Button variant="outline" onClick={clear}>{t('catalog.clear')}</Button> : undefined} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {prompts.data.map((p, i) => <PromptCard key={p.id} p={p} i={i} onOpen={() => setOpenId(p.id)} />)}
        </div>
      )}

      <PromptDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PromptCard({ p, i, onOpen }: { p: Prompt; i: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const Icon = MODALITY_ICON[p.targetModality];
  const thumbs = p.recentAssets.slice(0, 4);
  return (
    <button onClick={onOpen} data-testid={`card-prompt-${p.id}`} className="rise group flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
      <div className="relative grid h-28 grid-cols-4 gap-px overflow-hidden bg-border">
        {thumbs.length === 0 ? (
          <div className="col-span-4 grid place-items-center bg-muted/40" style={{ backgroundImage: `radial-gradient(circle at 30% 20%, ${MODALITY_HUE[p.targetModality]}22, transparent 60%)` }}><Icon className="h-7 w-7 text-muted-foreground/60" /></div>
        ) : thumbs.map((a, idx) => (
          <div key={a.id} className={cn('relative bg-muted', thumbs.length === 1 && 'col-span-4', thumbs.length === 2 && 'col-span-2', thumbs.length === 3 && idx === 0 && 'col-span-2')}>
            {a.modality === 'image' ? <img src={a.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> :
              a.modality === 'video' ? <video src={a.previewUrl} muted preload="metadata" className="h-full w-full object-cover" /> :
              <div className="grid h-full place-items-center">{a.modality === 'audio' ? <MODALITY_ICON.audio className="h-5 w-5 text-accent" /> : <FileText className="h-5 w-5 text-muted-foreground" />}</div>}
          </div>
        ))}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10.5px] font-medium backdrop-blur"><Icon className="h-3 w-3" style={{ color: MODALITY_HUE[p.targetModality] }} />{t(`modality.${p.targetModality}`)}</span>
        <span className={cn('absolute right-2 top-2 rounded-full px-2 py-0.5 font-mono text-[10px] backdrop-blur', p.isPublished ? 'bg-success/20 text-success' : 'bg-background/80 text-muted-foreground')}>{p.isPublished ? t('catalog.published') : t('catalog.draft')}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {p.categoryName ? <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: p.categoryColor ?? 'hsl(var(--muted-foreground))' }} />{p.categoryName}</span> : <span>{t('catalog.noCategory')}</span>}
          {p.folder && <span className="flex items-center gap-1 truncate"><FolderClosed className="h-3 w-3" />{p.folder}</span>}
          <span className="ml-auto font-mono">{t('catalog.version', { v: p.version })}</span>
        </div>
        <div className="mt-1.5 line-clamp-1 font-display text-lg font-semibold">{p.title}</div>
        {p.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
        {p.variables.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">{p.variables.slice(0, 4).map((v) => <span key={v.name} className="var-chip text-[10.5px]">{v.name}</span>)}{p.variables.length > 4 && <span className="text-[10.5px] text-muted-foreground">+{p.variables.length - 4}</span>}</div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-muted-foreground">
          {p.sourceAgentName && <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{p.sourceAgentName}</span>}
          {p.preferredMcpName && <span className="flex items-center gap-1"><Plug className="h-3 w-3" />{p.preferredMcpName}</span>}
          <span className="ml-auto">{t('catalog.assets', { count: p.assetCount })}</span>
        </div>
      </div>
    </button>
  );
}

function PromptDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const pid = id ?? '';
  const prompt = useGetPrompt(pid, { query: { enabled: !!id, queryKey: getGetPromptQueryKey(pid) } });
  const cats = useListCategories();
  const mcps = useListMcpConnections();
  const update = useUpdatePrompt();
  const del = useDeletePrompt();
  const [form, setForm] = useState<Prompt | null>(null);
  const [tagsText, setTagsText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const init = useRef<string | null>(null);

  useEffect(() => {
    if (prompt.data && init.current !== prompt.data.id) {
      init.current = prompt.data.id;
      setForm(prompt.data);
      setTagsText(prompt.data.tags.join(', '));
    }
  }, [prompt.data]);
  useEffect(() => { if (!id) { init.current = null; setForm(null); } }, [id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListPromptsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPromptFacetsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPromptQueryKey(pid) });
  };
  const err = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });

  const save = () => {
    if (!form) return;
    const names = detectVariables(form.promptTemplate);
    const variables = cleanVariables(names.map((n) => form.variables.find((v) => v.name === n) ?? { name: n, label: n, defaultValue: '' }));
    update.mutate({ id: pid, data: {
      title: form.title, description: form.description || null, promptTemplate: form.promptTemplate, variables,
      tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean), folder: form.folder || null, categoryId: form.categoryId || null,
      targetModality: form.targetModality, preferredMcpId: form.preferredMcpId || null,
    } }, {
      onSuccess: (p) => { setForm(p); invalidate(); toast({ title: t('common.saved'), description: `${p.title} · v${p.version}` }); },
      onError: err,
    });
  };

  const togglePublished = (v: boolean) => {
    setForm((f) => (f ? { ...f, isPublished: v } : f));
    update.mutate({ id: pid, data: { isPublished: v } }, { onSuccess: invalidate, onError: err });
  };

  const remove = () => del.mutate({ id: pid }, {
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); toast({ title: t('common.deleted') }); setConfirm(false); onClose(); },
    onError: err,
  });

  const vars = form ? detectVariables(form.promptTemplate) : [];
  const editVars: PromptVariable[] = form ? vars.map((n) => form.variables.find((v) => v.name === n) ?? { name: n, label: n, defaultValue: '' }) : [];
  const patchVar = (name: string, patch: Partial<PromptVariable>) => setForm((f) => {
    if (!f) return f;
    const exists = f.variables.some((v) => v.name === name);
    return { ...f, variables: exists ? f.variables.map((v) => (v.name === name ? { ...v, ...patch } : v)) : [...f.variables, { name, label: name, defaultValue: '', ...patch }] };
  });
  const replaceVars = (list: PromptVariable[]) => setForm((f) => (f ? { ...f, variables: [...f.variables.filter((v) => !list.some((x) => x.name === v.name)), ...list] } : f));

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="eyebrow">{t('catalog.detail')}</div>
          <SheetTitle className="font-display text-2xl">{form?.title ?? '...'}</SheetTitle>
          <SheetDescription className="sr-only">{t('catalog.detail')}</SheetDescription>
        </SheetHeader>
        {prompt.isLoading || !form ? <div className="mt-6 space-y-3"><Skeleton className="h-10" /><Skeleton className="h-40" /><Skeleton className="h-10" /></div> : (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
              <div><div className="text-sm font-medium">{t('catalog.publishedToggle')}</div><div className="font-mono text-[11px] text-muted-foreground">{t('catalog.version', { v: form.version })} · {t('catalog.assets', { count: form.assetCount })}</div></div>
              <Switch checked={form.isPublished} onCheckedChange={togglePublished} data-testid="switch-published" />
            </div>
            <div><Label>{t('builder.title')}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" data-testid="input-edit-title" /></div>
            <div><Label>{t('builder.description')}</Label><Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5 min-h-[60px]" data-testid="input-edit-description" /></div>
            <div>
              <Label>{t('catalog.template')}</Label>
              <Textarea value={form.promptTemplate} onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })} className="mt-1.5 min-h-[180px] font-mono text-[12.5px]" data-testid="input-edit-template" />
            </div>
            <VariableEditor variables={editVars} template={form.promptTemplate} onPatch={patchVar} onReplace={replaceVars} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('builder.category')}</Label>
                <Select value={form.categoryId ?? ALL} onValueChange={(v) => setForm({ ...form, categoryId: v === ALL ? null : v })}>
                  <SelectTrigger className="mt-1.5" data-testid="select-edit-category"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>{t('catalog.noCategory')}</SelectItem>{cats.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('builder.modality')}</Label>
                <Select value={form.targetModality} onValueChange={(v) => setForm({ ...form, targetModality: v as Modality })}>
                  <SelectTrigger className="mt-1.5" data-testid="select-edit-modality"><SelectValue /></SelectTrigger>
                  <SelectContent>{MODALITIES.map((m) => <SelectItem key={m} value={m}>{t(`modality.${m}`)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t('builder.folder')}</Label><Input value={form.folder ?? ''} onChange={(e) => setForm({ ...form, folder: e.target.value })} className="mt-1.5" data-testid="input-edit-folder" /></div>
              <div>
                <Label>{t('catalog.mcp')}</Label>
                <Select value={form.preferredMcpId ?? ALL} onValueChange={(v) => setForm({ ...form, preferredMcpId: v === ALL ? null : v })}>
                  <SelectTrigger className="mt-1.5" data-testid="select-edit-mcp"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={ALL}>{t('common.auto')}</SelectItem>{mcps.data?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>{t('builder.tags')}</Label><Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="cinematic, portrait" className="mt-1.5" data-testid="input-edit-tags" /></div>
            {form.sourceAgentName && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" />{t('catalog.agent')}: <span className="text-foreground">{form.sourceAgentName}</span></div>}
            {form.recentAssets.length > 0 && (
              <div className="grid grid-cols-4 gap-2">{form.recentAssets.slice(0, 8).map((a) => (
                <div key={a.id} className="aspect-square overflow-hidden rounded-lg border bg-muted">{a.modality === 'image' ? <img src={a.previewUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center">{(() => { const I = MODALITY_ICON[a.modality]; return <I className="h-5 w-5 text-muted-foreground" />; })()}</div>}</div>
              ))}</div>
            )}
            <details className="rounded-xl border p-3"><summary className="cursor-pointer text-xs text-muted-foreground">{t('delivery.preview')}</summary><Markdown content={form.promptTemplate} className="mt-2" /></details>
            <div className="sticky bottom-0 -mx-6 flex flex-wrap gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
              <Button onClick={save} disabled={update.isPending} className="pop" data-testid="button-save-prompt"><Save />{t('common.save')}</Button>
              <Button variant="outline" onClick={() => setLocation(`/executor/${form.targetModality}?prompt=${form.id}`)} disabled={!form.isPublished} data-testid="button-run-executor"><Play />{t('catalog.run')}</Button>
              <Button variant="ghost" onClick={() => setConfirm(true)} className="ml-auto text-destructive" data-testid="button-delete-prompt"><Trash2 />{t('common.delete')}</Button>
            </div>
          </div>
        )}
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle><AlertDialogDescription>{t('common.confirmDeleteBody')}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete-prompt">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
