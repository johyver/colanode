# P2-01 — Editor and sidebar parity acceptance matrix

Date: 2026-11-12. Scope: **synthetic fixtures only** on Mac development branch.
This is Notion-inspired behavior, not a promise of pixel-identical Notion UI.

| Requirement                          | Baseline source evidence                                                                                                         | Current change and status                                                                                     | Acceptance still needed                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Three-level nested pages and sidebar | `page-sidebar-item.tsx` recursively renders children with `SidebarItem`; `page`/`database`/`folder` node types                   | Collapsible button is now independent of navigation link, keyboard focused, aria-labeled. Source review only. | Create 3-level synthetic hierarchy; expand/collapse using keyboard, select/reload nested items, capture desktop/mobile screenshots. |
| Rich text blocks                     | `document-editor.tsx` registers paragraphs, H1–H3, bullets, numbered lists, task lists, tables, quote, code, file, page, divider | Existing foundation, **not** visually re-QA'd                                                                 | Verify at least 10 synthetic block types survive reload and sync; screenshot each grouped fixture.                                  |
| Slash commands                       | `CommanderExtension` and 16 block command source modules                                                                         | Existing foundation, **not** end-to-end tested                                                                | Use slash commands via keyboard and select/cancel each major option.                                                                |
| Block drag/reorder                   | `ActionMenu` drag handle and Tiptap drag/dropcursor extensions                                                                   | Existing source evidence only                                                                                 | Reorder nested blocks, reload, compare block ID and order, verify no duplicate or missing blocks.                                   |
| Icons and covers                     | Avatar/page update controls present                                                                                              | Icon edit source found; cover UX **unverified**                                                               | Verify page icon and cover upload/edit/clear/persist across reload and mobile.                                                      |
| Light/dark themes                    | Dark class styling and sidebar settings present                                                                                  | Source review only                                                                                            | Test theme switching and contrast, keyboard focus across both themes.                                                               |
| Undo/redo safety                     | Yjs `UndoManager` previously captured rapid changes together and permitted invalid `{}` from new-doc undo                        | `captureTimeout: 0` and optional Zod-validated rollback; 4 synthetic tests passing                            | Full editor event/persistence QA, offline reconnect and simultaneous mutation QA before real document use.                          |
| Cross-platform keyboard shortcuts    | Existing Cmd-only undo/redo handling                                                                                             | Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y helper; 3 tests passing                                           | Manual Mac and Windows browser/desktop acceptance.                                                                                  |
| Editor rollback emission             | `setContent` on undo/redo and inbound updates formerly used default `emitUpdate`                                                 | Uses `emitUpdate:false` to avoid creating an unnecessary second save                                          | Integration test with live local editor and persistent synthetic document.                                                          |

## Testing and safety evidence

- Failing pinned baseline reproduced: hydrated `a → ab → abc`, first undo incorrectly `a`; new doc undo `{}` (P2-01A).
- Local synthetic regression tests: 8 passing in `packages/crdt/test/undo-regression.test.ts` and `packages/ui/test/document-history-shortcuts.test.ts`.
- No real Notion content or production workspace was opened, imported or modified.
- New Mac feature worktree `~/Projects/colanode-p2-01-editor` is isolated from pinned `main` and existing DEV source edits.
- `npm ci` in this worktree did not finish; local focused tests used the original checkout's already-installed dependencies through a temporary, untracked symlink. Final CI in GitHub must provide an independent clean-environment result before merge.

## Release gates

- P2-01A CRDT correction requires approval-grade two-client/offline integration, not just this unit-test subset.
- Complete screenshot checklist and keyboard/mobile/drag tests before marking P2-01 Done.
- No real Notion migration, source-of-truth change, or private production cutover.
