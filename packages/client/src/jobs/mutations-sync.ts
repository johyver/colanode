import ms from 'ms';

import {
  JobHandler,
  JobOutput,
  JobConcurrencyConfig,
} from '@colanode/client/jobs';
import { AppService } from '@colanode/client/services/app-service';

export type MutationsSyncInput = {
  type: 'mutations.sync';
  userId: string;
};

declare module '@colanode/client/jobs' {
  interface JobMap {
    'mutations.sync': {
      input: MutationsSyncInput;
    };
  }
}

export class MutationsSyncJobHandler implements JobHandler<MutationsSyncInput> {
  private readonly app: AppService;

  constructor(app: AppService) {
    this.app = app;
  }

  public readonly concurrency: JobConcurrencyConfig<MutationsSyncInput> = {
    limit: 1,
    key: (input: MutationsSyncInput) => `mutations.sync.${input.userId}`,
  };

  public async handleJob(input: MutationsSyncInput): Promise<JobOutput> {
    const workspace = this.app.getWorkspace(input.userId);
    if (!workspace) {
      return {
        type: 'cancel',
      };
    }

    const account = this.app.getAccount(workspace.accountId);
    if (!account) {
      return {
        type: 'cancel',
      };
    }

    if (!workspace.mutations) {
      return {
        type: 'retry',
        delay: ms('5 seconds'),
      };
    }

    const synced = await workspace.mutations.sync();
    if (!synced) {
      // Keep the durable job in the queue until the connection recovers;
      // JobService retries this without consuming its transient error budget.
      return {
        type: 'retry',
        delay: ms('5 seconds'),
      };
    }

    return {
      type: 'success',
    };
  }
}
