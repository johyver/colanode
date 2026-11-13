import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { parseApiError } from '@colanode/client/lib/ky';
import { MutationHandler } from '@colanode/client/lib/types';
import { MutationError, MutationErrorCode } from '@colanode/client/mutations';
import { AgentUpsertMutationInput } from '@colanode/client/mutations/workspaces/agent-upsert';
import { Agent } from '@colanode/client/types/agents';

export class AgentUpsertMutationHandler extends WorkspaceMutationHandlerBase implements MutationHandler<AgentUpsertMutationInput> {
  public async handleMutation(input: AgentUpsertMutationInput): Promise<Agent> {
    const workspace = this.getWorkspace(input.userId);
    try {
      return await workspace.account.client
        .post(`v1/workspaces/${workspace.workspaceId}/agents`, { json: {
          ...(input.id ? { id: input.id } : {}),
          name: input.name,
          description: input.description,
          instructions: input.instructions,
          model: input.model,
          mcpToolAllowlist: input.mcpToolAllowlist,
          permissions: input.permissions,
          triggers: input.triggers,
          budget: input.budget,
          lifecycle: input.lifecycle,
        }})
        .json<Agent>();
    } catch (error) {
      const apiError = await parseApiError(error);
      throw new MutationError(MutationErrorCode.ApiError, apiError.message);
    }
  }
}
