## QF-20260903-433 — Adam's own parity guard could never catch the failure it's named for

Coordinator directive a0ae3929 (premise re-verified 2026-09-11): three failures stacked in one guard. Confirmed still live by direct measurement before touching anything.

### 1. Regex asymmetry (confirmed live)
`CLAUDE_ADAM.md` currently carries 2 durable duties, both bare-form (`BANDWIDTH FORECAST DUTY (durable)`, `BELT COUNTDOWN DUTY (durable)`). `CLAUDE_SOLOMON.md` carries 5 in the qualifier form (`... DUTY (durable; chairman-directed ...)`) that `SD-LEO-INFRA-SOLOMON-STARTUP-PARITY-RECALIBRATE-001` already broadened Solomon's regex to accept. Adam's own `parseDurableDutyMarkers` was never recalibrated — it requires a bare `(durable)` with no qualifier allowance. The defect bites zero duties today (which is exactly why nobody noticed) and would silently unarm the first qualifier-form duty anyone writes into the Adam contract.

**Fix (per the ticket's explicit fix shape — reconcile, don't re-patch):** `adam-startup-check.mjs` now imports `parseDurableDutyMarkers`/`slugifyDuty` from `solomon-startup-check.mjs`, the same precedent `michael-startup-check.mjs` already follows, and re-exports them so its own importers see no path change. One marker convention, one parser.

### 2. Dead verifier (confirmed live)
`tests/unit/adam-startup-check.test.mjs` uses `node:test`/`node:assert` directly. `npx vitest run tests/unit/adam-startup-check.test.mjs` → `No test files found, exiting with code 1`. None of its 23 prior assertions — including the `QF-20260828-890` zero-marker CONTRACT DRIFT guard — were ever load-bearing in CI.

**Fix:** wired in via the exact precedent already established for `session-tick` and `adam-github-assessment` (see `unit-tier.yml`): a `test:adam-startup-check` npm script + a `node --test` CI step.

### 3. Coverage gap (facet 2, corrected framing)
The ticket described the missing-duties assertion as "satisfied by an empty contract" — not accurate today (it reads the real, non-empty `CLAUDE_ADAM.md`), but nothing tested either the qualifier-form fix in (1) or the existing zero-marker drift guard in `renderContractParity`.

**Fix:** two new tests — a qualifier-form duty parses and resolves through `missingDurableDuties`; a fixture contract with zero durable markers reports `CONTRACT DRIFT`, never a silent `CLEAN`.

### Tests
`npm run test:adam-startup-check` → 25/25 passing. The 7 other vitest suites touching `adam-startup-check.mjs`/`solomon-startup-check.mjs` (152 tests) pass unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Mv5M4xjdfTVnASfSRD4yKb
