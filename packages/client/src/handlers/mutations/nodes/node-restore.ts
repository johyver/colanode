import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  NodeRestoreMutationInput,
  NodeRestoreMutationOutput,
} from '@colanode/client/mutations/nodes/node-restore';

export class NodeRestoreMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<NodeRestoreMutationInput>
{
  async handleMutation(
    input: NodeRestoreMutationInput
  ): Promise<NodeRestoreMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    await workspace.nodes.restoreNode(input.nodeId);
    return { success: true };
  }
}
