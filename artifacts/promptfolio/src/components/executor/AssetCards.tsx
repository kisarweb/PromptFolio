import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, Play, Pause, Copy, Check, FileDown, Maximize2 } from 'lucide-react';
import { useDeleteAsset, getListAssetsQueryKey, getGetDashboardSummaryQueryKey, type GeneratedAsset } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StorageBadge } from '@/components/pf/StorageBadge';
import { Markdown } from '@/components/pf/Markdown';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage, downloadText, formatBytes, slugify } from '@/lib/pf';
import { cn } from '@/lib/utils';

function useDelete() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const del = useDeleteAsset();
  return (id: string) => del.mutate({ id }, {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListAssetsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      toast({ title: t('common.deleted') });
    },
    onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
  });
}

function Footer({ asset, onDelete }: { asset: GeneratedAsset; onDelete: () => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{asset.promptTitle ?? asset.filename}</div>
          <div className="font-mono text-[10.5px] text-muted-foreground">{asset.engineLabel} · {formatBytes(asset.fileSizeBytes)}{asset.aspectRatio && ` · ${asset.aspectRatio}`}{asset.durationSeconds && ` · ${asset.durationSeconds}s`}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          <a href={asset.downloadUrl} download className="grid h-7 w-7 place-items-center rounded-md border text-muted-foreground transition-colors hover:text-foreground" title={t('delivery.local')} data-testid={`link-download-${asset.id}`}><Download className="h-3.5 w-3.5" /></a>
          {confirm ? (
            <button onClick={onDelete} onMouseLeave={() => setConfirm(false)} className="h-7 rounded-md bg-destructive px-2 text-[11px] text-destructive-foreground" data-testid={`button-confirm-delete-asset-${asset.id}`}>{t('common.delete')}?</button>
          ) : (
            <button onClick={() => setConfirm(true)} className="grid h-7 w-7 place-items-center rounded-md border text-muted-foreground transition-colors hover:text-destructive" data-testid={`button-delete-asset-${asset.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      <StorageBadge asset={asset} />
    </div>
  );
}

const ratioClass = (r?: string | null) => (r === '16:9' ? 'aspect-video' : r === '9:16' ? 'aspect-[9/16]' : 'aspect-square');

export function ImageCard({ asset, fresh }: { asset: GeneratedAsset; fresh?: boolean }) {
  const remove = useDelete();
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('rise group overflow-hidden rounded-2xl border bg-card', fresh && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} data-testid={`card-asset-${asset.id}`}>
      <button onClick={() => setOpen(true)} className={cn('relative block w-full overflow-hidden bg-muted', ratioClass(asset.aspectRatio))}>
        <img src={asset.previewUrl} alt={asset.finalPrompt} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md bg-background/70 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><Maximize2 className="h-3.5 w-3.5" /></span>
      </button>
      <Footer asset={asset} onDelete={() => remove(asset.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">{asset.promptTitle}</DialogTitle>
          <DialogDescription className="sr-only">{asset.finalPrompt}</DialogDescription>
          <img src={asset.previewUrl} alt={asset.finalPrompt} className="max-h-[80dvh] w-full rounded-lg object-contain" />
          <p className="px-2 pb-2 font-mono text-xs text-muted-foreground">{asset.finalPrompt}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VideoCard({ asset, fresh }: { asset: GeneratedAsset; fresh?: boolean }) {
  const remove = useDelete();
  return (
    <div className={cn('rise overflow-hidden rounded-2xl border bg-card', fresh && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} data-testid={`card-asset-${asset.id}`}>
      <div className={cn('bg-black', asset.aspectRatio === '9:16' ? 'mx-auto aspect-[9/16] max-h-[520px]' : 'aspect-video')}>
        <video src={asset.previewUrl} controls playsInline preload="metadata" className="h-full w-full" />
      </div>
      <Footer asset={asset} onDelete={() => remove(asset.id)} />
    </div>
  );
}

export function AudioCard({ asset, fresh }: { asset: GeneratedAsset; fresh?: boolean }) {
  const remove = useDelete();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(asset.durationSeconds ?? 0);
  const bars = useMemo(() => {
    let seed = [...asset.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 56 }, () => { seed = (seed * 9301 + 49297) % 233280; return 0.2 + (seed / 233280) * 0.8; });
  }, [asset.id]);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const tu = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const lm = () => setDuration(a.duration);
    const end = () => setPlaying(false);
    a.addEventListener('timeupdate', tu); a.addEventListener('loadedmetadata', lm); a.addEventListener('ended', end);
    return () => { a.removeEventListener('timeupdate', tu); a.removeEventListener('loadedmetadata', lm); a.removeEventListener('ended', end); };
  }, []);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { void a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div className={cn('rise overflow-hidden rounded-2xl border bg-card', fresh && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} data-testid={`card-asset-${asset.id}`}>
      <div className="flex items-center gap-4 border-b bg-gradient-to-br from-accent/10 to-transparent p-4">
        <button onClick={toggle} className="pop grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-md" data-testid={`button-play-${asset.id}`}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div onClick={seek} className="flex h-12 cursor-pointer items-center gap-[2px]">
            {bars.map((h, i) => (
              <span key={i} className={cn('flex-1 rounded-full transition-colors', i / bars.length <= progress ? 'bg-accent' : 'bg-muted-foreground/25', playing && 'eq')} style={{ height: `${h * 100}%`, animationDelay: `${(i % 7) * 0.09}s`, animationDuration: `${0.8 + (i % 5) * 0.15}s` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>{fmt(progress * duration)}</span><span>{fmt(duration)}</span></div>
        </div>
        <audio ref={ref} src={asset.previewUrl} preload="metadata" />
      </div>
      <Footer asset={asset} onDelete={() => remove(asset.id)} />
    </div>
  );
}

export function TextCard({ asset, fresh }: { asset: GeneratedAsset; fresh?: boolean }) {
  const { t } = useTranslation();
  const remove = useDelete();
  const [copied, setCopied] = useState(false);
  const body = asset.textContent ?? '';
  const name = slugify(asset.promptTitle ?? asset.filename.replace(/\.\w+$/, ''));
  const copy = async () => { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className={cn('rise overflow-hidden rounded-2xl border bg-card', fresh && 'ring-2 ring-primary ring-offset-2 ring-offset-background')} data-testid={`card-asset-${asset.id}`}>
      <div className="flex items-center justify-end gap-1 border-b px-3 py-2">
        <Button size="sm" variant="ghost" onClick={copy} data-testid={`button-copy-text-${asset.id}`}>{copied ? <Check className="text-success" /> : <Copy />}{copied ? t('common.copied') : t('delivery.copyText')}</Button>
        <Button size="sm" variant="ghost" onClick={() => downloadText(body, `${name}.md`, 'text/markdown')} data-testid={`button-export-md-${asset.id}`}><FileDown />{t('delivery.exportMd')}</Button>
        <Button size="sm" variant="ghost" onClick={() => downloadText(body, `${name}.txt`)} data-testid={`button-export-txt-${asset.id}`}><FileDown />{t('delivery.exportTxt')}</Button>
      </div>
      <div className="max-h-[420px] overflow-y-auto px-5 py-4"><Markdown content={body} className="text-[14px]" /></div>
      <div className="border-t"><Footer asset={asset} onDelete={() => remove(asset.id)} /></div>
    </div>
  );
}
