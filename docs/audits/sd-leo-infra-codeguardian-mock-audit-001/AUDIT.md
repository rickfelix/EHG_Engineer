# Audit: codeguardian-mock disposition

**SD**: SD-LEO-INFRA-CODEGUARDIAN-MOCK-AUDIT-001
**Audited**: 2026-05-02T01:08:13.277Z

## Summary

| Reference type | Count |
|---|---:|
| Static grep matches (code/config/md) | 46 |
| Dynamic require/import matches | 2 |
| docker-compose service refs | 0 |
| package.json workspaces refs | 0 |
| CI workflow refs (.github/) | 0 |
| vitest.config.js exclusion present | yes |
| commits since 2026-04-26 | 0 |

## Vitest exclusion
- line 44: `'**/services/codeguardian-mock/**',`

## Static grep matches (top 30)
- `.claude/auto-proceed-state.json:6` — "currentTask": "Implementing Audit codeguardian-mock disposition (decommission vs repair) PRD",
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:29` — "Audit script `scripts/audit/codeguardian-mock-disposition.mjs` runs grep across *.js,*.ts,*.mjs,*.cjs,*.json,*.yml,*.ya
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:37` — "Disposition decision document at docs/audits/sd-leo-infra-codeguardian-mock-audit-001/DECISION.md declares EITHER 'Opti
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:45` — "If chosen, atomic PR removes (a) services/codeguardian-mock/ recursively, (b) line of vitest.config.js containing '**/s
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:47` — "Post-merge `grep -r 'codeguardian-mock' --include=*.{json,yml,yaml,js,ts,mjs,cjs} .` returns zero matches outside the a
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:53` — "If chosen, atomic PR (a) fixes failing tests inside services/codeguardian-mock/tests/ so they pass under vitest, (b) re
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:55` — "`npx vitest run services/codeguardian-mock/tests/` exits 0 with at least one test executed (not all skipped)."
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:92` — "Diff vitest.config.js shows net -1 exclusion entry (the codeguardian-mock line removed); no new entries in same PR. Pre
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:115` — "Disposition=B → tests fixed → exclusion removed → vitest run passes → CI green. Expected: services/codeguardian-mock/te
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:122` — "Audit finds codeguardian-mock referenced in docker-compose.dev.yml. DECISION.md must explicitly call out the docker ref
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:129` — "Audit finds package.json workspaces array includes 'services/codeguardian-mock'. Disposition execution must update work
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:136` — "Audit's dynamic_require_matches is non-empty (e.g., require('services/codeguardian-mock/something') appears somewhere).
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:160` — "package.json workspaces array and/or package-lock.json may reference @ehg/codeguardian-mock; deleting the dir without u
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:169` — "codeguardian-mock may be referenced by docker-compose.yml, docker-compose.dev.yml, or docker-compose.test.yml. Removing
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:178` — ".github/workflows/*.yml may reference services/codeguardian-mock paths in path-filters or build steps. Removing the dir
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:187` — "require('services/codeguardian-mock/...') or import('services/codeguardian-mock/...') at runtime would not show up in s
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:198` — "Audit script checks `git log --since=2026-04-26 services/codeguardian-mock/` for new commits + greps for any new extern
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:207` — "Audit script identifies the exclusion entry by content (regex match on '**/services/codeguardian-mock/**') not by line 
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:225` — "If Option A: post-merge `grep -r 'codeguardian-mock' --include=*.{json,yml,yaml,js,ts,mjs,cjs} .` returns zero matches 
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:230` — "If Option B: `npx vitest run services/codeguardian-mock/tests/` exits 0 with at least one test executed (not all skippe
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:249` — change: "Disposition PR removes (Option A) or repairs (Option B) the codeguardian-mock test-suite source so test-coverag
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:254` — change: "After Option A, `npx vitest run` no longer encounters the codeguardian-mock exclusion comment; after Option B, 
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:268` — failure_mode: "Only relevant if codeguardian-mock is registered as a workspace; audit script detects this."
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:274` — failure_mode: "Only relevant if a service block references codeguardian-mock; audit script detects this."
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:280` — failure_mode: "Only relevant if any workflow references services/codeguardian-mock paths; audit script detects this."
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:306` — default: "docs/audits/sd-leo-infra-codeguardian-mock-audit-001/"
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:315` — "Per-SD git revert; Option A revert restores services/codeguardian-mock/ tree; Option B revert re-adds exclusion to vite
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:320` — "Audit whether services/codeguardian-mock/ should be decommissioned (Option A, ~95% likely per Explore-agent codebase sc
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:325` — "SD-LEO-INFRA-TEST-COVERAGE-HYGIENE-001 (parent) FR-3 surfaced the codeguardian-mock vitest exclusion as a hygiene defec
- `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs:330` — "EHG_Engineer Vite-based monorepo. services/codeguardian-mock/ is a directory of indeterminate size (audit step quantifi

## docker-compose refs
- none

## CI workflow refs
- none

## package.json workspaces refs
- none

## Recent activity (since 2026-04-26)
- none

Full machine-readable output: [audit-output.json](./audit-output.json)
