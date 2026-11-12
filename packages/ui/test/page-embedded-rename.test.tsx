// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  role: 'editor',
  name: 'Untitled',
  navigationClicks: 0,
}));

vi.mock('@tanstack/react-db', () => ({
  eq: vi.fn(),
  useLiveQuery: () => ({
    isLoading: false,
    data: {
      id: 'synthetic-page',
      type: 'page',
      name: testState.name,
      avatar: null,
    },
  }),
}));
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@colanode/ui/contexts/workspace', () => ({
  useWorkspace: () => ({
    userId: 'synthetic-user',
    collections: { nodes: {} },
  }),
}));
vi.mock('@colanode/ui/contexts/node', () => ({
  useNode: () => ({ role: testState.role }),
}));
vi.mock('@colanode/ui/components/avatars/avatar', () => ({
  Avatar: () => <span aria-hidden="true">Icon</span>,
}));
vi.mock('@colanode/ui/components/ui/link', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a
      href="#synthetic-page"
      onClick={(event) => {
        event.preventDefault();
        testState.navigationClicks += 1;
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock('@colanode/ui/components/pages/page-update-dialog', () => ({
  PageUpdateDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Rename nested page" /> : null,
}));

import { PageNodeView } from '../src/editor/views/page';

const nodeProps = { node: { attrs: { id: 'synthetic-page' } } } as Parameters<
  typeof PageNodeView
>[0];

beforeEach(() => {
  testState.role = 'editor';
  testState.name = 'Untitled';
  testState.navigationClicks = 0;
});
afterEach(cleanup);

describe('embedded nested page rename action', () => {
  it('opens the existing page edit dialog without navigating away', () => {
    render(<PageNodeView {...nodeProps} />);
    const button = screen.getByRole('button', { name: 'Rename Untitled' });
    fireEvent.click(button);
    expect(
      screen.getByRole('dialog', { name: 'Rename nested page' })
    ).toBeTruthy();
    expect(testState.navigationClicks).toBe(0);
  });

  it('hides editing for users without an editor role', () => {
    testState.role = 'viewer';
    render(<PageNodeView {...nodeProps} />);
    expect(screen.queryByRole('button', { name: /rename/i })).toBeNull();
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('uses the current page title in the label', () => {
    testState.name = 'Grandchild Page';
    render(<PageNodeView {...nodeProps} />);
    expect(
      screen.getByRole('button', { name: 'Rename Grandchild Page' })
    ).toBeTruthy();
  });
});
