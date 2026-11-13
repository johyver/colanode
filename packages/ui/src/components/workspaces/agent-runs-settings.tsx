import { CircleHelp, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AgentRunActionInput } from '@colanode/client/types/agent-runs';
import { Button } from '@colanode/ui/components/ui/button';
import { Separator } from '@colanode/ui/components/ui/separator';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@colanode/ui/components/ui/tooltip';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

export const AgentRunsSettings = () => {
  const workspace = useWorkspace();
  const agentsQuery = useQuery({ type: 'agents.get', userId: workspace.userId });
  const runsQuery = useQuery({ type: 'agent-runs.get', userId: workspace.userId }, { refetchInterval: 3000 });
  const { mutate, isPending } = useMutation();
  const activeAgents = (agentsQuery.data?.agents ?? []).filter((agent) => agent.lifecycle === 'active');
  const [agentId, setAgentId] = useState('');
  const [task, setTask] = useState('Respond with a short readiness confirmation.');
  const [dryRun, setDryRun] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const historyQuery = useQuery(
    { type: 'agent-run-history.get', userId: workspace.userId, runId: selectedRunId ?? '' },
    { enabled: Boolean(selectedRunId), refetchInterval: selectedRunId ? 1500 : false }
  );

  useEffect(() => {
    if (!agentId && activeAgents[0]) setAgentId(activeAgents[0].id);
  }, [agentId, activeAgents]);

  const startRun = () => {
    if (!agentId || !task.trim()) { toast.error('Choose an Active agent and enter a task.'); return; }
    const actions: AgentRunActionInput[] = dryRun
      ? [{ kind: 'note', message: 'Durable dry-run checkpoint completed.', idempotencyKey: `settings-dry-run:${Date.now()}` }]
      : [];
    mutate({
      input: { type: 'agent-run.start', userId: workspace.userId, agentId, task: task.trim(), actions, maxSteps: 16 },
      onSuccess(run) { setSelectedRunId(run.id); void runsQuery.refetch(); toast.success('Agent run queued'); },
      onError(error) { toast.error(error.message); },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2"><h2 className="text-2xl font-semibold tracking-tight">Agent runtime</h2><Tooltip delayDuration={200}><TooltipTrigger asChild><button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Agent runtime help"><CircleHelp className="size-4" /></button></TooltipTrigger><TooltipContent side="top" className="max-w-md">Runs are saved before they enter the queue. Each checkpoint and action has an idempotency key, so recovery can reuse completed results instead of repeating external work.</TooltipContent></Tooltip></div>
        <p className="mt-1 text-sm text-muted-foreground">Start a run and inspect its durable checkpoints, errors, and recovery state.</p><Separator className="mt-3" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-md border p-4">
          <h3 className="font-medium">Start a run</h3>
          <div className="space-y-2"><label htmlFor="runtime-agent" className="text-sm font-medium">Active agent</label><select id="runtime-agent" className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={isPending}><option value="">Choose an Active agent</option>{activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.model.model}</option>)}</select></div>
          <div className="space-y-2"><label htmlFor="runtime-task" className="text-sm font-medium">Task</label><Textarea id="runtime-task" value={task} onChange={(event) => setTask(event.target.value)} disabled={isPending} rows={4} /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} disabled={isPending} className="mt-1" /><span><span className="font-medium">Durable dry run</span><span className="block text-xs text-muted-foreground">Uses a local idempotent checkpoint. Turn it off to send the task to the selected model.</span></span></label>
          <Button type="button" onClick={startRun} disabled={isPending || !activeAgents.length}><Play className="size-4" />{isPending ? 'Queueing…' : 'Start run'}</Button>
        </div>
        <div className="space-y-3 rounded-md border p-4"><div className="flex items-center justify-between"><h3 className="font-medium">Run history</h3><Button type="button" variant="ghost" size="sm" onClick={() => void runsQuery.refetch()}><RefreshCw className="size-3.5" /> Refresh</Button></div>{runsQuery.data?.runs?.length ? <div className="space-y-2">{runsQuery.data.runs.map((run) => <button type="button" key={run.id} onClick={() => setSelectedRunId(run.id)} className={`w-full rounded border p-2 text-left text-sm ${selectedRunId === run.id ? 'border-primary' : ''}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{run.agentName ?? run.agentId}</span><span className="text-xs uppercase text-muted-foreground">{run.status}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{String(run.input.task ?? '')}</p><p className="mt-1 text-[11px] text-muted-foreground">step {run.currentStep}/{run.maxSteps} · {new Date(run.createdAt).toLocaleString()}</p></button>)}</div> : <p className="text-sm text-muted-foreground">No runs yet.</p>}</div>
      </div>
      {historyQuery.data ? <div className="space-y-3 rounded-md border p-4"><div className="flex items-center justify-between"><h3 className="font-medium">Selected run details</h3><span className="text-xs uppercase text-muted-foreground">{historyQuery.data.run.status}</span></div>{historyQuery.data.run.error ? <pre className="overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive">{JSON.stringify(historyQuery.data.run.error, null, 2)}</pre> : null}<div className="space-y-2">{historyQuery.data.steps.map((step) => <div key={step.id} className="rounded border p-2 text-xs"><div className="flex justify-between"><span className="font-medium">#{step.sequence} {step.kind}</span><span className="text-muted-foreground">{step.status}</span></div>{step.result ? <pre className="mt-1 overflow-auto text-muted-foreground">{JSON.stringify(step.result, null, 2)}</pre> : null}{step.error ? <pre className="mt-1 overflow-auto text-destructive">{JSON.stringify(step.error, null, 2)}</pre> : null}</div>)}</div></div> : null}
    </div>
  );
};
