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
vi.mock('@colanode/ui/components/nodes/node-delete-dialog', () => ({
  NodeDeleteDialog: ({
    open,
    id,
    onOpenChange,
  }: {
    open: boolean;
    id: string;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="alertdialog" aria-label={`Confirm deleting ${id}`}>
        <button onClick={() => onOpenChange(false)}>Cancel deletion</button>
      </div>
    ) : null,
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

describe('embedded nested page icon actions', () => {
  it('opens the existing page edit dialog without navigating away', () => {
    render(<PageNodeView {...nodeProps} />);
    const button = screen.getByRole('button', { name: 'Edit Untitled' });
    fireEvent.click(button);
    expect(
      screen.getByRole('dialog', { name: 'Rename nested page' })
    ).toBeTruthy();
    expect(testState.navigationClicks).toBe(0);
  });

  it('hides edit and delete controls for users without an editor role', () => {
    testState.role = 'viewer';
    render(<PageNodeView {...nodeProps} />);
    expect(screen.queryByRole('button', { name: /edit|delete/i })).toBeNull();
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('shows compact icon-only Edit and Delete actions with accessible labels', () => {
    render(<PageNodeView {...nodeProps} />);
    const edit = screen.getByRole('button', { name: 'Edit Untitled' });
    const remove = screen.getByRole('button', { name: 'Delete Untitled' });
    expect(edit.textContent?.trim()).toBe('');
    expect(remove.textContent?.trim()).toBe('');
    expect(edit.getAttribute('title')).toBe('Edit Untitled');
    expect(remove.getAttribute('title')).toBe('Delete Untitled');
  });

  it('opens a separate delete confirmation and never navigates on icon click', () => {
    render(<PageNodeView {...nodeProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Untitled' }));
    expect(
      screen.getByRole('alertdialog', {
        name: 'Confirm deleting synthetic-page',
      })
    ).toBeTruthy();
    expect(testState.navigationClicks).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('uses the current page title in the label', () => {
    testState.name = 'Grandchild Page';
    render(<PageNodeView {...nodeProps} />);
    expect(
      screen.getByRole('button', { name: 'Edit Grandchild Page' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Delete Grandchild Page' })
    ).toBeTruthy();
  });
});
