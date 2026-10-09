import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, FolderOpen, Folder, ExternalLink, BookOpen, Zap, KeyRound } from 'lucide-react';
import { SiGoogledrive, SiCloudflare } from 'react-icons/si';
import { Database as SiAmazons3 } from 'lucide-react';
import {
  useGetSession, useGetStorageOverview, useSetActiveStorage, useSaveStorageConfig, useTestStorageConnection, getGetStorageOverviewQueryKey,
  getGetSessionQueryKey, getGetDashboardSummaryQueryKey, type StorageProvider, type TestResult, type S3CompatibleStorage, type StorageConfigInput,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/pf/States';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';
import { cn } from '@/lib/utils';

function Field({ label, value, onChange, placeholder, secret, hint, testid }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean; hint?: string; testid: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={secret ? 'password' : 'text'} autoComplete={secret ? 'new-password' : 'off'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 font-mono text-[13px]" data-testid={testid} />
      {hint && <p className="mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground"><KeyRound className="h-3 w-3" />{hint}</p>}
    </div>
  );
}

function Result({ r }: { r?: TestResult }) {
  if (!r) return null;
  return (
    <div className={cn('rise mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs', r.ok ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive')} data-testid="text-test-result">
      {r.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div className="flex-1"><div className="font-medium">{r.message}</div>{r.detail && <div className="opacity-80">{r.detail}</div>}{r.remoteViewUrl && <a href={r.remoteViewUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline">{r.remoteViewUrl}<ExternalLink className="h-3 w-3" /></a>}</div>
    </div>
  );
}

export function StorageTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const ov = useGetStorageOverview();
  const session = useGetSession();
  const setActive = useSetActiveStorage();
  const saveCfg = useSaveStorageConfig();
  const test = useTestStorageConnection();
  const [results, setResults] = useState<Partial<Record<StorageProvider, TestResult>>>({});
  const [driveMcp, setDriveMcp] = useState('');
  const [r2, setR2] = useState({ endpointUrl: '', accessKeyId: '', secretAccessKey: '', bucketName: '', publicUrlPrefix: '' });
  const [s3, setS3] = useState({ region: '', accessKeyId: '', secretAccessKey: '', bucketName: '', endpointUrl: '' });
  const [initd, setInitd] = useState(false);

  useEffect(() => {
    if (ov.data && !initd) {
      setInitd(true);
      setDriveMcp(ov.data.googleDrive.customMcpEndpoint ?? '');
      const c = ov.data.cloudflareR2, a = ov.data.awsS3;
      setR2({ endpointUrl: c.endpointUrl ?? '', accessKeyId: '', secretAccessKey: '', bucketName: c.bucketName ?? '', publicUrlPrefix: c.publicUrlPrefix ?? '' });
      setS3({ region: a.region ?? '', accessKeyId: '', secretAccessKey: '', bucketName: a.bucketName ?? '', endpointUrl: a.endpointUrl ?? '' });
    }
  }, [ov.data, initd]);

  const inv = () => { qc.invalidateQueries({ queryKey: getGetStorageOverviewQueryKey() }); qc.invalidateQueries({ queryKey: getGetSessionQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); };
  const err = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });

  const testAndSave = (provider: StorageProvider, data: StorageConfigInput) => {
    const clean: StorageConfigInput = {};
    Object.entries(data).forEach(([k, v]) => { if (typeof v === 'string' && v.trim()) (clean as Record<string, string>)[k] = v.trim(); else if (!['accessKeyId', 'secretAccessKey'].includes(k)) (clean as Record<string, null>)[k] = null; });
    saveCfg.mutate({ provider, data: clean }, {
      onSuccess: () => {
        test.mutate({ provider }, {
          onSuccess: (r) => { setResults((s) => ({ ...s, [provider]: r })); inv(); toast({ variant: r.ok ? 'default' : 'destructive', title: r.ok ? t('settings.testOk') : t('settings.testFail'), description: r.message }); },
          onError: err,
        });
      },
      onError: err,
    });
  };

  const activate = (provider: StorageProvider) => setActive.mutate({ data: { provider } }, { onSuccess: () => { inv(); toast({ title: t('settings.activated'), description: t(`provider.${provider}`) }); }, onError: err });

  if (ov.isLoading) return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>;
  if (ov.isError || !ov.data) return <ErrorState onRetry={() => ov.refetch()} />;
  const d = ov.data;
  const busy = saveCfg.isPending || test.isPending;
  const busyFor = (p: StorageProvider) => busy && (saveCfg.variables?.provider === p || test.variables?.provider === p);

  const Option = ({ provider, title, body, icon, configured, tutorial, children, idx }: { provider: StorageProvider; title: string; body: string; icon: ReactNode; configured: boolean; tutorial: string; children: ReactNode; idx: number }) => {
    const active = d.activeProvider === provider;
    return (
      <div className={cn('rise relative overflow-hidden rounded-2xl border bg-card transition-all', active && 'border-primary/60 shadow-lg')} style={{ animationDelay: `${idx * 70}ms` }} data-testid={`card-storage-${provider}`}>
        {active && <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />}
        <div className="flex flex-wrap items-start gap-4 border-b p-5">
          <button onClick={() => !active && configured && activate(provider)} disabled={active || !configured || setActive.isPending} className={cn('mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors', active ? 'border-primary' : configured ? 'border-muted-foreground/50 hover:border-primary' : 'cursor-not-allowed border-muted')} data-testid={`radio-storage-${provider}`}>
            {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
          </button>
          <div className="grid h-10 w-10 place-items-center rounded-xl border bg-muted/40">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{body}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {active ? <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">{t('settings.activeNow')}</span> : (
              <Button size="sm" variant="outline" disabled={!configured || setActive.isPending} onClick={() => activate(provider)} title={!configured ? t('settings.needsConfig') : undefined} data-testid={`button-activate-${provider}`}>{t('settings.makeActive')}</Button>
            )}
            <span className={cn('font-mono text-[10px]', configured ? 'text-success' : 'text-muted-foreground')}>{configured ? t('settings.configured') : t('settings.notConfigured')}</span>
          </div>
        </div>
        <div className="p-5">
          {children}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => {
              if (provider === 'google_drive_mcp') testAndSave(provider, { customMcpEndpoint: driveMcp });
              else if (provider === 'cloudflare_r2') testAndSave(provider, r2);
              else testAndSave(provider, s3);
            }} disabled={busy} className="pop" data-testid={`button-test-save-${provider}`}>
              {busyFor(provider) ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Zap />}{t('settings.testSave')}
            </Button>
            <Link href={tutorial} className="inline-flex items-center gap-1 text-xs font-medium text-primary" data-testid={`link-tutorial-${provider}`}><BookOpen className="h-3.5 w-3.5" />{t('common.learnMore')}</Link>
          </div>
          <Result r={results[provider]} />
        </div>
      </div>
    );
  };

  const s3Hint = (s: S3CompatibleStorage) => (s.maskedAccessKey ? t('settings.stored', { v: s.maskedAccessKey }) : undefined);
  const g = d.googleDrive;

  return (
    <div>
      <div className="mb-6"><h2 className="text-xl font-bold">{t('settings.storageTitle')}</h2><p className="text-sm text-muted-foreground">{t('settings.storageBody')}</p></div>
      <div className="space-y-5">
        <Option idx={0} provider="google_drive_mcp" title={t('settings.driveOption')} body={t('settings.driveBody')} icon={<SiGoogledrive className="h-5 w-5" />} configured={g.isConfigured} tutorial="/tutorials/google-drive">
          <div className={cn('mb-4 flex items-center gap-2 rounded-lg border p-2.5 text-sm', g.isDemoSimulated ? 'border-warning/30 bg-warning/10 text-warning' : g.linkedViaLogin ? 'border-success/30 bg-success/10 text-success' : 'text-muted-foreground')} data-testid="text-drive-status">
            {g.linkedViaLogin && !g.isDemoSimulated ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span className="flex-1">{g.isDemoSimulated ? t('settings.driveDemo') : g.linkedViaLogin ? t('settings.driveLinked', { email: g.accountEmail ?? '' }) : t('settings.driveNot')}</span>
            {!g.linkedViaLogin && !g.isDemoSimulated && session.data?.googleOAuthConfigured && (
              <Button size="sm" onClick={() => { window.location.href = session.data!.googleLoginUrl; }} data-testid="button-connect-drive">
                <SiGoogledrive className="mr-1.5 h-3.5 w-3.5" />{t('settings.driveConnect')}
              </Button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-muted/30 p-3 font-mono text-[12px]">
              <div className="eyebrow mb-2 flex items-center justify-between font-sans">{t('settings.rootFolder')}{g.rootFolderUrl && <a href={g.rootFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 normal-case tracking-normal text-primary" data-testid="link-drive-root">{t('settings.openFolder')}<ExternalLink className="h-3 w-3" /></a>}</div>
              <div className="flex items-center gap-2 text-primary"><FolderOpen className="h-4 w-4" />{g.rootFolderPath}</div>
              {g.folderStructure.map((f) => <div key={f} className="ml-3 flex items-center gap-2 border-l py-0.5 pl-3 text-foreground/80"><Folder className="h-3 w-3 text-accent" />{f}</div>)}
            </div>
            <Field label={`${t('settings.customMcp')} (${t('common.optional')})`} value={driveMcp} onChange={setDriveMcp} placeholder="https://drive-mcp.example.com/sse" testid="input-drive-mcp" />
          </div>
        </Option>

        <Option idx={1} provider="cloudflare_r2" title={t('settings.r2Option')} body={t('settings.r2Body')} icon={<SiCloudflare className="h-5 w-5 text-[#F38020]" />} configured={d.cloudflareR2.isConfigured} tutorial="/tutorials/cloudflare-r2">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('settings.accountEndpoint')} value={r2.endpointUrl} onChange={(v) => setR2({ ...r2, endpointUrl: v })} placeholder="https://<ACCOUNT_ID>.r2.cloudflarestorage.com" testid="input-r2-endpoint" />
            <Field label={t('settings.bucket')} value={r2.bucketName} onChange={(v) => setR2({ ...r2, bucketName: v })} placeholder="promptfolio-media" testid="input-r2-bucket" />
            <Field label={t('settings.accessKey')} value={r2.accessKeyId} onChange={(v) => setR2({ ...r2, accessKeyId: v })} hint={s3Hint(d.cloudflareR2)} testid="input-r2-access" />
            <Field label={t('settings.secretKey')} value={r2.secretAccessKey} onChange={(v) => setR2({ ...r2, secretAccessKey: v })} secret hint={d.cloudflareR2.hasSecretKey ? t('settings.secretStored') : undefined} testid="input-r2-secret" />
            <div className="md:col-span-2"><Field label={t('settings.publicUrl')} value={r2.publicUrlPrefix} onChange={(v) => setR2({ ...r2, publicUrlPrefix: v })} placeholder="https://pub-xxxx.r2.dev" testid="input-r2-public" /></div>
          </div>
        </Option>

        <Option idx={2} provider="aws_s3" title={t('settings.s3Option')} body={t('settings.s3Body')} icon={<SiAmazons3 className="h-5 w-5" />} configured={d.awsS3.isConfigured} tutorial="/tutorials/aws-s3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('settings.region')} value={s3.region} onChange={(v) => setS3({ ...s3, region: v })} placeholder="us-east-1" testid="input-s3-region" />
            <Field label={t('settings.bucket')} value={s3.bucketName} onChange={(v) => setS3({ ...s3, bucketName: v })} placeholder="promptfolio-media" testid="input-s3-bucket" />
            <Field label={t('settings.accessKey')} value={s3.accessKeyId} onChange={(v) => setS3({ ...s3, accessKeyId: v })} hint={s3Hint(d.awsS3)} testid="input-s3-access" />
            <Field label={t('settings.secretKey')} value={s3.secretAccessKey} onChange={(v) => setS3({ ...s3, secretAccessKey: v })} secret hint={d.awsS3.hasSecretKey ? t('settings.secretStored') : undefined} testid="input-s3-secret" />
            <div className="md:col-span-2"><Field label={`${t('settings.customEndpoint')} (${t('common.optional')})`} value={s3.endpointUrl} onChange={(v) => setS3({ ...s3, endpointUrl: v })} placeholder="https://s3.us-east-1.amazonaws.com" testid="input-s3-endpoint" /></div>
          </div>
        </Option>
      </div>
    </div>
  );
}
