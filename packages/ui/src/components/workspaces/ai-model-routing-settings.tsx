import { CircleHelp } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { AiProvider } from '@colanode/client/types';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';

const SettingLabel = ({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: ReactNode;
  help: string;
}) => (
  <div className="flex items-center gap-1">
    <Label htmlFor={htmlFor}>{children}</Label>
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Help for ${children}`}
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {help}
      </TooltipContent>
    </Tooltip>
  </div>
);

const SettingHelp = ({ children }: { children: ReactNode }) => (
  <Tooltip delayDuration={200}>
    <TooltipTrigger asChild>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        aria-label="Show help"
      >
        <CircleHelp className="size-4" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs">
      {children}
    </TooltipContent>
  </Tooltip>
);

const suggestedCloudModels: Partial<Record<AiProvider, string[]>> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
};

export const AiModelRoutingSettings = () => {
  const workspace = useWorkspace();
  const settingsQuery = useQuery({
    type: 'ai.settings.get',
    userId: workspace.userId,
  });
  const localModelsQuery = useQuery({
    type: 'ai.localModels.get',
    userId: workspace.userId,
  });
  const credentialsQuery = useQuery({
    type: 'ai.credentials.get',
    userId: workspace.userId,
  });
  const { mutate, isPending } = useMutation();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('0.5');
  const [maxOutputTokens, setMaxOutputTokens] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agentProvider, setAgentProvider] = useState<AiProvider>('openai');
  const [agentModel, setAgentModel] = useState('');
  const [agentTemperature, setAgentTemperature] = useState('0.5');
  const [agentMaxOutputTokens, setAgentMaxOutputTokens] = useState('');
  const [agentMonthlySpend, setAgentMonthlySpend] = useState('');
  const [agentMonthlyTokens, setAgentMonthlyTokens] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [allowCloudFallback, setAllowCloudFallback] = useState(false);
  const [fallbackProvider, setFallbackProvider] = useState<'openai' | 'google'>('openai');
  const [fallbackModel, setFallbackModel] = useState('');
  const [monthlySpend, setMonthlySpend] = useState('');
  const [monthlyTokens, setMonthlyTokens] = useState('');
  const [openAiLabel, setOpenAiLabel] = useState('OpenAI API key');
  const [openAiKey, setOpenAiKey] = useState('');
  const [googleLabel, setGoogleLabel] = useState('Google/Gemini API key');
  const [googleKey, setGoogleKey] = useState('');

  const canManageAgents = workspace.role === 'owner' || workspace.role === 'admin';
  const openAiCredential = credentialsQuery.data?.credentials.find(
    (credential) => credential.provider === 'openai' && !credential.revokedAt
  );
  const googleCredential = credentialsQuery.data?.credentials.find(
    (credential) => credential.provider === 'google' && !credential.revokedAt
  );

  const getLocalModels = (selectedProvider: AiProvider) =>
    localModelsQuery.data?.providers.find(
      (localProvider) => localProvider.provider === selectedProvider
    )?.models ?? [];

  useEffect(() => {
    const settings = settingsQuery.data?.user;
    setProvider(settings?.provider ?? 'openai');
    setModel(settings?.model ?? '');
    setTemperature(String(settings?.temperature ?? 0.5));
    setMaxOutputTokens(
      settings?.maxOutputTokens ? String(settings.maxOutputTokens) : ''
    );
  }, [settingsQuery.data?.user]);

  useEffect(() => {
    const settings = agentId ? settingsQuery.data?.agents[agentId] : undefined;
    setAgentProvider(settings?.provider ?? 'openai');
    setAgentModel(settings?.model ?? '');
    setAgentTemperature(String(settings?.temperature ?? 0.5));
    setAgentMaxOutputTokens(
      settings?.maxOutputTokens ? String(settings.maxOutputTokens) : ''
    );
    setAgentMonthlySpend(
      settings?.budget?.monthlySpendUsd != null
        ? String(settings.budget.monthlySpendUsd)
        : ''
    );
    setAgentMonthlyTokens(
      settings?.budget?.monthlyTokens != null
        ? String(settings.budget.monthlyTokens)
        : ''
    );
  }, [agentId, settingsQuery.data?.agents]);

  useEffect(() => {
    const policy = settingsQuery.data?.policy;
    setLocalOnly(policy?.localOnly ?? false);
    setAllowCloudFallback(policy?.allowCloudFallback ?? false);
    setFallbackProvider(policy?.fallbackProvider ?? 'openai');
    setFallbackModel(policy?.fallbackModel ?? '');
    setMonthlySpend(
      policy?.monthlySpendUsd != null ? String(policy.monthlySpendUsd) : ''
    );
    setMonthlyTokens(
      policy?.monthlyTokens != null ? String(policy.monthlyTokens) : ''
    );
  }, [settingsQuery.data?.policy]);

  const toSettings = (
    selectedProvider: AiProvider,
    selectedModel: string,
    selectedTemperature: string,
    selectedMaxOutputTokens: string,
    selectedMonthlySpend = '',
    selectedMonthlyTokens = ''
  ) => ({
    provider: selectedProvider,
    ...(selectedModel.trim() ? { model: selectedModel.trim() } : {}),
    temperature: Number(selectedTemperature),
    ...(selectedMaxOutputTokens.trim()
      ? { maxOutputTokens: Number(selectedMaxOutputTokens) }
      : {}),
    ...(selectedMonthlySpend.trim() || selectedMonthlyTokens.trim()
      ? {
          budget: {
            monthlySpendUsd: selectedMonthlySpend.trim()
              ? Number(selectedMonthlySpend)
              : null,
            monthlyTokens: selectedMonthlyTokens.trim()
              ? Number(selectedMonthlyTokens)
              : null,
          },
        }
      : {}),
  });

  const saveUserSettings = () => {
    if (!Number.isFinite(Number(temperature)) || Number(temperature) < 0 || Number(temperature) > 2) {
      toast.error('Temperature must be between 0 and 2.');
      return;
    }

    mutate({
      input: {
        type: 'ai.settings.update',
        userId: workspace.userId,
        user: toSettings(provider, model, temperature, maxOutputTokens),
      },
      onSuccess() {
        toast.success('AI user settings saved');
        void settingsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const saveAgentSettings = () => {
    if (!agentId.trim()) {
      toast.error('Enter an agent ID first.');
      return;
    }
    if (!Number.isFinite(Number(agentTemperature)) || Number(agentTemperature) < 0 || Number(agentTemperature) > 2) {
      toast.error('Agent temperature must be between 0 and 2.');
      return;
    }

    mutate({
      input: {
        type: 'ai.settings.update',
        userId: workspace.userId,
        agentId: agentId.trim(),
        agentSettings: toSettings(
          agentProvider,
          agentModel,
          agentTemperature,
          agentMaxOutputTokens,
          agentMonthlySpend,
          agentMonthlyTokens
        ),
      },
      onSuccess() {
        toast.success('AI agent settings saved');
        void settingsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const savePolicy = () => {
    const spend = monthlySpend.trim() ? Number(monthlySpend) : null;
    const tokens = monthlyTokens.trim() ? Number(monthlyTokens) : null;
    if (spend !== null && (!Number.isFinite(spend) || spend < 0)) {
      toast.error('Monthly spend must be a non-negative number.');
      return;
    }
    if (tokens !== null && (!Number.isInteger(tokens) || tokens < 0)) {
      toast.error('Monthly tokens must be a non-negative whole number.');
      return;
    }

    mutate({
      input: {
        type: 'ai.settings.update',
        userId: workspace.userId,
        policy: {
          localOnly,
          allowCloudFallback: localOnly ? false : allowCloudFallback,
          fallbackProvider: allowCloudFallback && !localOnly ? fallbackProvider : null,
          fallbackModel: allowCloudFallback && !localOnly && fallbackModel.trim()
            ? fallbackModel.trim()
            : null,
          monthlySpendUsd: spend,
          monthlyTokens: tokens,
        },
      },
      onSuccess() {
        toast.success('AI privacy and budget controls saved');
        void settingsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const runLiveTest = () => {
    setTestResult(null);
    mutate({
      input: { type: 'ai.gateway.test', userId: workspace.userId },
      onSuccess(output) {
        setTestResult(
          `${output.provider}/${output.model}: text, streaming (${output.streamedChunks} chunks), tool calls (${output.toolCallCount}), and vision passed.`
        );
      },
      onError(error) {
        setTestResult(`Live provider test failed: ${error.message}`);
      },
    });
  };

  const saveOpenAiCredential = () => {
    if (!openAiKey.trim()) {
      toast.error('Paste an OpenAI API key first.');
      return;
    }

    mutate({
      input: {
        type: 'ai.credential.upsert',
        userId: workspace.userId,
        provider: 'openai',
        label: openAiLabel.trim() || 'OpenAI API key',
        apiKey: openAiKey.trim(),
      },
      onSuccess() {
        setOpenAiKey('');
        toast.success('OpenAI key saved securely');
        void credentialsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const revokeOpenAiCredential = () => {
    mutate({
      input: {
        type: 'ai.credential.revoke',
        userId: workspace.userId,
        provider: 'openai',
      },
      onSuccess(output) {
        toast.success(output.revoked ? 'OpenAI key revoked' : 'No active OpenAI key found');
        void credentialsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const saveGoogleCredential = () => {
    if (!googleKey.trim()) {
      toast.error('Paste a Google/Gemini API key first.');
      return;
    }

    mutate({
      input: {
        type: 'ai.credential.upsert',
        userId: workspace.userId,
        provider: 'google',
        label: googleLabel.trim() || 'Google/Gemini API key',
        apiKey: googleKey.trim(),
      },
      onSuccess() {
        setGoogleKey('');
        toast.success('Google/Gemini key saved securely');
        void credentialsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const revokeGoogleCredential = () => {
    mutate({
      input: {
        type: 'ai.credential.revoke',
        userId: workspace.userId,
        provider: 'google',
      },
      onSuccess(output) {
        toast.success(output.revoked ? 'Google/Gemini key revoked' : 'No active Google/Gemini key found');
        void credentialsQuery.refetch();
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const renderModelField = (
    id: string,
    selectedProvider: AiProvider,
    selectedModel: string,
    setSelectedModel: (value: string) => void,
    placeholder: string
  ) => {
    const isLocalProvider = selectedProvider === 'ollama' || selectedProvider === 'lmstudio';
    const selectableModels = isLocalProvider
      ? getLocalModels(selectedProvider)
      : suggestedCloudModels[selectedProvider] ?? [];
    const selectedValue = selectableModels.includes(selectedModel)
      ? selectedModel
      : selectedModel
        ? '__custom__'
        : '';

    if (selectableModels.length === 0) {
      return (
        <Input
          id={id}
          value={selectedModel}
          onChange={(event) => setSelectedModel(event.target.value)}
          placeholder={placeholder}
        />
      );
    }

    return (
      <>
        <select
          id={id}
          className="border-input bg-transparent h-9 rounded-md border px-3 text-sm"
          value={selectedValue}
          onChange={(event) =>
            setSelectedModel(event.target.value === '__custom__' ? '' : event.target.value)
          }
        >
          <option value="">
            {isLocalProvider ? 'Choose a discovered model' : 'Choose a common model'}
          </option>
          {selectableModels.map((availableModel) => (
            <option key={availableModel} value={availableModel}>
              {availableModel}
            </option>
          ))}
          <option value="__custom__">Type a custom model…</option>
        </select>
        {selectedValue === '__custom__' && (
          <Input
            id={`${id}-custom`}
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            placeholder={placeholder}
          />
        )}
      </>
    );
  };

  if (settingsQuery.isLoading) {
    return <Spinner className="size-5" />;
  }

  if (settingsQuery.isError) {
    return (
      <p className="text-sm text-muted-foreground">
        AI settings are unavailable: {settingsQuery.error.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">AI model routing</h2>
        <p className="text-sm text-muted-foreground">
          Choose the provider and model defaults used by the AI gateway. API keys remain server-side and are never stored here.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-1">
          <h3 className="font-medium">Your defaults</h3>
          <SettingHelp>
            These settings are the normal choice for your workspace. Start with
            Ollama and qwen3:4b for a fast local model.
          </SettingHelp>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <SettingLabel
              htmlFor="ai-provider"
              help="Choose where the AI runs. Ollama and LM Studio stay on this Mac and never fall back to paid providers."
            >
              Provider
            </SettingLabel>
            <select
              id="ai-provider"
              className="border-input bg-transparent h-9 rounded-md border px-3 text-sm"
              value={provider}
              onChange={(event) => setProvider(event.target.value as AiProvider)}
            >
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="ollama">Ollama (local)</option>
              <option value="lmstudio">LM Studio (local)</option>
            </select>
          </div>
          <div className="grid gap-2">
            <SettingLabel
              htmlFor="ai-model"
              help="For Ollama and LM Studio, choose a model discovered on this Mac. For OpenAI and Google/Gemini, choose a common model name or enter a current model ID."
            >
              Model
            </SettingLabel>
            {renderModelField('ai-model', provider, model, setModel, 'gpt-4o')}
          </div>
          <div className="grid gap-2">
            <SettingLabel
              htmlFor="ai-temperature"
              help="Controls randomness. Lower values are more consistent; higher values are more creative. Keep 0.2–0.7 for reliable work and tool calls."
            >
              Temperature
            </SettingLabel>
            <Input id="ai-temperature" type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <SettingLabel
              htmlFor="ai-max-tokens"
              help="Limits how long a response can be. Leave it blank for the provider default; higher limits can use more RAM and take longer."
            >
              Max output tokens
            </SettingLabel>
            <Input id="ai-max-tokens" type="number" min="1" step="1" value={maxOutputTokens} onChange={(event) => setMaxOutputTokens(event.target.value)} placeholder="Provider default" />
          </div>
        </div>
        <Button type="button" className="w-fit" onClick={saveUserSettings} disabled={isPending}>
          Save defaults
        </Button>
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-medium">Privacy, budgets, and fallback</h3>
            <SettingHelp>
              These controls are enforced by the server before a provider request is sent. Limits reset at the start of each UTC month. Cost is an estimate, not an invoice.
            </SettingHelp>
          </div>
          <p className="text-sm text-muted-foreground">
            Cloud fallback is off by default. Local-only mode is the strongest privacy setting and blocks OpenAI, Google, and Anthropic requests.
          </p>
        </div>
        {!canManageAgents ? (
          <p className="text-sm text-muted-foreground">Only workspace owners and admins can change workspace-wide controls.</p>
        ) : (
          <>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={localOnly}
                onChange={(event) => {
                  setLocalOnly(event.target.checked);
                  if (event.target.checked) setAllowCloudFallback(false);
                }}
              />
              <span>
                <span className="font-medium">Keep AI local-only</span>
                <span className="block text-muted-foreground">Only Ollama and LM Studio may run. No request is sent to an external provider.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={allowCloudFallback && !localOnly}
                disabled={localOnly}
                onChange={(event) => setAllowCloudFallback(event.target.checked)}
              />
              <span>
                <span className="font-medium">Allow cloud fallback</span>
                <span className="block text-muted-foreground">If a local provider fails, the selected cloud provider may be tried. This remains disabled unless you turn it on.</span>
              </span>
            </label>
            {allowCloudFallback && !localOnly && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <SettingLabel htmlFor="ai-fallback-provider" help="The only cloud provider the server may try after a local provider failure.">
                    Fallback provider
                  </SettingLabel>
                  <select id="ai-fallback-provider" className="border-input bg-transparent h-9 rounded-md border px-3 text-sm" value={fallbackProvider} onChange={(event) => setFallbackProvider(event.target.value as 'openai' | 'google')}>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google/Gemini</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <SettingLabel htmlFor="ai-fallback-model" help="Optional model ID for fallback. Leave blank to use a safe default for the selected provider.">
                    Fallback model
                  </SettingLabel>
                  <Input id="ai-fallback-model" value={fallbackModel} onChange={(event) => setFallbackModel(event.target.value)} placeholder="Provider default" />
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <SettingLabel htmlFor="ai-monthly-spend" help="A hard estimated-dollar ceiling for the entire workspace this UTC month. Blank means no spend ceiling.">
                  Workspace monthly spend limit
                </SettingLabel>
                <Input id="ai-monthly-spend" type="number" min="0" step="0.01" value={monthlySpend} onChange={(event) => setMonthlySpend(event.target.value)} placeholder="No limit" />
              </div>
              <div className="grid gap-2">
                <SettingLabel htmlFor="ai-monthly-tokens" help="A hard token ceiling for the entire workspace this UTC month. Blank means no token ceiling.">
                  Workspace monthly token limit
                </SettingLabel>
                <Input id="ai-monthly-tokens" type="number" min="0" step="1" value={monthlyTokens} onChange={(event) => setMonthlyTokens(event.target.value)} placeholder="No limit" />
              </div>
            </div>
            <Button type="button" className="w-fit" onClick={savePolicy} disabled={isPending}>
              Save privacy and budget controls
            </Button>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          This month: {settingsQuery.data?.usage.totalTokens.toLocaleString() ?? '0'} estimated tokens, ${settingsQuery.data?.usage.estimatedCostUsd.toFixed(4) ?? '0.0000'} estimated spend.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-medium">Per-agent override</h3>
            <SettingHelp>
              Optional: use this only when one specific agent needs a different
              provider or model. It overrides Your defaults for that agent only.
            </SettingHelp>
          </div>
          <p className="text-sm text-muted-foreground">
            Leave this section alone unless you want a special model for one
            agent. Your defaults are used for everything else.
          </p>
        </div>
        {!canManageAgents ? (
          <p className="text-sm text-muted-foreground">Only workspace owners and admins can edit agent overrides.</p>
        ) : (
          <>
            <div className="grid gap-2">
              <SettingLabel
                htmlFor="ai-agent-id"
                help="The exact ID of the agent you want to customize. Leave it blank unless you have a specific agent in mind."
              >
                Agent ID
              </SettingLabel>
              <Input id="ai-agent-id" value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="agent identifier" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-agent-provider"
                  help="Choose a provider only for this agent. Otherwise, leave this override unused and the agent will follow Your defaults."
                >
                  Provider
                </SettingLabel>
                <select
                  id="ai-agent-provider"
                  className="border-input bg-transparent h-9 rounded-md border px-3 text-sm"
                  value={agentProvider}
                  onChange={(event) => setAgentProvider(event.target.value as AiProvider)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                  <option value="ollama">Ollama (local)</option>
                  <option value="lmstudio">LM Studio (local)</option>
                </select>
              </div>
              <div className="grid gap-2">
                <SettingLabel htmlFor="ai-agent-monthly-spend" help="Optional hard estimated-dollar ceiling for this agent each UTC month. It is enforced before the provider request.">
                  Agent monthly spend limit
                </SettingLabel>
                <Input id="ai-agent-monthly-spend" type="number" min="0" step="0.01" value={agentMonthlySpend} onChange={(event) => setAgentMonthlySpend(event.target.value)} placeholder="No limit" />
              </div>
              <div className="grid gap-2">
                <SettingLabel htmlFor="ai-agent-monthly-tokens" help="Optional hard token ceiling for this agent each UTC month. It is enforced before the provider request.">
                  Agent monthly token limit
                </SettingLabel>
                <Input id="ai-agent-monthly-tokens" type="number" min="0" step="1" value={agentMonthlyTokens} onChange={(event) => setAgentMonthlyTokens(event.target.value)} placeholder="No limit" />
              </div>
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-agent-model"
                  help="Choose the model this agent should use. Local models are discovered on this Mac; OpenAI and Google/Gemini show common model names."
                >
                  Model
                </SettingLabel>
                {renderModelField(
                  'ai-agent-model',
                  agentProvider,
                  agentModel,
                  setAgentModel,
                  'gpt-4o'
                )}
              </div>
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-agent-temperature"
                  help="This agent's randomness setting. Use a lower value for precise, repeatable work and a higher value for brainstorming."
                >
                  Temperature
                </SettingLabel>
                <Input id="ai-agent-temperature" type="number" min="0" max="2" step="0.1" value={agentTemperature} onChange={(event) => setAgentTemperature(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-agent-max-tokens"
                  help="This agent's response-length limit. Leave it blank to use the provider default."
                >
                  Max output tokens
                </SettingLabel>
                <Input id="ai-agent-max-tokens" type="number" min="1" step="1" value={agentMaxOutputTokens} onChange={(event) => setAgentMaxOutputTokens(event.target.value)} placeholder="Provider default" />
              </div>
            </div>
            <Button type="button" className="w-fit" onClick={saveAgentSettings} disabled={isPending}>
              Save agent override
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-medium">OpenAI API key (BYOK)</h3>
            <SettingHelp>
              Optional: store your own OpenAI key encrypted on this server. The
              browser never receives it, and the key is never shown again after
              saving. Saving a new key rotates the previous one.
            </SettingHelp>
          </div>
          <p className="text-sm text-muted-foreground">
            Use this only if you want OpenAI requests billed to your own OpenAI account.
            Local Ollama and LM Studio requests do not need a key.
          </p>
        </div>
        {credentialsQuery.isError ? (
          <p className="text-sm text-muted-foreground">
            Secure key storage is unavailable: {credentialsQuery.error.message}
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-openai-label"
                  help="A friendly name shown in settings. It is only a label; it is not sent to OpenAI."
                >
                  Key label
                </SettingLabel>
                <Input
                  id="ai-openai-label"
                  value={openAiLabel}
                  onChange={(event) => setOpenAiLabel(event.target.value)}
                  placeholder="OpenAI API key"
                  maxLength={256}
                />
              </div>
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-openai-key"
                  help="Paste the secret value from OpenAI. It is encrypted server-side and cleared from this form after a successful save."
                >
                  API key
                </SettingLabel>
                <Input
                  id="ai-openai-key"
                  type="password"
                  autoComplete="off"
                  value={openAiKey}
                  onChange={(event) => setOpenAiKey(event.target.value)}
                  placeholder={openAiCredential ? 'Enter a new key to rotate' : 'sk-…'}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={saveOpenAiCredential} disabled={isPending || !openAiKey.trim()}>
                Save / rotate key
              </Button>
              {openAiCredential && (
                <Button type="button" variant="outline" onClick={revokeOpenAiCredential} disabled={isPending}>
                  Revoke key
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                {credentialsQuery.isLoading
                  ? 'Checking secure storage…'
                  : openAiCredential
                    ? `Configured: ${openAiCredential.label}`
                    : 'No active OpenAI key stored'}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 rounded-lg border p-4">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-medium">Google/Gemini API key</h3>
            <SettingHelp>
              Optional: store a Google/Gemini key independently from OpenAI. The
              browser never receives it, and the key is never shown again after
              saving. If no workspace key is stored, the server environment key
              remains available.
            </SettingHelp>
          </div>
          <p className="text-sm text-muted-foreground">
            Use this for Gemini models. It is stored separately from the OpenAI key.
          </p>
        </div>
        {credentialsQuery.isError ? (
          <p className="text-sm text-muted-foreground">
            Secure key storage is unavailable: {credentialsQuery.error.message}
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-google-label"
                  help="A friendly label only. It is not sent to Google."
                >
                  Key label
                </SettingLabel>
                <Input
                  id="ai-google-label"
                  value={googleLabel}
                  onChange={(event) => setGoogleLabel(event.target.value)}
                  placeholder="Google/Gemini API key"
                  maxLength={256}
                />
              </div>
              <div className="grid gap-2">
                <SettingLabel
                  htmlFor="ai-google-key"
                  help="Paste the secret value from Google AI Studio. It is encrypted server-side and cleared after a successful save."
                >
                  API key
                </SettingLabel>
                <Input
                  id="ai-google-key"
                  type="password"
                  autoComplete="off"
                  value={googleKey}
                  onChange={(event) => setGoogleKey(event.target.value)}
                  placeholder={googleCredential ? 'Enter a new key to rotate' : 'AIza…'}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={saveGoogleCredential} disabled={isPending || !googleKey.trim()}>
                Save / rotate key
              </Button>
              {googleCredential && (
                <Button type="button" variant="outline" onClick={revokeGoogleCredential} disabled={isPending}>
                  Revoke key
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                {credentialsQuery.isLoading
                  ? 'Checking secure storage…'
                  : googleCredential
                    ? `Configured: ${googleCredential.label}`
                    : 'No active Google/Gemini key stored; server environment fallback may be available'}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Live provider calls use server-side keys only. Local providers never fall back to paid providers.
        <span className="ml-1 inline-flex align-middle">
          <SettingHelp>
            The browser never receives API keys. Local requests stay on this Mac;
            cloud requests use the server configuration.
          </SettingHelp>
        </span>
      </p>
      <Button type="button" variant="outline" onClick={runLiveTest} disabled={isPending}>
        {isPending ? 'Running live checks…' : 'Run live provider checks'}
      </Button>
      {testResult && <p className="text-sm text-muted-foreground">{testResult}</p>}

      <div className="grid gap-3 rounded-lg border p-4">
        <div>
          <div className="flex items-center gap-1">
            <h3 className="font-medium">Local model discovery</h3>
            <SettingHelp>
              Checks Ollama and LM Studio on this Mac and fills the model picker
              with models they report. It does not import data or use paid fallback.
            </SettingHelp>
          </div>
          <p className="text-sm text-muted-foreground">
            Ollama and LM Studio are checked directly on this Mac. Unavailable endpoints are reported without fallback.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={() => void localModelsQuery.refetch()}
          disabled={localModelsQuery.isFetching}
        >
          {localModelsQuery.isFetching ? 'Checking local endpoints…' : 'Discover local models'}
        </Button>
        {localModelsQuery.data?.providers.map((localProvider) => (
          <div key={localProvider.provider} className="text-sm">
            <span className="font-medium">
              {localProvider.provider === 'ollama' ? 'Ollama' : 'LM Studio'}
            </span>{' '}
            {localProvider.available
              ? localProvider.models.length > 0
                ? `available: ${localProvider.models.join(', ')}`
                : 'available, but no models are loaded'
              : `unavailable: ${localProvider.error ?? 'no response'}`}
          </div>
        ))}
      </div>
    </div>
  );
};
