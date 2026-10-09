import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Rocket, X } from 'lucide-react';
import {
  useGetPublishDraft, getGetPublishDraftQueryKey, usePublishFromSession, useListCategories, useCreateCategory,
  useListMcpConnections, getListCategoriesQueryKey, getListPromptsQueryKey, getListBuilderSessionsQueryKey,
  getGetBuilderSessionQueryKey, getListAgentsQueryKey, getGetDashboardSummaryQueryKey, getGetRecentActivityQueryKey,
  type Modality, type AgentRole, type PromptVariable, type BuilderWorkspaceType,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { MODALITIES, MODALITY_ICON, apiErrorMessage, detectVariables } from '@/lib/pf';
import { cn } from '@/lib/utils';
import { VariableEditor, cleanVariables } from '@/components/builder/VariableEditor';

const NONE = '__none__';

export function PublishDialog({ open, onOpenChange, sessionId, workspace }: { open: boolean; onOpenChange: (o: boolean) => void; sessionId: string; workspace: BuilderWorkspaceType }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const draft = useGetPublishDraft(sessionId, { query: { enabled: open && !!sessionId, queryKey: getGetPublishDraftQueryKey(sessionId), staleTime: 0 } });
  const cats = useListCategories();
  const mcps = useListMcpConnections();
  const createCat = useCreateCategory();
  const publish = usePublishFromSession();

  const isAgent = workspace === 'builder_agent';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState(NONE);
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [vars, setVars] = useState<Record<string, PromptVariable>>({});
  const [modality, setModality] = useState<Modality>('image');
  const [mcpId, setMcpId] = useState(NONE);
  const [role, setRole] = useState<AgentRole>('delivery_executor');
  const [newCat, setNewCat] = useState('');
  const initFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) initFor.current = null;
  }, [open]);

  useEffect(() => {
    const d = draft.data;
    if (d && open && initFor.current !== sessionId && !draft.isFetching) {
      initFor.current = sessionId;
      setTitle(d.title);
      setDescription(d.description ?? '');
      setContent(d.content);
      setTags(d.tags);
      setModality(d.targetModality);
      const v: Record<string, PromptVariable> = {};
      d.variables.forEach((x) => (v[x.name] = x));
      setVars(v);
      const suggested = mcps.data?.find((m) => m.providerType === d.suggestedMcpProvider && m.isActive);
      setMcpId(suggested?.id ?? NONE);
    }
  }, [draft.data, draft.isFetching, open, sessionId, mcps.data]);

  const detected = useMemo(() => detectVariables(content), [content]);
  const variables: PromptVariable[] = detected.map((n) => ({ ...vars[n], name: n, label: vars[n]?.label ?? n, defaultValue: vars[n]?.defaultValue ?? '', description: vars[n]?.description ?? null }));
  const replaceVars = (list: PromptVariable[]) => setVars((s) => ({ ...s, ...Object.fromEntries(list.map((v) => [v.name, v])) }));
  const setVar = (name: string, patch: Partial<PromptVariable>) => setVars((s) => ({ ...s, [name]: { ...(s[name] ?? { name }), ...patch } }));

  const addTag = () => {
    const v = tagInput.trim().replace(/,$/, '');
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const addCategory = () => {
    if (!newCat.trim()) return;
    createCat.mutate({ data: { name: newCat.trim(), modalityScope: 'all' } }, {
      onSuccess: (c) => {
        qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setCategoryId(c.id);
        setNewCat('');
      },
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    });
  };

  const submit = () => {
    publish.mutate({
      id: sessionId,
      data: {
        kind: isAgent ? 'agent' : 'prompt', title, description: description || null, content,
        categoryId: categoryId === NONE ? null : categoryId, folder: folder || null, tags, variables: cleanVariables(variables),
        targetModality: modality, preferredMcpId: mcpId === NONE ? null : mcpId, ...(isAgent ? { agentRole: role } : {}),
      },
    }, {
      onSuccess: (res) => {
        [getListPromptsQueryKey(), getListBuilderSessionsQueryKey({ workspaceType: workspace }), getGetBuilderSessionQueryKey(sessionId), getListAgentsQueryKey(), getGetDashboardSummaryQueryKey(), getGetRecentActivityQueryKey()]
          .forEach((k) => qc.invalidateQueries({ queryKey: k }));
        onOpenChange(false);
        const promptId = res.prompt?.id;
        toast({
          title: t('builder.publishedToast'),
          description: res.prompt?.title ?? res.agent?.name,
          action: res.kind === 'prompt' && promptId ? (
            <ToastAction altText={t('builder.openExecutor')} onClick={() => setLocation(`/executor/${res.prompt?.targetModality ?? 'image'}?prompt=${promptId}`)}>{t('builder.openExecutor')}</ToastAction>
          ) : (
            <ToastAction altText={t('builder.openCatalog')} onClick={() => setLocation(res.kind === 'agent' ? '/settings?tab=agents' : '/catalog')}>{t('builder.openCatalog')}</ToastAction>
          ),
        });
      },
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto p-0">
        <div className="sticky top-0 z-10 border-b bg-popover/95 px-6 py-4 backdrop-blur">
          <DialogHeader>
            <div className="eyebrow">{isAgent ? t('role.meta_agent_builder') : t('role.prompt_builder')}</div>
            <DialogTitle className="font-display text-xl">{isAgent ? t('builder.modal_title_agent') : t('builder.modal_title')}</DialogTitle>
            <DialogDescription className="sr-only">{t('builder.save_btn')}</DialogDescription>
          </DialogHeader>
        </div>
        {draft.isLoading || draft.isFetching && !initFor.current ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: `${i * .15}s` }} />)}</span>{t('builder.draftLoading')}</div>
            <Skeleton className="h-48" /><Skeleton className="h-10" /><Skeleton className="h-10" />
          </div>
        ) : draft.isError ? (
          <div className="p-6 text-sm text-destructive">{apiErrorMessage(draft.error)}</div>
        ) : (
          <div className="grid gap-6 p-6 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <div>
                <Label className="eyebrow">{isAgent ? t('builder.contentAgent') : t('builder.content')}</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-2 min-h-[280px] font-mono text-[12.5px] leading-relaxed" data-testid="input-publish-content" />
              </div>
              {!isAgent && <VariableEditor variables={variables} template={content} onPatch={setVar} onReplace={replaceVars} />}
            </div>
            <div className="space-y-4">
              <div><Label>{t('builder.title')}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" data-testid="input-publish-title" /></div>
              <div><Label>{t('builder.description')}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1.5 min-h-[70px]" data-testid="input-publish-description" /></div>
              <div>
                <Label>{t('builder.category')}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-publish-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('catalog.noCategory')}</SelectItem>
                    {cats.data?.map((c) => <SelectItem key={c.id} value={c.id}><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="mt-2 flex gap-2">
                  <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} placeholder={t('builder.newCategory')} className="h-8 text-xs" data-testid="input-new-category" />
                  <Button size="sm" variant="outline" onClick={addCategory} disabled={!newCat.trim() || createCat.isPending} data-testid="button-add-category"><Plus /></Button>
                </div>
              </div>
              <div><Label>{t('builder.folder')}</Label><Input value={folder} onChange={(e) => setFolder(e.target.value)} className="mt-1.5" placeholder="/campaigns/2025" data-testid="input-publish-folder" /></div>
              <div>
                <Label>{t('builder.tags')}</Label>
                <div className="mt-1.5 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
                  {tags.map((tg) => (
                    <span key={tg} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">#{tg}<button onClick={() => setTags(tags.filter((x) => x !== tg))} data-testid={`button-remove-tag-${tg}`}><X className="h-3 w-3" /></button></span>
                  ))}
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} onBlur={addTag} placeholder={t('builder.tagsHint')} className="min-w-[80px] flex-1 bg-transparent text-xs outline-none" data-testid="input-tag" />
                </div>
              </div>
              <div>
                <Label>{t('builder.modality')}</Label>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {MODALITIES.map((m) => {
                    const Icon = MODALITY_ICON[m];
                    return (
                      <button key={m} onClick={() => setModality(m)} data-testid={`button-modality-${m}`} className={cn('flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] transition-all', modality === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
                        <Icon className="h-4 w-4" />{t(`modality.${m}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>{t('builder.mcp')} <span className="text-muted-foreground">({t('common.optional')})</span></Label>
                <Select value={mcpId} onValueChange={setMcpId}>
                  <SelectTrigger className="mt-1.5" data-testid="select-publish-mcp"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.auto')}</SelectItem>
                    {mcps.data?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {draft.data?.suggestedMcpProvider && <p className="mt-1 text-[11px] text-muted-foreground">{t('builder.suggested', { provider: t(`settings.mcpProviders.${draft.data.suggestedMcpProvider}.name`) })}</p>}
              </div>
              {isAgent && (
                <div>
                  <Label>{t('builder.agentRole')}</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AgentRole)}>
                    <SelectTrigger className="mt-1.5" data-testid="select-agent-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['delivery_executor', 'prompt_builder', 'meta_agent_builder'] as AgentRole[]).map((r) => <SelectItem key={r} value={r}>{t(`role.${r}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-popover/95 px-6 py-3 backdrop-blur">
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-publish">{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={!title.trim() || !content.trim() || publish.isPending || draft.isLoading} className="pop" data-testid="button-confirm-publish">
            {publish.isPending ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('builder.publishing')}</> : <><Rocket />{t('builder.publish')}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
