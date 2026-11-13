import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  DocumentRestoreMutationInput,
  DocumentRestoreMutationOutput,
} from '@colanode/client/mutations/documents/document-restore';

export class DocumentRestoreMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<DocumentRestoreMutationInput>
{
  async handleMutation(
    input: DocumentRestoreMutationInput
  ): Promise<DocumentRestoreMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    await workspace.documents.restoreDocumentVersion(
      input.documentId,
      input.updateId
    );
    return { success: true };
  }
}
