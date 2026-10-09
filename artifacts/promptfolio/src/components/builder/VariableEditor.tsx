import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Info, Sparkles, Variable as VariableIcon } from 'lucide-react';
import { useSuggestPromptVariables, type PromptVariable } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requiredTone } from '@/components/pf/VariableInfo';
import { useToast } from '@/hooks/use-toast';
import { apiErrorMessage } from '@/lib/pf';
import { hasDocs, isRequired, linesToList, listToLines } from '@/lib/variables';
import { cn } from '@/lib/utils';

type Props = {
  variables: PromptVariable[];
  template: string;
  onPatch: (name: string, patch: Partial<PromptVariable>) => void;
  /** Replace all variables (used by the AI suggestion). */
  onReplace: (vars: PromptVariable[]) => void;
};

/** Edits the field documentation shown in the Executor: label, required flag, purpose, examples, default and allowed values. */
export function VariableEditor({ variables, template, onPatch, onReplace }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const suggest = useSuggestPromptVariables();
  const [open, setOpen] = useState<string | null>(null);
  const undocumented = variables.filter((v) => !hasDocs(v)).length;

  const runSuggest = () => {
    suggest.mutate({ data: { promptTemplate: template, variables } }, {
      onSuccess: (r) => { onReplace(r.variables); toast({ title: t('fieldDocs.suggested') }); },
      onError: (e) => toast({ variant: 'destructive', title: t('common.error'), description: apiErrorMessage(e) }),
    });
  };

  return (
    <div className="rounded-xl border bg-muted/30 p-4" data-testid="variable-editor">
      <div className="flex items-center gap-2 text-sm font-medium">
        <VariableIcon className="h-4 w-4 text-primary" />{t('builder.variables')}
        <span className="font-mono text-xs text-muted-foreground">{variables.length}</span>
        {variables.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={runSuggest} disabled={suggest.isPending} className="ml-auto h-7 text-xs" data-testid="button-suggest-docs">
            <Sparkles className={cn('h-3.5 w-3.5', suggest.isPending && 'animate-pulse')} />{suggest.isPending ? t('fieldDocs.suggesting') : t('fieldDocs.suggest')}
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('fieldDocs.hint')}</p>
      {undocumented > 0 && <p className="mt-1 text-[11px] text-yellow-600 dark:text-yellow-300">{t('fieldDocs.undocumented', { count: undocumented })}</p>}
      {variables.length === 0 ? <p className="mt-3 text-xs italic text-muted-foreground">{t('builder.noVariables')}</p> : (
        <div className="mt-3 space-y-1.5">
          {variables.map((v) => {
            const req = isRequired(v);
            const expanded = open === v.name;
            return (
              <div key={v.name} className={cn('rounded-lg border bg-background/60 transition-colors', expanded && 'border-primary/40')}>
                <div className="flex items-center gap-2 p-1.5">
                  <span className="var-chip max-w-[40%] truncate whitespace-nowrap">{`{{${v.name}}}`}</span>
                  <Input value={v.label ?? ''} onChange={(e) => onPatch(v.name, { label: e.target.value })} placeholder={t('builder.varLabel')} className="h-8 min-w-0 flex-1 text-xs" data-testid={`input-var-label-${v.name}`} />
                  <button type="button" onClick={() => onPatch(v.name, { required: !req })} title={t('fieldDocs.toggleRequired')}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors hover:bg-muted" data-testid={`button-required-${v.name}`}>
                    <Info className={cn('h-3.5 w-3.5', requiredTone(req))} />{req ? t('fieldInfo.required') : t('fieldInfo.optional')}
                  </button>
                  <button type="button" onClick={() => setOpen(expanded ? null : v.name)} aria-label={t('fieldDocs.details')} aria-expanded={expanded}
                    className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" data-testid={`button-expand-var-${v.name}`}>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                    {!hasDocs(v) && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                  </button>
                </div>
                {expanded && (
                  <div className="grid gap-2.5 border-t p-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label className="text-[11px]">{t('fieldDocs.help')}</Label>
                      <Textarea value={v.helpText ?? ''} onChange={(e) => onPatch(v.name, { helpText: e.target.value })} placeholder={t('fieldDocs.helpPlaceholder')} className="mt-1 min-h-[70px] text-xs" data-testid={`input-var-help-${v.name}`} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-[11px]">{t('fieldDocs.examples')}</Label>
                      <Textarea value={listToLines(v.examples)} onChange={(e) => onPatch(v.name, { examples: e.target.value.split('\n') })} onBlur={(e) => onPatch(v.name, { examples: linesToList(e.target.value) })} placeholder={t('fieldDocs.examplesPlaceholder')} className="mt-1 min-h-[60px] text-xs" data-testid={`input-var-examples-${v.name}`} />
                    </div>
                    <div>
                      <Label className="text-[11px]">{t('builder.varDefault')}</Label>
                      <Input value={v.defaultValue ?? ''} onChange={(e) => onPatch(v.name, { defaultValue: e.target.value })} className="mt-1 h-8 text-xs" data-testid={`input-var-default-${v.name}`} />
                    </div>
                    <div>
                      <Label className="text-[11px]">{t('fieldDocs.options')}</Label>
                      <Textarea value={listToLines(v.options)} onChange={(e) => onPatch(v.name, { options: e.target.value.split('\n') })} onBlur={(e) => onPatch(v.name, { options: linesToList(e.target.value) })} placeholder={t('fieldDocs.optionsPlaceholder')} className="mt-1 min-h-[32px] text-xs" rows={2} data-testid={`input-var-options-${v.name}`} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Clean list fields before sending (editors keep raw lines while typing). */
export function cleanVariables(vars: PromptVariable[]): PromptVariable[] {
  return vars.map((v) => ({ ...v, examples: linesToList((v.examples ?? []).join('\n')), options: linesToList((v.options ?? []).join('\n')), required: isRequired(v) }));
}
