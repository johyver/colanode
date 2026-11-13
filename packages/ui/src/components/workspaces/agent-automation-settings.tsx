import { CircleHelp, Play, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AgentAutomationMutationInput } from '@colanode/client/mutations/workspaces/agent-automation';
import type { AgentAutomationQueryInput } from '@colanode/client/queries/workspaces/agent-automation';
import { Button } from '@colanode/ui/components/ui/button';
import { Separator } from '@colanode/ui/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@colanode/ui/components/ui/tooltip';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

export const AgentAutomationSettings = () => {
  const workspace = useWorkspace();
  const agentsQuery = useQuery({ type: 'agents.get', userId: workspace.userId });
  const automationQuery = useQuery<AgentAutomationQueryInput>({ type: 'agent-automation.get', userId: workspace.userId }, { refetchInterval: 3000 });
  const { mutate, isPending } = useMutation();
  const activeAgents = (agentsQuery.data?.agents ?? []).filter((agent) => agent.lifecycle === 'active');
  const [agentId, setAgentId] = useState('');
  const [triggerName, setTriggerName] = useState('Blog review trigger');
  const [triggerKind, setTriggerKind] = useState<'manual' | 'schedule' | 'database' | 'webhook'>('manual');
  const [delegationTarget, setDelegationTarget] = useState('');
  const [pilotId, setPilotId] = useState('');

  useEffect(() => {
    if (!agentId && activeAgents[0]) setAgentId(activeAgents[0].id);
    if (!delegationTarget && activeAgents[1]) setDelegationTarget(activeAgents[1].id);
  }, [agentId, delegationTarget, activeAgents]);

  const action = (value: AgentAutomationMutationInput['action']) => mutate({
    input: { type: 'agent-automation.action', userId: workspace.userId, action: value },
    onSuccess() { void automationQuery.refetch(); toast.success('Automation updated'); },
    onError(error) { toast.error(error.message); },
  });

  const createPilot = () => action({ kind: 'pilot-create', title: 'Nonproduction Blogging Team pilot' });
  const runPilot = () => {
    const chosen = pilotId || automationQuery.data?.pilots[0]?.id;
    if (!chosen || !agentId) { toast.error('Create a pilot and choose an Active agent first.'); return; }
    action({ kind: 'pilot-run', pilotId: chosen, agentIds: { author: agentId, research: agentId, content: agentId, textmetrics: agentId, review: agentId } });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2"><h2 className="text-2xl font-semibold tracking-tight">Agent automation</h2><Tooltip delayDuration={200}><TooltipTrigger asChild><button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Agent automation help"><CircleHelp className="size-4" /></button></TooltipTrigger><TooltipContent side="top" className="max-w-md">Triggers are deduplicated by event key. Webhooks require an HMAC signature. Delegation cannot grant permissions the parent or child agent does not already have. Blogging pilots always stop before production publication.</TooltipContent></Tooltip></div>
        <p className="mt-1 text-sm text-muted-foreground">Schedules, database events, signed webhooks, handoffs, approvals, and the safe blogging pilot.</p>
        <Separator className="mt-3" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-md border p-4">
          <h3 className="font-medium">Triggers</h3>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Choose an Active agent</option>{activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
          <input className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={triggerName} onChange={(event) => setTriggerName(event.target.value)} aria-label="Trigger name" />
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={triggerKind} onChange={(event) => setTriggerKind(event.target.value as typeof triggerKind)} aria-label="Trigger type"><option value="manual">Manual</option><option value="schedule">Schedule</option><option value="database">Database change</option><option value="webhook">Signed webhook</option></select>
          <Button type="button" disabled={isPending || !agentId} onClick={() => action({ kind: 'trigger-create', agentId, name: triggerName, triggerKind, config: { dryRun: true, intervalSeconds: 60, events: ['node.updated'], taskTemplate: 'Handle event {{eventType}} for {{nodeId}}' } })}><Plus className="size-4" />Add trigger</Button>
          <div className="space-y-2 text-sm">{automationQuery.data?.triggers.map((trigger) => <div key={trigger.id} className="flex items-center justify-between gap-2 rounded border p-2"><span>{trigger.name} · {trigger.kind} · {trigger.enabled ? 'enabled' : 'disabled'}</span><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => action({ kind: 'trigger-toggle', triggerId: trigger.id, enabled: !trigger.enabled })}>{trigger.enabled ? 'Disable' : 'Enable'}</Button><Button type="button" size="sm" variant="ghost" disabled={!trigger.enabled} onClick={() => action({ kind: 'trigger-fire', triggerId: trigger.id, payload: { source: 'settings' } })}><Play className="size-3.5" />Fire</Button></div></div>)}</div>
        </div>
        <div className="space-y-3 rounded-md border p-4">
          <h3 className="font-medium">Delegation approvals</h3>
          <p className="text-xs text-muted-foreground">Handoffs default to waiting for a human decision and cannot elevate permissions.</p>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={delegationTarget} onChange={(event) => setDelegationTarget(event.target.value)} aria-label="Delegation target"><option value="">Choose child agent</option>{activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
          <Button type="button" disabled={isPending || !agentId || !delegationTarget || agentId === delegationTarget} onClick={() => action({ kind: 'delegation-propose', parentAgentId: agentId, childAgentId: delegationTarget, context: { source: 'settings' }, requestedPermissions: [], requiresApproval: true })}><ShieldCheck className="size-4" />Request handoff</Button>
          <div className="space-y-2 text-sm">{automationQuery.data?.delegations.map((delegation) => <div key={delegation.id} className="rounded border p-2"><div>{delegation.status} · {delegation.parent_agent_id} → {delegation.child_agent_id}</div>{delegation.status === 'waiting' ? <div className="mt-2 flex gap-2"><Button type="button" size="sm" onClick={() => action({ kind: 'delegation-decide', delegationId: delegation.id, decision: 'approved' })}>Approve</Button><Button type="button" size="sm" variant="outline" onClick={() => action({ kind: 'delegation-decide', delegationId: delegation.id, decision: 'rejected' })}>Reject</Button></div> : null}</div>)}</div>
        </div>
      </div>
      <div className="space-y-3 rounded-md border p-4">
        <div className="flex items-center justify-between"><div><h3 className="font-medium">Nonproduction Blogging Team pilot</h3><p className="text-xs text-muted-foreground">Author → research → content → Textmetrics loop → review. Publication is always blocked.</p></div><div className="flex gap-2"><Button type="button" disabled={isPending} onClick={createPilot}><Plus className="size-4" />Create pilot</Button><Button type="button" variant="outline" disabled={isPending} onClick={runPilot}><Play className="size-4" />Run stages</Button></div></div>
        <div className="space-y-2 text-sm">{automationQuery.data?.pilots.map((pilot) => <div key={pilot.id} className={'rounded border p-2 ' + (pilot.id === pilotId ? 'border-primary' : '')}><button type="button" className="block w-full text-left" onClick={() => setPilotId(pilot.id)}><div className="flex justify-between"><span>{pilot.title}</span><span className="text-xs uppercase text-muted-foreground">{pilot.stage} · publication blocked</span></div><p className="mt-1 text-xs text-muted-foreground">{pilot.steps.length} logged stages{pilot.reviewDecision ? ' · ' + pilot.reviewDecision : ''}</p></button>{pilot.stage === 'review' && !pilot.reviewDecision ? <div className="mt-2 flex gap-2"><Button type="button" size="sm" onClick={() => action({ kind: 'pilot-review', pilotId: pilot.id, decision: 'approved' })}>Approve review</Button><Button type="button" size="sm" variant="outline" onClick={() => action({ kind: 'pilot-review', pilotId: pilot.id, decision: 'rejected' })}>Request changes</Button></div> : null}</div>)}</div>
      </div>
    </div>
  );
};
