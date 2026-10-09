import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, CornerDownLeft } from 'lucide-react';
import type { PromptVariable } from '@workspace/api-client-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isRequired } from '@/lib/variables';
import { cn } from '@/lib/utils';

/** Required fields: white icon. Optional fields: yellow icon. */
export function requiredTone(required: boolean) {
  return required ? 'text-foreground dark:text-white' : 'text-yellow-500 dark:text-yellow-300';
}

/**
 * Small info icon next to a field label. Opens a floating card on hover (desktop) and toggles/pins on click or tap (mobile).
 * Shows what the field is for, whether it is required, allowed values and examples (clicking an example fills the field).
 */
export function VariableInfo({ variable, onUseExample }: { variable: PromptVariable; onUseExample?: (value: string) => void }) {
  const { t } = useTranslation();
  const required = isRequired(variable);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Hover-opened (not pinned): close as soon as the pointer is outside both the icon and the card.
  useEffect(() => {
    if (!open || pinned) return;
    let closing = false;
    const onMove = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const inside = !!target && (triggerRef.current?.contains(target) || contentRef.current?.contains(target));
      if (inside) { if (closing) { window.clearTimeout(timer.current); closing = false; } return; }
      if (!closing) { closing = true; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 180); }
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [open, pinned]);

  // Pinned (clicked/tapped): any press outside the icon and the card closes it (reliable on touch screens).
  useEffect(() => {
    if (!open || !pinned) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || contentRef.current?.contains(target))) return;
      setOpen(false); setPinned(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, pinned]);

  const hoverOpen = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 120);
  };
  const hoverCancel = (e: ReactPointerEvent) => {
    // Leaving before the open delay elapsed cancels it; closing an open card is handled by the pointer tracker.
    if (e.pointerType === 'mouse' && !open) window.clearTimeout(timer.current);
  };
  const label = variable.label || variable.name;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPinned(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          ref={triggerRef}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') hoverOpen(); }}
          onPointerLeave={hoverCancel}
          onClick={(e) => { e.preventDefault(); window.clearTimeout(timer.current); const next = !(open && pinned); setPinned(next); setOpen(next); }}
          aria-label={t('fieldInfo.aria', { label })}
          className={cn('inline-grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', requiredTone(required))}
          data-testid={`button-info-${variable.name}`}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={12}
        ref={contentRef}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0 text-sm"
        data-testid={`popover-info-${variable.name}`}
      >
        <div className="flex items-start gap-2 border-b px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="font-medium leading-snug">{label}</div>
            <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{`{{${variable.name}}}`}</div>
          </div>
          <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', required ? 'border-foreground/25 text-foreground dark:border-white/40 dark:text-white' : 'border-yellow-500/50 text-yellow-600 dark:border-yellow-300/50 dark:text-yellow-300')}>
            {required ? t('fieldInfo.required') : t('fieldInfo.optional')}
          </span>
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-3.5 py-3">
          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
            {variable.helpText || variable.description || t('fieldInfo.noHelp')}
          </p>
          {!!variable.options?.length && (
            <div>
              <div className="eyebrow mb-1.5">{t('fieldInfo.options')}</div>
              <div className="flex flex-wrap gap-1">{variable.options.map((o) => <span key={o} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">{o}</span>)}</div>
            </div>
          )}
          {!!variable.defaultValue?.trim() && (
            <div className="text-[11.5px]"><span className="text-muted-foreground">{t('fieldInfo.default')}: </span>{variable.defaultValue}</div>
          )}
          {!!variable.examples?.length && (
            <div>
              <div className="eyebrow mb-1.5">{t('fieldInfo.examples')}</div>
              <ul className="space-y-1">
                {variable.examples.map((ex) => (
                  <li key={ex}>
                    {onUseExample ? (
                      <button type="button" onClick={() => { onUseExample(ex); setOpen(false); setPinned(false); }} title={t('fieldInfo.useExample')}
                        className="group flex w-full items-start gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-left text-[12px] leading-snug transition-colors hover:bg-muted" data-testid={`button-example-${variable.name}`}>
                        <span className="flex-1">{ex}</span>
                        <CornerDownLeft className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ) : <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[12px] leading-snug">{ex}</div>}
                  </li>
                ))}
              </ul>
              {onUseExample && <p className="mt-1.5 text-[10.5px] text-muted-foreground">{t('fieldInfo.useExampleHint')}</p>}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
