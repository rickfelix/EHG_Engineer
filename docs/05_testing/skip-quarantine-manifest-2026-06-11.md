# Skip-Quarantine Manifest — 2026-06-11

**Category**: Report | **Status**: Approved | **Version**: 1.0.0 | **Author**: SD-LEO-INFRA-TEST-ESTATE-HYGIENE-001 | **Last Updated**: 2026-06-11 | **Tags**: testing, quarantine, skip-debt

Inventory of `.skip`/`.todo` occurrences across tests/ (FR-5 — inventory ONLY, zero test edits in this SD).
Generated: 2026-06-11T11:09:37.407Z | Total: **180 occurrences across 57 files** (pattern: `\.(skip|todo)\b`, all files under tests/; tests/archived/ removed by FR-4 and the legacy test/ root removed by FR-2 — earlier estate-wide counts were higher).

## Classification heuristic

A skip is **env-gated (intentional)** when conditional (`skipIf`, `describeDb`/`HAS_REAL_DB` wrapper, platform/env check) or commented with the gating condition. A skip is **rot (quarantine candidate)** when unconditional with no reason comment, referencing dead modules/fixtures, or added in bulk make-CI-green commits. De-rot SDs should start from the highest-count files below and route confirmed rot into the quarantine-manifest debt register (SD-LEO-FIX-GREEN-MAIN-TRIAGE-001).

## By directory

| Directory | Occurrences |
|---|---|
| tests/e2e | 90 |
| tests/unit | 67 |
| tests/integration | 20 |
| tests/capture-session-id-hook.test.js | 1 |
| tests/prd | 1 |
| tests/uat | 1 |

## Per-file inventory

| File | Occurrences |
|---|---|
| tests/unit/fleet-lock-hash.test.js | 18 |
| tests/unit/gate-skip-detection/gate-skip-detection.test.js | 11 |
| tests/e2e/templates/venture-smoke.template.ts | 9 |
| tests/e2e/brand-variants/table-operations.spec.ts | 8 |
| tests/e2e/ventures/artifact-management.spec.ts | 8 |
| tests/unit/eva-build-loop-templates.test.js | 8 |
| tests/unit/testing/post-completion-requirements.test.js | 8 |
| tests/e2e/ux-evaluation/llm-ux.spec.ts | 7 |
| tests/e2e/brand-variants/lifecycle-transitions.spec.ts | 6 |
| tests/integration/eva/analysis-steps.test.js | 6 |
| tests/e2e/brand-variants/chairman-approval.spec.ts | 5 |
| tests/e2e/ai-engines/smoke-tests.spec.ts | 4 |
| tests/e2e/brand-variants/domain-validation.spec.ts | 4 |
| tests/e2e/brand-variants/manual-entry.spec.ts | 4 |
| tests/e2e/brand-variants/stage-naming.spec.ts | 4 |
| tests/integration/kill-venture-rpc.test.js | 4 |
| tests/unit/post-completion-requirements.test.js | 4 |
| tests/e2e/brand-variants/brand-inheritance.spec.ts | 3 |
| tests/e2e/brand-variants/default-brand.spec.ts | 3 |
| tests/e2e/brand-variants/inheritance-override.spec.ts | 3 |
| tests/e2e/brand-variants/theme-variants.spec.ts | 3 |
| tests/unit/stage-15-template.test.js | 3 |
| tests/e2e/ehg-app/admin-directives.spec.ts | 2 |
| tests/e2e/ehg-app/auth.setup.spec.ts | 2 |
| tests/e2e/ehg-app/chairman-dashboard.spec.ts | 2 |
| tests/e2e/ehg-app/public-pages.spec.ts | 2 |
| tests/e2e/ehg-app/ventures.spec.ts | 2 |
| tests/e2e/templates/smoke-config.ts | 2 |
| tests/e2e/venture-creation/stage1-output-unification.spec.ts | 2 |
| tests/e2e/venture-launch/protocol-validation.spec.ts | 2 |
| tests/integration/gate1.test.js | 2 |
| tests/integration/worktree-state-atomicity.test.js | 2 |
| tests/unit/eva/stage-execution-worker.test.js | 2 |
| tests/unit/quality/disposition-calibration.test.js | 2 |
| tests/capture-session-id-hook.test.js | 1 |
| tests/e2e/api/marketing-distribution.spec.ts | 1 |
| tests/e2e/ehg-app/login.spec.ts | 1 |
| tests/e2e/leo-protocol-journey.test.js | 1 |
| tests/integration/bridge/stage-18-provisioning-smoke.test.js | 1 |
| tests/integration/enforce-parent-orchestrator-corrected-guard.test.js | 1 |
| tests/integration/migrations/layer1-claiming-session-roundtrip.test.js | 1 |
| tests/integration/retro-protocol-improvements-clear.test.js | 1 |
| tests/integration/sd-completion-integrity-view.test.js | 1 |
| tests/integration/stream-workflow.test.js | 1 |
| tests/prd/schema-validator.test.js | 1 |
| tests/uat/navigation-uat.spec.mjs | 1 |
| tests/unit/complete-quick-fix/external-timeout-and-coverage-gate.test.js | 1 |
| tests/unit/coord-adam-comms-resilient.test.js | 1 |
| tests/unit/coordination-inbox-read-ack-split.test.js | 1 |
| tests/unit/eva/quality-findings/capability-gate.test.js | 1 |
| tests/unit/eva/reality-gates.test.js | 1 |
| tests/unit/eva/stage-18-provisioning.test.js | 1 |
| tests/unit/eva/stage-templates/analysis-steps/stage-12-gtm-sales-eva-keys.test.js | 1 |
| tests/unit/handoff/gates/phantom-test-audit-gate.test.js | 1 |
| tests/unit/handoff/orchestrator-completion-hook.test.js | 1 |
| tests/unit/leo-continuous-post-completion.test.js | 1 |
| tests/unit/venture-resolver.test.js | 1 |
