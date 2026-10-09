import { CloudCheck, CloudOff, FlaskConical, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import type { GeneratedAsset } from '@workspace/api-client-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function StorageBadge({ asset }: { asset: GeneratedAsset }) {
  const { t } = useTranslation();
  const provider = t(`provider.${asset.storageProviderUsed}`);
  if (asset.storageStatus === 'saved') {
    const inner = (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <CloudCheck className="h-3 w-3" /> {t('delivery.savedTo', { provider })}
        {asset.remoteViewUrl && <ExternalLink className="h-3 w-3" />}
      </span>
    );
    return asset.remoteViewUrl ? (
      <a href={asset.remoteViewUrl} target="_blank" rel="noreferrer" data-testid={`link-remote-${asset.id}`}>{inner}</a>
    ) : inner;
  }
  if (asset.storageStatus === 'simulated') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            <FlaskConical className="h-3 w-3" /> {t('delivery.simulated')}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{asset.storageMessage ?? provider}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
      <span className="inline-flex items-center gap-1.5 font-medium"><CloudOff className="h-3 w-3" /> {t('delivery.failed')}</span>
      {asset.storageMessage && <span className="opacity-80">{asset.storageMessage}</span>}
      <Link href="/settings?tab=storage" className="underline underline-offset-2">{t('delivery.failedHint')}</Link>
    </div>
  );
}
