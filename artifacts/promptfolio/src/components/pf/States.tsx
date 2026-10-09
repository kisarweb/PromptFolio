import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="rise mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-2 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{eyebrow}</div>}
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, className }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('rise relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-6 py-14 text-center', className)}>
      <div className="grid-lines absolute inset-0 opacity-60 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
      <div className="relative mb-4 grid h-14 w-14 place-items-center rounded-2xl border bg-card shadow-md">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="relative font-display text-lg font-semibold">{title}</div>
      {body && <p className="relative mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div className="font-display font-semibold">{t('common.error')}</div>
      <p className="max-w-sm text-sm text-muted-foreground">{message ?? t('common.errorBody')}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry"><RotateCw /> {t('common.retry')}</Button>}
    </div>
  );
}
