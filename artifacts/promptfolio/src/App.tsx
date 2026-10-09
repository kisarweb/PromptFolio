import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGetSession, useHealthCheck } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/pf/AppShell';
import { Logo } from '@/components/pf/Logo';
import { useSettingsStore, applyTheme } from '@/store/useSettingsStore';
import NotFound from '@/pages/not-found';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import Builder from '@/pages/Builder';
import Executor from '@/pages/Executor';
import Catalog from '@/pages/Catalog';
import Settings from '@/pages/Settings';
import { TutorialsIndex, TutorialDetail } from '@/pages/Tutorials';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

applyTheme(useSettingsStore.getState().theme);

function AgentsBuilder() { return <Builder kind="agents" />; }
function PromptsBuilder() { return <Builder kind="prompts" />; }

function Routes() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/builder/agents" component={AgentsBuilder} />
        <Route path="/builder/agents/:id" component={AgentsBuilder} />
        <Route path="/builder/prompts" component={PromptsBuilder} />
        <Route path="/builder/prompts/:id" component={PromptsBuilder} />
        <Route path="/executor" component={Executor} />
        <Route path="/executor/:modality" component={Executor} />
        <Route path="/catalog" component={Catalog} />
        <Route path="/settings" component={Settings} />
        <Route path="/tutorials" component={TutorialsIndex} />
        <Route path="/tutorials/:slug" component={TutorialDetail} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Splash() {
  return (
    <div className="safelight grid min-h-[100dvh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Logo className="h-12 w-12 animate-pulse" />
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-muted"><div className="scan h-full w-1/2 bg-primary" /></div>
      </div>
    </div>
  );
}

function Gate() {
  const session = useGetSession();
  useHealthCheck({ query: { queryKey: ['/api/healthz'], staleTime: 60_000 } });
  const { setTheme, setLanguage } = useSettingsStore();
  const appliedFor = useRef<string | null>(null);
  const user = session.data?.user;

  useEffect(() => {
    if (user && appliedFor.current !== user.id) {
      appliedFor.current = user.id;
      setTheme(user.theme);
      setLanguage(user.language);
    }
    if (!user) appliedFor.current = null;
  }, [user, setTheme, setLanguage]);

  if (session.isLoading) return <Splash />;
  if (!session.data?.authenticated || !user) return <Login session={session.data} />;
  return <AppShell user={user}><Routes /></AppShell>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Gate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
