import { CircleHelp, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Agent, AgentLifecycle, AgentProvider } from '@colanode/client/types/agents';
import { Badge } from '@colanode/ui/components/ui/badge';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import { Separator } from '@colanode/ui/components/ui/separator';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@colanode/ui/components/ui/tooltip';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

const SettingLabel = ({ htmlFor, children, help }: { htmlFor: string; children: ReactNode; help: string }) => (
  <div className="flex items-center gap-1">
    <Label htmlFor={htmlFor}>{children}</Label>
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Help for ${children}`}>
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">{help}</TooltipContent>
    </Tooltip>
  </div>
);

type FormState = {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  provider: AgentProvider;
  model: string;
  temperature: string;
  maxOutputTokens: string;
  mcpToolAllowlist: string;
  permissions: string;
  triggers: string;
  monthlySpendUsd: string;
  monthlyTokens: string;
  lifecycle: AgentLifecycle;
};

const emptyForm: FormState = {
  name: '', description: '', instructions: '', provider: 'ollama', model: 'qwen3:4b',
  temperature: '0.5', maxOutputTokens: '', mcpToolAllowlist: '', permissions: 'workspace:read',
  triggers: 'manual', monthlySpendUsd: '', monthlyTokens: '', lifecycle: 'draft',
};

const splitList = (value: string) => value.split(/[\n,]/).map((part) => part.trim()).filter(Boolean);
const secretPattern = /(?:sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|(?:api[_-]?key|secret|password|bearer)\s*[:=]\s*\S+)/i;

const formFromAgent = (agent: Agent): FormState => ({
  id: agent.id,
  name: agent.name,
  description: agent.description,
  instructions: agent.instructions,
  provider: agent.model.provider,
  model: agent.model.model,
  temperature: String(agent.model.temperature),
  maxOutputTokens: agent.model.maxOutputTokens == null ? '' : String(agent.model.maxOutputTokens),
  mcpToolAllowlist: agent.mcpToolAllowlist.join('\n'),
  permissions: agent.permissions.join(', '),
  triggers: agent.triggers.join('\n'),
  monthlySpendUsd: agent.budget.monthlySpendUsd == null ? '' : String(agent.budget.monthlySpendUsd),
  monthlyTokens: agent.budget.monthlyTokens == null ? '' : String(agent.budget.monthlyTokens),
  lifecycle: agent.lifecycle,
});

export const AgentBuilderSettings = () => {
  const workspace = useWorkspace();
  const agentsQuery = useQuery({ type: 'agents.get', userId: workspace.userId });
  const { mutate, isPending } = useMutation();
  const [form, setForm] = useState<FormState>(emptyForm);
  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const agents = agentsQuery.data?.agents ?? [];
  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const reset = () => setForm({ ...emptyForm });

  const save = () => {
    const temperature = Number(form.temperature);
    const maxOutputTokens = form.maxOutputTokens.trim() ? Number(form.maxOutputTokens) : null;
    const monthlySpendUsd = form.monthlySpendUsd.trim() ? Number(form.monthlySpendUsd) : null;
    const monthlyTokens = form.monthlyTokens.trim() ? Number(form.monthlyTokens) : null;
    if (!form.name.trim() || !form.instructions.trim() || !form.model.trim()) {
      toast.error('Name, instructions, and model are required.'); return;
    }
    if ([temperature, maxOutputTokens, monthlySpendUsd, monthlyTokens].some((value) => value != null && !Number.isFinite(value))) {
      toast.error('Use valid numbers for temperature and budget limits.'); return;
    }
    if (temperature < 0 || temperature > 2 || (maxOutputTokens != null && maxOutputTokens < 1) || (monthlySpendUsd != null && monthlySpendUsd < 0) || (monthlyTokens != null && monthlyTokens < 0)) {
      toast.error('Check the temperature and budget limits.'); return;
    }
    if (secretPattern.test(`${form.instructions} ${form.description} ${form.mcpToolAllowlist}`)) {
      toast.error('Do not put API keys or secrets in an agent. Use Settings → AI credentials.'); return;
    }
    mutate({
      input: {
        type: 'agent.upsert', userId: workspace.userId, ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(),
        model: { provider: form.provider, model: form.model.trim(), temperature, maxOutputTokens },
        mcpToolAllowlist: splitList(form.mcpToolAllowlist), permissions: splitList(form.permissions), triggers: splitList(form.triggers),
        budget: { monthlySpendUsd, monthlyTokens }, lifecycle: form.lifecycle,
      },
      onSuccess() { toast.success(form.id ? 'Agent updated' : 'Agent created'); reset(); void agentsQuery.refetch(); },
      onError(error) { toast.error(error.message); },
    });
  };

  const deleteAgent = (agent: Agent) => {
    if (!window.confirm(`Delete ${agent.name}? This removes its saved configuration.`)) return;
    mutate({ input: { type: 'agent.delete', userId: workspace.userId, agentId: agent.id }, onSuccess() { toast.success('Agent deleted'); if (form.id === agent.id) reset(); void agentsQuery.refetch(); }, onError(error) { toast.error(error.message); } });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Custom agents</h2>
          <Tooltip delayDuration={200}><TooltipTrigger asChild><button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Custom agents help"><CircleHelp className="size-4" /></button></TooltipTrigger><TooltipContent side="top" className="max-w-md">Build reusable agents with instructions, model routing, MCP permissions, triggers, budgets, versions, and lifecycle. API keys are never stored here.</TooltipContent></Tooltip>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Create a safe, versioned configuration for each reusable assistant.</p>
        <Separator className="mt-3" />
      </div>

      {!canManage ? <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">Only workspace owners and admins can create or edit agents.</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between"><h3 className="font-medium">{form.id ? 'Edit agent' : 'New agent'}</h3>{form.id ? <Button type="button" variant="ghost" size="sm" onClick={reset}> <Plus className="size-4" /> New</Button> : null}</div>
          <div className="space-y-2"><SettingLabel htmlFor="agent-name" help="A short name people will recognize in the agent picker.">Name</SettingLabel><Input id="agent-name" value={form.name} onChange={(event) => set('name', event.target.value)} disabled={!canManage || isPending} placeholder="Research assistant" /></div>
          <div className="space-y-2"><SettingLabel htmlFor="agent-description" help="Optional context shown beside the agent name.">Description</SettingLabel><Input id="agent-description" value={form.description} onChange={(event) => set('description', event.target.value)} disabled={!canManage || isPending} placeholder="Finds and summarizes workspace knowledge" /></div>
          <div className="space-y-2"><SettingLabel htmlFor="agent-instructions" help="The agent's behavior and boundaries. Do not paste API keys here.">Instructions</SettingLabel><Textarea id="agent-instructions" value={form.instructions} onChange={(event) => set('instructions', event.target.value)} disabled={!canManage || isPending} rows={7} placeholder="You are a careful research assistant..." /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><SettingLabel htmlFor="agent-lifecycle" help="Draft is safe to configure; Active makes the agent available; Paused disables it without deleting it.">Lifecycle</SettingLabel><select id="agent-lifecycle" className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.lifecycle} onChange={(event) => set('lifecycle', event.target.value as AgentLifecycle)} disabled={!canManage || isPending}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></div><div className="space-y-2"><Label>Version</Label><div className="flex h-9 items-center rounded-md border px-3 text-sm text-muted-foreground">{form.id ? `${agents.find((agent) => agent.id === form.id)?.version ?? 1} (increments on save)` : '1 on create'}</div></div></div>
        </div>

        <div className="space-y-4 rounded-md border p-4">
          <h3 className="font-medium">Model and controls</h3>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><SettingLabel htmlFor="agent-provider" help="Choose where this agent runs. Cloud credentials stay in the encrypted vault.">Provider</SettingLabel><select id="agent-provider" className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.provider} onChange={(event) => set('provider', event.target.value as AgentProvider)} disabled={!canManage || isPending}><option value="ollama">Ollama (local)</option><option value="lmstudio">LM Studio (local)</option><option value="openai">OpenAI</option><option value="google">Google Gemini</option></select></div><div className="space-y-2"><SettingLabel htmlFor="agent-model" help="The model name served by the selected provider, such as qwen3:4b or gpt-4o-mini.">Model</SettingLabel><Input id="agent-model" value={form.model} onChange={(event) => set('model', event.target.value)} disabled={!canManage || isPending} /></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><SettingLabel htmlFor="agent-temperature" help="Lower is more precise; higher is more creative. Use 0.2–0.7 for reliable work.">Temperature</SettingLabel><Input id="agent-temperature" type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => set('temperature', event.target.value)} disabled={!canManage || isPending} /></div><div className="space-y-2"><SettingLabel htmlFor="agent-max-output" help="Optional response-length cap. Leave blank for the provider default.">Max output tokens</SettingLabel><Input id="agent-max-output" type="number" min="1" step="1" value={form.maxOutputTokens} onChange={(event) => set('maxOutputTokens', event.target.value)} disabled={!canManage || isPending} placeholder="Provider default" /></div></div>
          <div className="space-y-2"><SettingLabel htmlFor="agent-tools" help="One MCP tool name per line or comma-separated. Leave empty to allow no MCP tools by default.">MCP tool allowlist</SettingLabel><Textarea id="agent-tools" value={form.mcpToolAllowlist} onChange={(event) => set('mcpToolAllowlist', event.target.value)} disabled={!canManage || isPending} rows={3} placeholder="colanode_get_node" /></div>
          <div className="space-y-2"><SettingLabel htmlFor="agent-permissions" help="Simple permission labels such as workspace:read, content:write, or mcp:execute. MCP execution still follows per-tool approval policies.">Permissions</SettingLabel><Input id="agent-permissions" value={form.permissions} onChange={(event) => set('permissions', event.target.value)} disabled={!canManage || isPending} /></div>
          <div className="space-y-2"><SettingLabel htmlFor="agent-triggers" help="Use manual, schedule:..., webhook:..., or another trigger label. Triggers are stored for the future runner and do not execute automatically yet.">Triggers</SettingLabel><Textarea id="agent-triggers" value={form.triggers} onChange={(event) => set('triggers', event.target.value)} disabled={!canManage || isPending} rows={2} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><SettingLabel htmlFor="agent-spend" help="Optional hard estimated-dollar ceiling per UTC month.">Monthly spend limit</SettingLabel><Input id="agent-spend" type="number" min="0" step="0.01" value={form.monthlySpendUsd} onChange={(event) => set('monthlySpendUsd', event.target.value)} disabled={!canManage || isPending} placeholder="No limit" /></div><div className="space-y-2"><SettingLabel htmlFor="agent-tokens" help="Optional hard token ceiling per UTC month.">Monthly token limit</SettingLabel><Input id="agent-tokens" type="number" min="0" step="1" value={form.monthlyTokens} onChange={(event) => set('monthlyTokens', event.target.value)} disabled={!canManage || isPending} placeholder="No limit" /></div></div>
          <div className="flex gap-2"><Button type="button" onClick={save} disabled={!canManage || isPending}><Save className="size-4" />{isPending ? 'Saving…' : form.id ? 'Save changes' : 'Create agent'}</Button>{form.id ? <Button type="button" variant="outline" onClick={reset} disabled={isPending}>Cancel</Button> : null}</div>
        </div>
      </div>

      <div className="space-y-3"><h3 className="font-medium">Saved agents</h3>{agents.length ? agents.map((agent) => <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{agent.name}</span><Badge variant="secondary">{agent.lifecycle}</Badge><Badge variant="outline">v{agent.version}</Badge><span className="text-xs text-muted-foreground">{agent.model.provider} · {agent.model.model}</span></div><p className="mt-1 truncate text-sm text-muted-foreground">{agent.description || agent.instructions}</p></div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setForm(formFromAgent(agent))} disabled={!canManage || isPending}><Pencil className="size-3.5" /> Edit</Button><Button type="button" variant="ghost" size="sm" onClick={() => deleteAgent(agent)} disabled={!canManage || isPending} aria-label={`Delete ${agent.name}`}><Trash2 className="size-3.5" /></Button></div></div>) : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No custom agents yet. Start with a Draft agent and activate it when the instructions and permissions are ready.</p>}</div>
    </div>
  );
};
