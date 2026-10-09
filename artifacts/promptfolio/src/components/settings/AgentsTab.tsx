import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Shield, Pencil, Tag } from 'lucide-react';
import {
  useListAgents, useCreateAgent, useUpdateAgent, useDeleteAgent, getListAgentsQueryKey, useListCategories, useCreateCategory,
  useDeleteCategory, getListCategoriesQueryKey, type Agent, type AgentRole, type CategoryInputModalityScope,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/pf/States';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';
import { cn } from '@/lib/utils';

const ROLES: AgentRole[] = ['meta_agent_builder', 'prompt_builder', 'delivery_executor'];
const COLORS = ['#F2542D', '#1FB89A', '#E9B23B', '#5B8DEF', '#D65DB1', '#8A8F98'];

type Draft = { id?: string; name: string; description: string; agentRole: AgentRole; systemPrompt: string; temperature: number };

export function AgentsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const agents = useListAgents();
  const create = useCreateAgent();
  const update = useUpdateAgent();
  const del = useDeleteAgent();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Agent | null>(null);
  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all');
  const inv = () => qc.invalidateQueries({ queryKey: getListAgentsQueryKey() });
  const err = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });

  const save = () => {
    if (!draft) return;
    const payload = { name: draft.name, description: draft.description || null, systemPrompt: draft.systemPrompt, temperature: draft.temperature };
    const done = { onSuccess: () => { inv(); setDraft(null); toast({ title: t('common.saved') }); }, onError: err };
    if (draft.id) update.mutate({ id: draft.id, data: payload }, done);
    else create.mutate({ data: { ...payload, agentRole: draft.agentRole } }, done);
  };

  const list = (agents.data ?? []).filter((a) => roleFilter === 'all' || a.agentRole === roleFilter);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-bold">{t('settings.agentsTitle')}</h2><p className="text-sm text-muted-foreground">{t('settings.agentsBody')}</p></div>
          <Button onClick={() => setDraft({ name: '', description: '', agentRole: 'delivery_executor', systemPrompt: '', temperature: 0.7 })} className="pop" data-testid="button-new-agent"><Plus />{t('settings.newAgent')}</Button>
        </div>
        <div className="mb-4 flex flex-wrap gap-1">
          {(['all', ...ROLES] as const).map((r) => <button key={r} onClick={() => setRoleFilter(r)} data-testid={`filter-role-${r}`} className={cn('rounded-full border px-3 py-1 text-xs transition-colors', roleFilter === r ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>{r === 'all' ? t('common.all') : t(`role.${r}`)}</button>)}
        </div>
        {agents.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div> : agents.isError ? <ErrorState onRetry={() => agents.refetch()} /> : (
          <div className="space-y-2">
            {list.map((a, i) => (
              <div key={a.id} className={cn('rise flex items-start gap-4 rounded-xl border bg-card p-4 transition-opacity', !a.isActive && 'opacity-60')} style={{ animationDelay: `${i * 35}ms` }} data-testid={`card-agent-${a.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px]">{t(`role.${a.agentRole}`)}</span>
                    {a.isSystemDefault && <span className="flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-[10.5px] text-accent"><Shield className="h-3 w-3" />{t('settings.system')}</span>}
                    <span className="font-mono text-[10.5px] text-muted-foreground">T {a.temperature?.toFixed(1) ?? '—'}</span>
                  </div>
                  {a.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{a.description}</p>}
                  <p className="mt-2 line-clamp-2 font-mono text-[11px] text-muted-foreground/80">{a.systemPrompt}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={a.isActive} onCheckedChange={(v) => update.mutate({ id: a.id, data: { isActive: v } }, { onSuccess: inv, onError: err })} data-testid={`switch-agent-active-${a.id}`} />
                  <Button size="icon" variant="ghost" onClick={() => setDraft({ id: a.id, name: a.name, description: a.description ?? '', agentRole: a.agentRole, systemPrompt: a.systemPrompt, temperature: a.temperature ?? 0.7 })} data-testid={`button-edit-agent-${a.id}`}><Pencil /></Button>
                  <Button size="icon" variant="ghost" disabled={a.isSystemDefault} title={a.isSystemDefault ? t('settings.systemLocked') : t('common.delete')} onClick={() => setToDelete(a)} className="text-destructive" data-testid={`button-delete-agent-${a.id}`}><Trash2 /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <CategoriesPanel />

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-display">{draft?.id ? t('common.edit') : t('settings.newAgent')}</DialogTitle><DialogDescription>{t('settings.agentsBody')}</DialogDescription></DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>{t('common.name')}</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1.5" data-testid="input-agent-name" /></div>
                <div>
                  <Label>{t('settings.role')}</Label>
                  <Select value={draft.agentRole} onValueChange={(v) => setDraft({ ...draft, agentRole: v as AgentRole })} disabled={!!draft.id}>
                    <SelectTrigger className="mt-1.5" data-testid="select-agent-role-edit"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{t(`role.${r}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{t('common.description')}</Label><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="mt-1.5" data-testid="input-agent-description" /></div>
              <div><Label>{t('settings.systemPrompt')}</Label><Textarea value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} className="mt-1.5 min-h-[220px] font-mono text-[12.5px]" data-testid="input-agent-system-prompt" /></div>
              <div>
                <Label className="flex justify-between">{t('settings.temperature')}<span className="font-mono">{draft.temperature.toFixed(2)}</span></Label>
                <Slider value={[draft.temperature]} min={0} max={2} step={0.05} onValueChange={([v]) => setDraft({ ...draft, temperature: v })} className="mt-3" data-testid="slider-temperature" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={!draft?.name.trim() || !draft?.systemPrompt.trim() || create.isPending || update.isPending} className="pop" data-testid="button-save-agent">{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle><AlertDialogDescription>{toDelete?.name} · {t('common.confirmDeleteBody')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete-agent" onClick={() => toDelete && del.mutate({ id: toDelete.id }, { onSuccess: () => { inv(); toast({ title: t('common.deleted') }); }, onError: err })}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoriesPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const cats = useListCategories();
  const create = useCreateCategory();
  const del = useDeleteCategory();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [scope, setScope] = useState<CategoryInputModalityScope>('all');
  const inv = () => qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  const err = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });
  const add = () => name.trim() && create.mutate({ data: { name: name.trim(), color, modalityScope: scope } }, { onSuccess: () => { inv(); setName(''); }, onError: err });

  return (
    <aside className="rounded-2xl border bg-card p-4 xl:sticky xl:top-20 xl:self-start">
      <div className="flex items-center gap-2 font-display font-semibold"><Tag className="h-4 w-4 text-primary" />{t('settings.categories')}</div>
      <p className="mb-4 text-xs text-muted-foreground">{t('settings.categoriesBody')}</p>
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={t('common.name')} className="h-8 text-sm" data-testid="input-category-name" />
        <div className="flex items-center gap-1.5">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={cn('h-5 w-5 rounded-full transition-transform', color === c && 'scale-125 ring-2 ring-foreground/40 ring-offset-1 ring-offset-card')} style={{ background: c }} data-testid={`button-color-${c}`} />)}</div>
        <div className="flex gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as CategoryInputModalityScope)}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-category-scope"><SelectValue /></SelectTrigger>
            <SelectContent>{(['all', 'image', 'video', 'audio', 'text'] as const).map((s) => <SelectItem key={s} value={s}>{s === 'all' ? t('modality.all') : t(`modality.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" onClick={add} disabled={!name.trim() || create.isPending} data-testid="button-add-category-settings"><Plus />{t('common.add')}</Button>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {cats.isLoading ? <Skeleton className="h-20" /> : cats.data?.map((c) => (
          <div key={c.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50" data-testid={`row-category-${c.id}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            <span className="flex-1 truncate text-sm">{c.name}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground">{c.modalityScope} · {c.promptCount}</span>
            <button onClick={() => del.mutate({ id: c.id }, { onSuccess: inv, onError: err })} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" data-testid={`button-delete-category-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </aside>
  );
}
