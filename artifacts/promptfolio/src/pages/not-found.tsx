import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-[80dvh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="grid-lines absolute inset-0 [mask-image:radial-gradient(circle,black,transparent_65%)]" />
      <div className="rise relative font-display text-[9rem] font-extrabold leading-none text-primary/90 md:text-[13rem]" style={{ WebkitTextStroke: '1px hsl(var(--primary))', color: 'transparent' }}>{t('notFound.code')}</div>
      <h1 className="rise relative mt-2 text-2xl font-bold md:text-3xl" style={{ animationDelay: '100ms' }}>{t('notFound.title')}</h1>
      <p className="rise relative mt-2 max-w-md text-muted-foreground" style={{ animationDelay: '160ms' }}>{t('notFound.body')}</p>
      <Link href="/" data-testid="link-home-404" className="rise relative mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" style={{ animationDelay: '220ms' }}>
        <ArrowLeft className="h-4 w-4" /> {t('notFound.home')}
      </Link>
    </div>
  );
}
