# Audit Snapshot — SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001
Date: 2026-04-27
Branch: feat/SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 @ fd162198b0
Source: vitest run --reporter=json (full suite, ~1 min)

## Bucket counts (audit-test-failures.mjs)
- Total failed: 1489
- real-assertion-failure: 1038  (PR3 manual triage scope)
- other:                  405   (needs sub-bucketing OR PR3)
- cannot-find-module:     45    (delete-or-fix)
- econnrefused:           1     (insufficient for FR-2 sweep)
- must-be-set:            0     ← **was PR2's primary target; PR #3384 setup.js synthetic-env neutralized it**

## Suites: 5042 total / 4064 passed / 978 failed

## Implication
PR2 (FR-2) as scoped no longer productive — must-be-set bucket evaporated. Resume planning should:
- Re-scope FR-2 (e.g., sub-bucket "other" 405 for a mechanical pattern), OR
- Skip PR2, jump to PR3 manual triage on the 1038 real-assertion-failure rows.

## Files (alongside this snapshot)
- audit.csv  — full 1489-row CSV from PR1 audit script
- audit.json — same data + by_category counts
- test-results.json (5.9MB, NOT committed — regenerate via `npx vitest run --reporter=json --outputFile=test-results.json`)
