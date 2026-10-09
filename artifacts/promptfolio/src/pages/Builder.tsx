import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { Bot, Braces, Lock, Plus, Send, Trash2, Rocket, MessageSquareDashed, Sparkles, CheckCircle2, ChevronLeft } from 'lucide-react';
import {
  useListBuilderSessions, useCreateBuilderSession, useDeleteBuilderSession, useGetBuilderSession, useListAgents,
  useSendBuilderMessage, getListBuilderSessionsQueryKey, getGetBuilderSessionQueryKey, getGetDashboardSummaryQueryKey,
  type BuilderWorkspaceType, type ChatSessionDetail,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Markdown } from '@/components/pf/Markdown';
import { EmptyState, ErrorState } from '@/components/pf/States';
import { PublishDialog } from '@/components/builder/PublishDialog';
import { useChatStore } from '@/store/useChatStore';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';
import { cn } from '@/lib/utils';

export default function Builder({ kind }: { kind: 'agents' | 'prompts' }) {
  const { t, i18n } = useTranslation();
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const workspace: BuilderWorkspaceType = kind === 'agents' ? 'builder_agent' : 'builder_prompt';
  const base = `/builder/${kind}`;
  const sessionId = params.id ?? '';
  const locale = i18n.language === 'pt-BR' ? ptBR : enUS;

  const sessions = useListBuilderSessions({ workspaceType: workspace });
  const create = useCreateBuilderSession();
  const del = useDeleteBuilderSession();
  const [toDelete, setToDelete] = useState<string | null>(null);

  const newSession = () => {
    create.mutate({ data: { workspaceType: workspace } }, {
      onSuccess: (s) => {
        qc.invalidateQueries({ queryKey: getListBuilderSessionsQueryKey({ workspaceType: workspace }) });
        qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setLocation(`${base}/${s.id}`);
      },
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    });
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    const id = toDelete;
    del.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBuilderSessionsQueryKey({ workspaceType: workspace }) });
        if (id === sessionId) setLocation(base);
        toast({ title: t('common.deleted') });
      },
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    });
    setToDelete(null);
  };

  const Icon = kind === 'agents' ? Bot : Braces;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside className={cn('w-full shrink-0 flex-col border-r bg-card/40 md:flex md:w-72', sessionId ? 'hidden' : 'flex')}>
        <div className="border-b p-4">
          <div className="eyebrow mb-1 flex items-center gap-1.5"><Icon className="h-3 w-3 text-primary" />{t('sidebar.builder')}</div>
          <h1 className="text-xl font-bold">{kind === 'agents' ? t('builder.agentsTitle') : t('builder.promptsTitle')}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{kind === 'agents' ? t('builder.agentsSubtitle') : t('builder.promptsSubtitle')}</p>
          <Button onClick={newSession} disabled={create.isPending} className="pop mt-4 w-full" data-testid="button-new-session"><Plus />{t('builder.newSession')}</Button>
        </div>
        <div className="eyebrow px-4 pb-1 pt-3">{t('builder.sessions')}</div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {sessions.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />) :
            sessions.isError ? <ErrorState onRetry={() => sessions.refetch()} /> :
            !sessions.data?.length ? (
              <div className="px-3 py-10 text-center"><MessageSquareDashed className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><div className="text-sm font-medium">{t('builder.noSessions')}</div><div className="mt-1 text-xs text-muted-foreground">{t('builder.noSessionsBody')}</div></div>
            ) : sessions.data.map((s, i) => (
              <div key={s.id} onClick={() => setLocation(`${base}/${s.id}`)} data-testid={`card-session-${s.id}`}
                className={cn('rise group relative cursor-pointer rounded-lg border px-3 py-2.5 transition-colors', s.id === sessionId ? 'border-primary/40 bg-primary/8' : 'border-transparent hover:bg-muted/60')}
                style={{ animationDelay: `${i * 35}ms` }}>
                <div className="flex items-center gap-1.5 pr-6 text-sm font-medium"><span className="truncate">{s.title || t('common.untitled')}</span>{(s.publishedPromptId || s.publishedAgentId) && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {s.isLocked && <Lock className="h-2.5 w-2.5" />}
                  <span className="truncate">{s.lockedAgentName ?? '—'}</span>
                  <span>·</span><span className="shrink-0">{formatDistanceToNow(new Date(s.createdAt), { locale })}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setToDelete(s.id); }} className="absolute right-2 top-2.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" data-testid={`button-delete-session-${s.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
        </div>
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col', sessionId ? 'flex' : 'hidden md:flex')}>
        {sessionId ? <ChatPane key={sessionId} sessionId={sessionId} workspace={workspace} onBack={() => setLocation(base)} /> : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState icon={Icon} title={t('builder.startTitle')} body={t('builder.startBody')} className="w-full max-w-lg"
              action={<Button onClick={newSession} disabled={create.isPending} className="pop" data-testid="button-new-session-empty"><Plus />{t('builder.newSession')}</Button>} />
          </div>
        )}
      </section>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('builder.deleteSession')}</AlertDialogTitle><AlertDialogDescription>{t('common.confirmDeleteBody')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete-session">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChatPane({ sessionId, workspace, onBack }: { sessionId: string; workspace: BuilderWorkspaceType; onBack: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const detail = useGetBuilderSession(sessionId, { query: { enabled: !!sessionId, queryKey: getGetBuilderSessionQueryKey(sessionId) } });
  const agents = useListAgents({ role: workspace === 'builder_agent' ? 'meta_agent_builder' : 'prompt_builder' });
  const send = useSendBuilderMessage();
  const { selectedAgentBySession, selectAgent, drafts, setDraft, pending, setPending, publishOpen, setPublishOpen } = useChatStore();
  const text = drafts[sessionId] ?? '';
  const selectedAgent = selectedAgentBySession[sessionId] ?? '';
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const session = detail.data?.session;
  const messages = detail.data?.messages ?? [];
  const locked = !!session?.isLocked;
  const activeAgents = (agents.data ?? []).filter((a) => a.isActive);
  const hasAssistant = messages.some((m) => m.role === 'assistant');
  const showPending = send.isPending && pending?.sessionId === sessionId;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, showPending]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`; }
  }, [text]);

  const canSend = !!text.trim() && !send.isPending && (locked || !!selectedAgent);

  const doSend = () => {
    if (!canSend) return;
    const content = text.trim();
    setPending({ sessionId, content });
    setDraft(sessionId, '');
    send.mutate({ id: sessionId, data: locked ? { content } : { content, agentId: selectedAgent } }, {
      onSuccess: (ex) => {
        qc.setQueryData<ChatSessionDetail>(getGetBuilderSessionQueryKey(sessionId), (old) => old ? {
          ...old, session: ex.session, messages: [...old.messages, ex.userMessage, ex.assistantMessage],
          lockedAgent: old.lockedAgent ?? activeAgents.find((a) => a.id === ex.session.lockedAgentId) ?? null,
        } : old);
        qc.invalidateQueries({ queryKey: getListBuilderSessionsQueryKey({ workspaceType: workspace }) });
        setPending(null);
      },
      onError: (e) => {
        setPending(null);
        setDraft(sessionId, content);
        toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });
      },
    });
  };

  if (detail.isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-12" /><Skeleton className="ml-auto h-16 w-2/3" /><Skeleton className="h-32 w-3/4" /></div>;
  if (detail.isError || !session) return <div className="p-6"><ErrorState message={apiErrorMessage(detail.error)} onRetry={() => detail.refetch()} /></div>;

  const published = !!(session.publishedPromptId || session.publishedAgentId);

  return (
    <>
      <div className="flex items-center gap-3 border-b bg-background/60 px-4 py-3 backdrop-blur md:px-6">
        <button onClick={onBack} className="md:hidden" data-testid="button-back-sessions"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-semibold" data-testid="text-session-title">{session.title || t('common.untitled')}</div>
          <div className="text-[11px] text-muted-foreground">{t('builder.messages', { count: messages.length })}{published && <span className="ml-2 text-success">· {t('builder.published')}</span>}</div>
        </div>
        <Button onClick={() => setPublishOpen(true)} disabled={!hasAssistant || send.isPending} className="pop" data-testid="button-save-publish"><Rocket />{t('builder.save_btn')}</Button>
      </div>

      <div className="px-4 pt-4 md:px-6">
        {locked ? (
          <div className="rise flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/8 p-3 text-sm" data-testid="banner-locked">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Lock className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="font-medium"><span className="text-muted-foreground">{t('builder.lockedWith')}</span> <span data-testid="text-locked-agent">{session.lockedAgentName ?? detail.data?.lockedAgent?.name}</span></div>
              <div className="text-xs text-muted-foreground">{t('builder.lock_banner')}</div>
            </div>
          </div>
        ) : (
          <div className="rise rounded-xl border border-dashed bg-card/60 p-3">
            <label className="eyebrow mb-2 block">{t('builder.select_agent')}</label>
            {agents.isLoading ? <Skeleton className="h-10" /> : activeAgents.length === 0 ? <p className="text-sm text-warning">{t('builder.noAgents')}</p> : (
              <Select value={selectedAgent} onValueChange={(v) => selectAgent(sessionId, v)}>
                <SelectTrigger className="h-auto min-h-10" data-testid="select-builder-agent"><SelectValue placeholder={t('builder.selectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {activeAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex flex-col items-start"><span className="font-medium">{a.name}</span>{a.description && <span className="line-clamp-1 text-xs text-muted-foreground">{a.description}</span>}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.length === 0 && !showPending && (
            <div className="rise py-12 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border bg-card shadow-md"><Sparkles className="h-6 w-6 text-primary" /></div>
              <div className="font-display text-xl font-semibold">{t('builder.emptyTitle')}</div>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('builder.emptyBody')}</p>
            </div>
          )}
          {messages.map((m) => m.role === 'user' ? (
            <div key={m.id} className="rise flex justify-end" data-testid={`message-user-${m.id}`}>
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-md">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="rise flex gap-3" data-testid={`message-assistant-${m.id}`}>
              <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border bg-card"><Bot className="h-3.5 w-3.5 text-primary" /></div>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card px-4 py-3 shadow-sm"><Markdown content={m.content} /></div>
            </div>
          ))}
          {showPending && pending && (
            <>
              <div className="rise flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary/80 px-4 py-2.5 text-sm text-primary-foreground">{pending.content}</div></div>
              <div className="rise flex gap-3" data-testid="status-thinking">
                <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border bg-card"><Bot className="h-3.5 w-3.5 animate-pulse text-primary" /></div>
                <div className="relative overflow-hidden rounded-2xl rounded-tl-md border bg-card px-4 py-3">
                  <div className="scan absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
                  <div className="relative flex items-center gap-2 text-sm"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: `${i * .15}s` }} />)}</span>{t('builder.thinking')}</div>
                  <div className="relative mt-1 text-[11px] text-muted-foreground">{t('builder.thinkingHint')}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t bg-background/70 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className={cn('flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-md transition-colors focus-within:border-primary/50', !locked && !selectedAgent && 'opacity-80')}>
            <textarea ref={taRef} rows={1} value={text} onChange={(e) => setDraft(sessionId, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }}
              placeholder={t('builder.placeholder')} className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground" data-testid="input-message" />
            <Button onClick={doSend} disabled={!canSend} size="icon" className="pop h-10 w-10 shrink-0 rounded-xl" data-testid="button-send"><Send /></Button>
          </div>
          <div className="mt-1.5 px-2 text-[11px] text-muted-foreground">{!locked && !selectedAgent ? <span className="text-warning">{t('builder.pickFirst')}</span> : t('builder.hint')}</div>
        </div>
      </div>

      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} sessionId={sessionId} workspace={workspace} />
    </>
  );
}
