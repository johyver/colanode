import { describe, expect, it, vi } from 'vitest';

import { MutationsSyncJobHandler } from '../src/jobs/mutations-sync';
import { MutationService } from '../src/services/workspaces/mutation-service';

type StubSyncMethods = {
  sendMutations: () => Promise<boolean>;
  revertInvalidMutations: () => Promise<void>;
};

const createWorkspace = (pending: boolean) => {
  const executeTakeFirst = vi
    .fn()
    .mockResolvedValue(pending ? { id: 'pending-local-mutation' } : undefined);
  const database = {
    selectFrom: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({ executeTakeFirst })),
      })),
    })),
  };

  const workspace = {
    userId: 'synthetic-user',
    accountId: 'synthetic-account',
    database,
  };
  const service = new MutationService(
    workspace as unknown as ConstructorParameters<typeof MutationService>[0]
  );
  const methods = service as unknown as StubSyncMethods;
  vi.spyOn(methods, 'sendMutations').mockResolvedValue(false);
  vi.spyOn(methods, 'revertInvalidMutations').mockResolvedValue(undefined);

  return { service, workspace, methods, executeTakeFirst };
};

describe('offline mutation sync must not silently acknowledge unsent edits', () => {
  it('returns false when a transport failure leaves a pending local mutation', async () => {
    const { service, methods, executeTakeFirst } = createWorkspace(true);

    expect(await service.sync()).toBe(false);
    expect(methods.sendMutations).toHaveBeenCalledOnce();
    expect(executeTakeFirst).toHaveBeenCalledOnce();
  });

  it('returns true when no pending edits remain', async () => {
    const { service, executeTakeFirst } = createWorkspace(false);

    expect(await service.sync()).toBe(true);
    expect(executeTakeFirst).toHaveBeenCalledOnce();
  });

  it('treats exceptions as retryable, not successful sync', async () => {
    const { service, methods } = createWorkspace(true);
    vi.mocked(methods.sendMutations).mockRejectedValueOnce(
      new Error('Browser is offline')
    );

    expect(await service.sync()).toBe(false);
  });

  it('retries the durable sync job while pending edits remain', async () => {
    const { service } = createWorkspace(true);
    const account = { server: { isAvailable: true } };
    const app = {
      getWorkspace: vi.fn(() => ({
        accountId: 'synthetic-account',
        mutations: service,
      })),
      getAccount: vi.fn(() => account),
    };
    const handler = new MutationsSyncJobHandler(
      app as unknown as ConstructorParameters<typeof MutationsSyncJobHandler>[0]
    );

    expect(
      await handler.handleJob({
        type: 'mutations.sync',
        userId: 'synthetic-user',
      })
    ).toEqual({
      type: 'retry',
      delay: 5000,
    });
  });

  it('acknowledges the sync job once pending mutations are gone', async () => {
    const { service } = createWorkspace(false);
    const app = {
      getWorkspace: vi.fn(() => ({
        accountId: 'synthetic-account',
        mutations: service,
      })),
      getAccount: vi.fn(() => ({ server: { isAvailable: true } })),
    };
    const handler = new MutationsSyncJobHandler(
      app as unknown as ConstructorParameters<typeof MutationsSyncJobHandler>[0]
    );

    expect(
      await handler.handleJob({
        type: 'mutations.sync',
        userId: 'synthetic-user',
      })
    ).toEqual({
      type: 'success',
    });
  });

  it('continues retrying when the server has already been marked unavailable', async () => {
    const app = {
      getWorkspace: vi.fn(() => ({ accountId: 'synthetic-account' })),
      getAccount: vi.fn(() => ({ server: { isAvailable: false } })),
    };
    const handler = new MutationsSyncJobHandler(
      app as unknown as ConstructorParameters<typeof MutationsSyncJobHandler>[0]
    );
    expect(
      await handler.handleJob({
        type: 'mutations.sync',
        userId: 'synthetic-user',
      })
    ).toEqual({
      type: 'retry',
      delay: 5000,
    });
  });
});
