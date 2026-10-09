import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Zap, Bot, KeyRound, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import {
  useListMcpConnections, useCreateMcpConnection, useUpdateMcpConnection, useDeleteMcpConnection, useTestMcpConnection,
  getListMcpConnectionsQueryKey, getGetDeliveryCapabilitiesQueryKey, getGetDashboardSummaryQueryKey,
  type McpProviderType, type McpConnection, type TestResult,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';
import { cn } from '@/lib/utils';

const PROVIDERS: { type: McpProviderType; icon: React.ComponentType<{ className?: string }>; model: string }[] = [
  { type: 'google_nano_banana', icon: SiGoogle, model: 'gemini-2.5-flash-image' },
  { type: 'openai_chatgpt', icon: Bot, model: 'gpt-4o' },
  { type: 'runway', icon: Zap, model: 'gen4_turbo' },
  { type: 'custom_mcp', icon: Sparkles, model: '' },
];

type Form = { id?: string; providerType: McpProviderType; name: string; apiKey: string; endpointUrl: string; headers: string; defaultModel: string; isActive: boolean };

export function McpTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const conns = useListMcpConnections();
  const create = useCreateMcpConnection();
  const update = useUpdateMcpConnection();
  const del = useDeleteMcpConnection();
  const test = useTestMcpConnection();
  const [form, setForm] = useState<Form | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const inv = () => ['mcp', 'caps', 'dash'].forEach((k) => qc.invalidateQueries({ queryKey: k === 'mcp' ? getListMcpConnectionsQueryKey() : k === 'caps' ? getGetDeliveryCapabilitiesQueryKey() : getGetDashboardSummaryQueryKey() }));
  const err = (e: unknown) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) });

  const open = (type: McpProviderType, c?: McpConnection) => setForm(c ? {
    id: c.id, providerType: c.providerType, name: c.name, apiKey: '', endpointUrl: c.endpointUrl ?? '', headers: (c.headerNames ?? []).map((h) => `${h}: `).join('\n'), defaultModel: c.defaultModel ?? '', isActive: c.isActive,
  } : { providerType: type, name: t(`settings.mcpProviders.${type}.name`), apiKey: '', endpointUrl: '', headers: '', defaultModel: PROVIDERS.find((p) => p.type === type)?.model ?? '', isActive: true });

  const save = () => {
    if (!form) return;
    const isCustom = form.providerType === 'custom_mcp';
    const headers: Record<string, string> = {};
    form.headers.split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) { const k = l.slice(0, i).trim(); const v = l.slice(i + 1).trim(); if (k && v) headers[k] = v; } });
    const base = { name: form.name, endpointUrl: form.endpointUrl || null, defaultModel: form.defaultModel || null, isActive: form.isActive, ...(Object.keys(headers).length ? { headers } : {}) };
    const done = { onSuccess: () => { inv(); setForm(null); toast({ title: t('common.saved') }); }, onError: err };
    if (form.id) update.mutate({ id: form.id, data: { ...base, ...(form.apiKey ? { apiKey: form.apiKey } : {}) } }, done);
    else create.mutate({ data: { ...base, providerType: form.providerType, connectionType: isCustom ? 'mcp_sse' : 'api_key', apiKey: form.apiKey || null } }, done);
  };

  const runTest = (id: string) => test.mutate({ id }, {
    onSuccess: (r) => { setResults((s) => ({ ...s, [id]: r })); toast({ variant: r.ok ? 'default' : 'destructive', title: r.ok ? t('settings.testOk') : t('settings.testFail'), description: r.message }); },
    onError: err,
  });

  return (
    <div>
      <div className="mb-4"><h2 className="text-xl font-bold">{t('settings.mcpTitle')}</h2><p className="text-sm text-muted-foreground">{t('settings.mcpBody')}</p></div>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/8 p-3 text-sm"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t('settings.builtin')}</div>
      {conns.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((p, i) => {
            const list = (conns.data ?? []).filter((c) => c.providerType === p.type);
            return (
              <div key={p.type} className="rise flex flex-col rounded-2xl border bg-card p-5" style={{ animationDelay: `${i * 60}ms` }} data-testid={`card-provider-${p.type}`}>
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl border bg-muted/50"><p.icon className="h-5 w-5" /></div>
                  <div className="flex-1"><div className="font-display font-semibold">{t(`settings.mcpProviders.${p.type}.name`)}</div><div className="text-xs text-muted-foreground">{t(`settings.mcpProviders.${p.type}.body`)}</div></div>
                  {list.some((c) => c.isActive) && <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />{t('settings.connected')}</span>}
                </div>
                <div className="mt-4 flex-1 space-y-2">
                  {list.map((c) => (
                    <div key={c.id} className="rounded-lg border bg-muted/30 p-2.5" data-testid={`row-mcp-${c.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                        <Switch checked={c.isActive} onCheckedChange={(v) => update.mutate({ id: c.id, data: { isActive: v } }, { onSuccess: inv, onError: err })} data-testid={`switch-mcp-${c.id}`} />
                        <button onClick={() => runTest(c.id)} disabled={test.isPending} className="rounded p-1 text-muted-foreground hover:text-foreground" title={t('common.test')} data-testid={`button-test-mcp-${c.id}`}><Zap className={cn('h-3.5 w-3.5', test.isPending && test.variables?.id === c.id && 'animate-pulse text-primary')} /></button>
                        <button onClick={() => open(p.type, c)} className="rounded p-1 text-muted-foreground hover:text-foreground" data-testid={`button-edit-mcp-${c.id}`}><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => del.mutate({ id: c.id }, { onSuccess: inv, onError: err })} className="rounded p-1 text-muted-foreground hover:text-destructive" data-testid={`button-delete-mcp-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-muted-foreground">
                        {c.maskedKey && <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" />{c.maskedKey}</span>}
                        {c.endpointUrl && <span className="truncate">{c.endpointUrl}</span>}
                        {c.defaultModel && <span>{c.defaultModel}</span>}
                      </div>
                      {results[c.id] && <div className={cn('mt-1.5 flex items-start gap-1 text-[11px]', results[c.id].ok ? 'text-success' : 'text-destructive')}>{results[c.id].ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{results[c.id].message}{results[c.id].detail && <span className="opacity-70"> · {results[c.id].detail}</span>}</div>}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => open(p.type)} className="mt-4 self-start" data-testid={`button-connect-${p.type}`}><Plus />{t('settings.connect')}</Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{form && t(`settings.mcpProviders.${form.providerType}.name`)}</DialogTitle><DialogDescription>{form && t(`settings.mcpProviders.${form.providerType}.body`)}</DialogDescription></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>{t('common.name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" data-testid="input-mcp-name" /></div>
              {form.providerType === 'custom_mcp' && <>
                <div><Label>{t('settings.endpoint')}</Label><Input value={form.endpointUrl} onChange={(e) => setForm({ ...form, endpointUrl: e.target.value })} placeholder="https://mcp.example.com/sse" className="mt-1.5 font-mono text-sm" data-testid="input-mcp-endpoint" /></div>
                <div><Label>{t('settings.headers')}</Label><Textarea value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder="Authorization: Bearer ..." className="mt-1.5 min-h-[70px] font-mono text-xs" data-testid="input-mcp-headers" /><p className="mt-1 text-[11px] text-muted-foreground">{t('settings.headersHint')}</p></div>
              </>}
              <div><Label>{t('settings.apiKey')}</Label><Input type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={form.id ? t('settings.apiKeyKeep') : 'sk-...'} className="mt-1.5 font-mono text-sm" data-testid="input-mcp-key" /></div>
              <div><Label>{t('settings.model')}</Label><Input value={form.defaultModel} onChange={(e) => setForm({ ...form, defaultModel: e.target.value })} className="mt-1.5 font-mono text-sm" data-testid="input-mcp-model" /></div>
              <div className="flex items-center justify-between"><Label>{t('common.active')}</Label><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} data-testid="switch-mcp-active-form" /></div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setForm(null)}>{t('common.cancel')}</Button><Button onClick={save} disabled={!form?.name.trim() || create.isPending || update.isPending} className="pop" data-testid="button-save-mcp">{t('common.save')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
