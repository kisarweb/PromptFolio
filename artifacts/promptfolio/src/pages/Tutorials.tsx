import { Link, useParams } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, Settings as SettingsIcon } from 'lucide-react';
import { SiGoogledrive, SiCloudflare } from 'react-icons/si';
import { Database as SiAmazons3 } from 'lucide-react';
import { PageHeader } from '@/components/pf/States';
import { CodeBlock } from '@/components/pf/CodeBlock';
import NotFound from './not-found';

const CORS = JSON.stringify([{ AllowedOrigins: ['*'], AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }], null, 2);
const POLICY = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    { Sid: 'PromptFolioObjects', Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'], Resource: 'arn:aws:s3:::YOUR_BUCKET/*' },
    { Sid: 'PromptFolioList', Effect: 'Allow', Action: ['s3:ListBucket'], Resource: 'arn:aws:s3:::YOUR_BUCKET' },
  ],
}, null, 2);
const TREE = `/PromptFolio
├── Imagens/<Categoria>
├── Videos/<Categoria>
├── Audios/<Categoria>
└── Textos/<Categoria>`;

const GUIDES = {
  'google-drive': { key: 'drive', icon: SiGoogledrive, codes: { 1: { code: TREE, label: 'tree' } } },
  'cloudflare-r2': { key: 'r2', icon: SiCloudflare, codes: { 2: { code: CORS, label: 'cors.json' }, 4: { code: 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com', label: 'endpoint' } } },
  'aws-s3': { key: 's3', icon: SiAmazons3, codes: { 2: { code: CORS, label: 'cors.json' }, 3: { code: POLICY, label: 'iam-policy.json' } } },
} as const;

type Step = { title: string; body: string };

export function TutorialsIndex() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <PageHeader eyebrow={t('sidebar.system')} title={t('tutorials.title')} subtitle={t('tutorials.subtitle')} />
      <div className="space-y-3">
        {Object.entries(GUIDES).map(([slug, g], i) => {
          const steps = t(`tutorials.${g.key}.steps`, { returnObjects: true }) as Step[];
          return (
            <Link key={slug} href={`/tutorials/${slug}`} data-testid={`link-tutorial-${slug}`} className="rise group flex items-center gap-5 rounded-2xl border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md" style={{ animationDelay: `${i * 70}ms` }}>
              <span className="font-display text-4xl font-extrabold text-muted-foreground/30 tabular-nums">0{i + 1}</span>
              <div className="grid h-12 w-12 place-items-center rounded-xl border bg-muted/40"><g.icon className="h-5 w-5" /></div>
              <div className="flex-1">
                <div className="font-display text-lg font-semibold">{t(`tutorials.${g.key}.title`)}</div>
                <div className="text-sm text-muted-foreground">{t(`tutorials.${g.key}.summary`)}</div>
              </div>
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">{t('tutorials.steps', { count: steps.length })}</span>
              <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function TutorialDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const g = GUIDES[slug as keyof typeof GUIDES];
  if (!g) return <NotFound />;
  const steps = t(`tutorials.${g.key}.steps`, { returnObjects: true }) as Step[];
  const codes = g.codes as Record<number, { code: string; label: string }>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <Link href="/tutorials" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-tutorials"><ArrowLeft className="h-4 w-4" />{t('tutorials.title')}</Link>
      <div className="rise mb-10 flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border bg-card shadow-md"><g.icon className="h-6 w-6" /></div>
        <div><h1 className="text-3xl font-bold md:text-4xl">{t(`tutorials.${g.key}.title`)}</h1><p className="text-muted-foreground">{t(`tutorials.${g.key}.summary`)}</p></div>
      </div>
      <ol className="relative space-y-8 border-l pl-8">
        {steps.map((s, i) => (
          <li key={i} className="rise relative" style={{ animationDelay: `${i * 70}ms` }} data-testid={`step-${i}`}>
            <span className="absolute -left-[45px] grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-primary font-mono text-xs font-semibold text-primary-foreground">{i + 1}</span>
            <h2 className="font-display text-lg font-semibold">{s.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            {codes[i] && <CodeBlock code={codes[i].code} label={codes[i].label} />}
          </li>
        ))}
      </ol>
      <Link href="/settings?tab=storage" className="rise mt-10 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground" data-testid="link-open-storage-settings"><SettingsIcon className="h-4 w-4" />{t('tutorials.openSettings')}</Link>
    </div>
  );
}
