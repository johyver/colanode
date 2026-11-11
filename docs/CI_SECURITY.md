# Colanode fork pull-request checks

This fork uses a dedicated `.github/workflows/pr-tests.yml` workflow for pull
requests into `main` and `develop/colanode-custom`. The GitHub-hosted jobs use
a committed npm lockfile and read-only GitHub permissions; they do not connect
to existing Notion records or production services.

| Check | What it validates | Merge rule |
| --- | --- | --- |
| Lint | `npm ci` and repository lint tasks | Must pass |
| Build and test | Server and web build, server Testcontainers integration tests, web and shared package unit tests | Must pass |
| Dependency audit | Production dependency audit at high/critical severity | Must pass |

Branch rules should require these exact job names after the first workflow
run establishes the checks in GitHub. Do not require an unobserved check name
and accidentally block every pull request without a runner.

**Security baseline:** Colanode v0.4.7 has known advisory matches that will
intentionally fail the dependency audit until separately remediated in P1-03A.
The confirmed Yjs/CRDT undo data-loss defect remains separately tracked in
P2-01A. A successful CI workflow is *not* production or migration approval.

**When lint/tests fail:** Preserve runner logs, record the commit and failing
step in the Notion task, and fix the actual problem in a new PR. Do not
`continue-on-error` a gate or bypass branch protection to get green checks.

**When dependencies change:** Run `npm install --package-lock-only
--ignore-scripts`, verify `npm ci` from a fresh checkout, then rerun all
checks. Do not change package versions to suppress security findings without
an explicit compatibility and security review.

**Production lock:** All workspace records and file fixtures in test runners
are synthetic. No real Notion export, import, sync or cutover is permitted.

**Hosted-runner timeout:** The Vitest test step uses a 15-second per-test
limit (versus the 5-second default) for slower synthetic large-file I/O on
shared runners. Assertions are not skipped; slower or failing tests remain red.
