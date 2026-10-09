import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Paperclip, Images, X, Link2, AtSign, Settings2, Check } from 'lucide-react';
import { useListReferences, getListReferencesQueryKey, type ReferenceImage, type PromptVariable } from '@workspace/api-client-react';
import { VariableInfo } from '@/components/pf/VariableInfo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useReferenceUpload } from '@/hooks/use-reference-upload';
import { BRAND_VAR, MAX_BRAND_REFS, brandRefKey, hostOf, isHttpUrl, type BrandRef } from '@/lib/references';
import { cn } from '@/lib/utils';

function Thumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <div className={cn('grid place-items-center bg-muted text-muted-foreground', className)}><Link2 className="h-4 w-4" /></div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} className={cn('object-cover', className)} />;
}

export function BrandReferenceField({ value, onChange, variable }: { value: BrandRef[]; onChange: (v: BrandRef[]) => void; variable?: PromptVariable }) {
  const { t } = useTranslation();
  // Prompts that don't declare the variable still accept references (optional); fill gaps with generic help.
  const info: PromptVariable = {
    ...variable,
    name: BRAND_VAR,
    label: variable?.label && variable.label !== BRAND_VAR ? variable.label : t('references.fieldLabel'),
    helpText: variable?.helpText || t('references.infoHelp'),
    examples: variable?.examples?.length ? variable.examples : (t('references.infoExamples', { returnObjects: true }) as string[]),
    required: variable ? variable.required : false,
  };
  const { toast } = useToast();
  const { upload, pending } = useReferenceUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [active, setActive] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const mention = text.trimStart().startsWith('@') ? text.trim().slice(1) : null;
  const sugParams = { search: mention ?? '', limit: 8 };
  const suggestions = useListReferences(sugParams, { query: { enabled: mention !== null, staleTime: 15_000, queryKey: getListReferencesQueryKey(sugParams) } });
  const options = (suggestions.data ?? []).filter((r) => !value.some((v) => v.kind === 'library' && v.ref.id === r.id));
  const full = value.length >= MAX_BRAND_REFS;

  useEffect(() => setActive(0), [mention]);

  const add = (items: BrandRef[]) => {
    const next = [...value];
    for (const it of items) {
      if (next.some((n) => brandRefKey(n) === brandRefKey(it))) continue;
      if (next.length >= MAX_BRAND_REFS) {
        toast({ variant: 'destructive', title: t('references.max', { n: MAX_BRAND_REFS }) });
        break;
      }
      next.push(it);
    }
    onChange(next);
  };

  const uploadFiles = async (files: File[], source: 'upload' | 'paste') => {
    if (!files.length) return;
    const room = MAX_BRAND_REFS - value.length;
    if (room <= 0) {
      toast({ variant: 'destructive', title: t('references.max', { n: MAX_BRAND_REFS }) });
      return;
    }
    const refs = await upload(files.slice(0, room), source);
    add(refs.map((ref) => ({ kind: 'library' as const, ref })));
  };

  const addUrl = (raw: string) => {
    const url = raw.trim();
    if (!isHttpUrl(url)) return false;
    add([{ kind: 'url', url }]);
    setText('');
    return true;
  };

  const pick = (ref: ReferenceImage) => {
    add([{ kind: 'library', ref }]);
    setText('');
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(e.clipboardData.items).filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (files.length) {
      e.preventDefault();
      void uploadFiles(files, 'paste');
      return;
    }
    const pasted = e.clipboardData.getData('text');
    if (!text.trim() && isHttpUrl(pasted)) {
      e.preventDefault();
      addUrl(pasted);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (mention !== null && options.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[Math.min(active, options.length - 1)]); return; }
    }
    if (e.key === 'Escape') setText('');
    if (e.key === 'Enter') {
      e.preventDefault();
      if (text.trim() && !addUrl(text)) toast({ variant: 'destructive', title: t('references.invalidInput') });
    }
    if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) return void uploadFiles(files, 'upload');
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url) addUrl(url.split('\n')[0]);
  };

  return (
    <div data-testid="field-brand-reference">
      <Label className="flex items-center gap-1.5 text-xs"><span className="min-w-0 truncate">{info.label}</span><VariableInfo variable={info} /><span className="var-chip ml-auto min-w-0 max-w-[48%] truncate">{`{{${BRAND_VAR}}}`}</span></Label>

      {(value.length > 0 || pending > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((r) => (
            <div key={brandRefKey(r)} className="group relative flex items-center gap-2 rounded-lg border bg-muted/40 py-1 pl-1 pr-7" data-testid={`chip-brand-${r.kind === 'library' ? r.ref.code : 'url'}`}>
              {r.kind === 'library'
                ? <a href={r.ref.fileUrl} target="_blank" rel="noreferrer"><Thumb src={r.ref.thumbUrl} alt={r.ref.code} className="h-9 w-9 rounded-md" /></a>
                : <a href={r.url} target="_blank" rel="noreferrer"><Thumb src={r.url} alt={hostOf(r.url)} className="h-9 w-9 rounded-md" /></a>}
              <div className="min-w-0 leading-tight">
                <div className="max-w-[9rem] truncate font-mono text-[11.5px]">{r.kind === 'library' ? `@${r.ref.code}` : hostOf(r.url)}</div>
                <div className="text-[10px] text-muted-foreground">{r.kind === 'library' ? `${r.ref.width}×${r.ref.height}` : t('references.urlNotSaved')}</div>
              </div>
              <button type="button" onClick={() => onChange(value.filter((v) => brandRefKey(v) !== brandRefKey(r)))} aria-label={t('references.removeFromField')} title={t('references.removeFromField')}
                className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive" data-testid="button-remove-brand-ref">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {Array.from({ length: pending }).map((_, i) => <Skeleton key={`p${i}`} className="h-11 w-28 rounded-lg" />)}
        </div>
      )}

      <div
        className={cn('relative mt-2 rounded-lg transition-shadow', dragOver && 'ring-2 ring-primary/50')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <Input
          value={text}
          disabled={full}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          placeholder={full ? t('references.max', { n: MAX_BRAND_REFS }) : t('references.placeholder')}
          className="pr-[4.5rem] text-sm"
          data-testid="input-brand-reference"
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          <button type="button" disabled={full} onClick={() => fileRef.current?.click()} title={t('references.attach')} aria-label={t('references.attach')}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40" data-testid="button-attach-brand">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" disabled={full} onClick={() => setLibraryOpen(true)} title={t('references.library')} aria-label={t('references.library')}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40" data-testid="button-library-brand">
            <Images className="h-4 w-4" />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void uploadFiles(Array.from(e.target.files ?? []), 'upload'); e.target.value = ''; }} data-testid="input-file-brand" />

        {mention !== null && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg" data-testid="list-brand-suggestions">
            {suggestions.isLoading ? <div className="p-3"><Skeleton className="h-8" /></div> : !options.length ? (
              <div className="p-3 text-xs text-muted-foreground">{t('references.noMatch', { q: mention })}</div>
            ) : options.map((r, i) => (
              <button key={r.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setActive(i)}
                className={cn('flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left', i === active ? 'bg-muted' : 'hover:bg-muted/60')} data-testid={`option-brand-${r.code}`}>
                <img src={r.thumbUrl} alt="" className="h-8 w-8 rounded object-cover" />
                <span className="flex-1 truncate font-mono text-xs">@{r.code}</span>
                <span className="text-[10px] text-muted-foreground">{t('references.uses', { count: r.useCount })}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-snug text-muted-foreground"><AtSign className="mt-px h-3 w-3 shrink-0" />{t('references.hint')}</p>

      <LibraryPicker open={libraryOpen} onOpenChange={setLibraryOpen} selected={value} room={MAX_BRAND_REFS - value.length} onPick={(refs) => add(refs.map((ref) => ({ kind: 'library' as const, ref })))} />
    </div>
  );
}

function LibraryPicker({ open, onOpenChange, selected, room, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; selected: BrandRef[]; room: number; onPick: (refs: ReferenceImage[]) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<ReferenceImage[]>([]);
  const listParams = { search: search || undefined, limit: 120 };
  const list = useListReferences(listParams, { query: { enabled: open, queryKey: getListReferencesQueryKey(listParams) } });
  useEffect(() => { if (open) { setChosen([]); setSearch(''); } }, [open]);
  const already = new Set(selected.flatMap((s) => (s.kind === 'library' ? [s.ref.id] : [])));

  const toggle = (r: ReferenceImage) => {
    setChosen((c) => (c.some((x) => x.id === r.id) ? c.filter((x) => x.id !== r.id) : c.length >= room ? c : [...c, r]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('references.pickerTitle')}</DialogTitle>
          <DialogDescription>{t('references.pickerBody', { n: room })}</DialogDescription>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('references.searchPlaceholder')} data-testid="input-library-search" />
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
          {list.isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />) : !list.data?.length ? (
            <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('references.emptyLibrary')}</div>
          ) : list.data.map((r) => {
            const isIn = already.has(r.id);
            const isChosen = chosen.some((c) => c.id === r.id);
            return (
              <button key={r.id} type="button" disabled={isIn} onClick={() => toggle(r)} data-testid={`button-pick-${r.code}`}
                className={cn('group relative overflow-hidden rounded-lg border text-left transition-all disabled:opacity-40', isChosen ? 'border-primary ring-2 ring-primary/40' : 'hover:border-foreground/30')}>
                <img src={r.thumbUrl} alt={r.code} className="aspect-square w-full bg-muted object-cover" loading="lazy" />
                <div className="truncate px-1.5 py-1 font-mono text-[10.5px]">@{r.code}</div>
                {isChosen && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Link href="/settings?tab=references" className="flex items-center gap-1 text-xs font-medium text-primary" onClick={() => onOpenChange(false)} data-testid="link-manage-references"><Settings2 className="h-3.5 w-3.5" />{t('references.manage')}</Link>
          <Button disabled={!chosen.length} onClick={() => { onPick(chosen); onOpenChange(false); }} data-testid="button-confirm-pick">{t('references.useSelected', { count: chosen.length })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
