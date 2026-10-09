import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, Folder, FolderOpen, ShieldCheck, Lock } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { useDemoLogin, getGetSessionQueryKey, type SessionInfo } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/pf/Logo';
import { ThemeLangControls } from '@/components/pf/Controls';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';

const TREE = ['Imagens', 'Videos', 'Audios', 'Textos'];

export default function Login({ session }: { session?: SessionInfo }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const demo = useDemoLogin({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetSessionQueryKey() }),
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    },
  });
  const googleOk = !!session?.googleOAuthConfigured;

  return (
    <div className="safelight relative grid min-h-[100dvh] lg:grid-cols-[1.1fr_1fr]">
      <div className="absolute right-4 top-4 z-10"><ThemeLangControls /></div>
      <section className="relative hidden overflow-hidden border-r bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="grid-lines absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative flex items-center gap-3"><Logo className="h-9 w-9" /><span className="font-display text-xl font-bold">PromptFolio</span></div>
        <div className="relative">
          <div className="mb-6 flex gap-2">
            {[t('login.feature1'), t('login.feature2'), t('login.feature3')].map((f, i) => (
              <span key={f} className="rise rounded-full border bg-card/70 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" style={{ animationDelay: `${i * 90}ms` }}>{f}</span>
            ))}
          </div>
          <h1 className="rise max-w-xl text-5xl font-extrabold leading-[1.02] xl:text-6xl">{t('login.title')}</h1>
          <p className="rise mt-6 max-w-lg text-muted-foreground" style={{ animationDelay: '120ms' }}>{t('login.subtitle')}</p>
        </div>
        <div className="rise relative rounded-2xl border bg-card/80 p-5 shadow-lg backdrop-blur" style={{ animationDelay: '220ms' }}>
          <div className="mb-1 font-display font-semibold">{t('login.driveTitle')}</div>
          <p className="mb-4 text-sm text-muted-foreground">{t('login.driveBody')}</p>
          <div className="font-mono text-[12.5px]">
            <div className="flex items-center gap-2 text-primary"><FolderOpen className="h-4 w-4" />/PromptFolio</div>
            {TREE.map((f, i) => (
              <div key={f} className="rise ml-4 flex items-center gap-2 border-l py-1 pl-3 text-foreground/80" style={{ animationDelay: `${320 + i * 80}ms` }}>
                <Folder className="h-3.5 w-3.5 text-accent" />{f}<span className="text-muted-foreground">/&lt;Categoria&gt;</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="rise w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo className="h-9 w-9" /><span className="font-display text-xl font-bold">PromptFolio</span></div>
          <div className="eyebrow mb-3">{t('login.eyebrow')}</div>
          <h2 className="mb-2 text-3xl font-bold lg:hidden">{t('login.title')}</h2>
          <p className="mb-8 text-sm text-muted-foreground lg:hidden">{t('login.subtitle')}</p>

          <Button
            size="lg"
            className="pop h-12 w-full justify-between px-5 text-[15px]"
            variant={googleOk ? 'default' : 'outline'}
            disabled={!googleOk}
            onClick={() => { if (session?.googleLoginUrl) window.location.href = session.googleLoginUrl; }}
            data-testid="button-google-login"
          >
            <span className="flex items-center gap-3"><SiGoogle className="h-4 w-4" />{t('login.google')}</span>
            {googleOk ? <ArrowRight /> : <Lock />}
          </Button>
          {!googleOk && (
            <p className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning" data-testid="text-google-disabled">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{t('login.googleDisabled')}
            </p>
          )}

          <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>

          <Button
            size="lg"
            variant={googleOk ? 'outline' : 'default'}
            className="pop h-12 w-full justify-between px-5 text-[15px]"
            disabled={demo.isPending}
            onClick={() => demo.mutate()}
            data-testid="button-demo-login"
          >
            <span className="flex items-center gap-3"><FlaskConical className="h-4 w-4" />{t('login.demo')}</span>
            {demo.isPending ? <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />)}</span> : <ArrowRight />}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">{t('login.demoHint')}</p>

          <div className="mt-8 rounded-xl border bg-card/60 p-4 text-xs text-muted-foreground lg:hidden">
            <div className="mb-1 font-medium text-foreground">{t('login.driveTitle')}</div>
            {t('login.driveBody')} <span className="font-mono text-foreground">/PromptFolio/{'{'}Imagens,Videos,Audios,Textos{'}'}/&lt;Categoria&gt;</span>
          </div>
          <p className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-accent" />{t('login.privacy')}</p>
        </div>
      </section>
    </div>
  );
}
