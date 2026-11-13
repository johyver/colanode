# P1-03A Security remediation baseline

Audit source: GitHub Actions run [43092437542](https://github.com/johyver/colanode/actions/runs/43092437542) on draft PR #1.

- Advisory-bearing packages: 57, critical 4, high 27, moderate 23, low 3.
- Findings are advisory matches, **not** proof that each code path is exploitable.
- Required production-dependency audit is fail-closed and must stay enabled.
- Server release gates include patched Node runtime, image digest pin, regression tests and image scan.

## Critical findings

| Package | Direct dependency? | npm remediation path |
| --- | --- | --- |
| handlebars | Yes | non-major available |
| seroval | No | non-major available |
| shell-quote | No | non-major available |
| tar | No | non-major available |

## High-severity findings

| Package | Direct dependency? | npm remediation path |
| --- | --- | --- |
| @tiptap/core | Yes | non-major available |
| @xmldom/xmldom | No | non-major available |
| adm-zip | Yes | major 0.6.1 |
| brace-expansion | No | non-major available |
| browserslist | No | non-major available |
| compression | No | non-major available |
| fast-uri | No | non-major available |
| fast-xml-builder | No | non-major available |
| fastify | Yes | non-major available |
| find-my-way | No | non-major available |
| form-data | No | non-major available |
| image-size | No | non-major available |
| js-yaml | No | non-major available |
| kysely | Yes | non-major available |
| linkify-it | No | non-major available |
| markdown-it | No | non-major available |
| nanoid | No | non-major available |
| node-forge | No | non-major available |
| nodemailer | Yes | major 10.5.0 |
| postcss | No | non-major available |
| prosemirror-view | No | non-major available |
| sharp | Yes | major 0.35.5 |
| source-map-js | No | non-major available |
| svgo | Yes | non-major available |
| undici | No | non-major available |
| ws | Yes | non-major available |
| zod | Yes | non-major available |

## Security and release constraints

- Keep P1-03 draft PR #1 unmerged until all required jobs pass.
- Do not blanket-suppress package advisories, reduce audit severity, or bypass branch review.
- Retain pinned upstream baseline and reversible feature-branch history.
- Do not restart running Mac app, update production, or migrate real Notion data.
- Node Docker image index digest comes from official Docker Hub library/node endpoint.
- SemVer-major updates (adm-zip, nodemailer, sharp) require regression testing and review.

## Remediation branch and mandatory acceptance checks

- The security worktree is based on P1-03 CI PR #1, not on deployed production.
- The patched Node 22.23.4 multi-architecture Docker index digest is pinned in
  `apps/server/Dockerfile`; a built image and container vulnerability scan remain
  separate acceptance checks.
- We updated direct server/editor/desktop package requirements to security-fixed
  releases, with Tiptap extensions pinned together to published 3.31.4 because
  the extensions declare exact peer versions.
- Npm now uses narrow, explicit root overrides for `metro > image-size@2.1.0`
  and `@expo/metro-config > postcss@8.5.32`. The two fixed versions are also
  explicit root devDependencies to make their re-use auditable.
- The prior vulnerable nested lock entries were removed in favor of the patched
  hoisted versions. This is a **lockfile compatibility intervention** rather
  than normal npm behavior. The GitHub clean-install job must confirm actual
  package resolution and run the Metro regression test. Do not merge if either
  test fails. Recheck lockfile semantics when package managers are upgraded.
- Metro 0.83 expects image-size to accept filenames, while image-size v2 expects
  bytes. Existing `scripts/src/postinstall/index.ts` now applies an
  idempotent and fail-closed compatibility fix to the exact known Metro call
  site. `scripts/verify-metro-image-size.mjs` tests both buffer and filename
  image sizing on GitHub-hosted runners, using synthetic 1×1 PNG data.
- Latest **local lockfile** `npm audit --omit=dev --audit-level=high` returned
  zero critical and zero high findings (16 moderate, 1 low). This alone is
  insufficient to declare security fixed. Run the audit **after actual npm ci**
  in GitHub and verify the installed Metro dependency/asset tests.
- Never disable required GitHub security checks, forge successful test results,
  merge without the required review, restart the Mac services, or migrate Notion.

## Local regression verification and editor module resolution

- An actual isolated Mac `npm ci --ignore-scripts` completed, then the
  existing post-install script and the synthetic Metro PNG compatibility test
  passed. The full workspace production `npm audit --omit=dev --audit-level=high`
  passed after installation with zero critical/high findings.
- All six Turbo lint tasks passed in the isolated security worktree.
- The initial local server build found that Nodemailer 10 removed the
  `nodemailer.Transporter` namespace reference; this was fixed with the
  named `Transporter` type import. Server TypeScript compile and bundle then
  passed.
- The first local Vite web build found that third-party
  `tiptap-extension-auto-joiner` imports `@tiptap/core` from the workspace
  root; with Tiptap pinned per-package, it was hoisted only under sub-workspaces.
  We added an explicit root development dependency on the same published,
  compatible Tiptap `3.31.4` version. A real isolated reinstall, the Metro
  regression and the full web production Vite/PWA build then passed.
- **Still required before release:** hosted CI rerun on the final PR commit,
  Docker image build + container security scan, server integration tests on
  the new packages, local patched runtime adoption, and a separate CRDT fix.
  No Notion migration or protected-branch merge was authorized.

## Final Docker image security validation

- Pinned Node.js 22.23.4 Alpine image built locally after fixing the eight upstream
  Dockerfile COPY statements that incorrectly traversed outside the build context.
- Dockerfile-specific ignore patterns prevent sending local node_modules, git,
  caches, and secret environment files into the image build context.
- Initial Trivy scan found 10 high-severity vulnerability records in the base
  Node image's global npm CLI bundle, not the Colanode production application.
- After npm prune, we removed the unused global npm executable and package tree
  from the runtime filesystem, preserving the node executable.
- Rebuilt image passed Trivy 0.76.2 high/critical scan with ZERO high and ZERO
  critical findings. The container runtime reports Node 22.23.4.
- New GitHub Actions job Container image security rebuilds and scans the final
  server image using immutable-pinned trivy-action v0.36.0.
- Local scanner logs and JSON under /tmp/colanode-p103a-trivy-hardened.* are
  evidence; no scanner secret data was committed to the repository.
- All four GitHub jobs and approved code review are needed before promotion.
  Do not alter production, restart the user's dev instance or migrate Notion.
