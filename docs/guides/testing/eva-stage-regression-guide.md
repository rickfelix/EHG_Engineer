---
category: guide
status: approved
version: 1.0.0
author: DOCMON Sub-Agent
last_updated: 2026-03-04
tags: [eva, testing, regression, e2e, stage-templates]
---

# EVA Stage Regression Guide

## Metadata

- **Category**: Guide
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-03-04
- **Tags**: [eva, testing, regression, e2e, stage-templates]

## Overview

The EVA stage regression suite is a two-layer test framework that validates all 25 venture lifecycle stage templates. It was built during the March 2026 systemic audit (PRs #1747–#1773) and covers schema structure, data validation, business logic, gate enforcement, and cross-stage contracts — approximately 2,250 tests running in under 90 seconds.

This guide is the operational runbook: when to run, how to run, how to read output, and how to extend.

## Table of Contents

- [Test Architecture](#test-architecture)
- [When to Run](#when-to-run)
- [How to Run](#how-to-run)
- [Reading Output](#reading-output)
- [Adding Tests When Changing a Stage](#adding-tests-when-changing-a-stage)
- [Known Gaps](#known-gaps)
- [Related Documentation](#related-documentation)

---

## Test Architecture

Two layers, complementary purposes:

| Layer | Entry Point | Scope | Runtime |
|-------|-------------|-------|---------|
| **E2E Runner** | `scripts/e2e-stage-runner.mjs` | All 25 stages + 4 gate suites; synthetic data only | ~10–20s |
| **Unit Tests** | `npm run test:unit` (Vitest) | 40 test files, 2,250+ assertions, per-stage and cross-cutting | ~30–60s |

**E2E Runner** — 5 suites per stage:
1. Template structure (id, slug, title, version, schema, defaultData, required functions)
2. `validate()` with well-formed data → must pass
3. `validate()` with empty/null data → must fail
4. `computeDerived()` executes and returns correct shape
5. Every schema key exists in `defaultData`

Plus 4 gate suites: kill gates (Stages 3, 5, 13, 23), reality gates (Stage 9, 12), promotion gates (Stages 16, 22), decision filter engine.

**Unit Tests** — deeper per-stage assertions in `tests/unit/eva/stage-templates/`:
- Enum constraints, string minLength, integer ranges, array minItems
- Derived field correctness, weighted scoring, decision logic
- Cross-stage contract matching (Stage N output → Stage N+1 `consume`)
- Constants (MIN_CANDIDATES, WEIGHT_SUM, APPROVAL_STATUSES, etc.)
- Chairman gate enforcement (Stages 10, 22, 25)

---

## When to Run

### Always Run After

| Change | Why |
|--------|-----|
| Edit any `lib/eva/stage-templates/stage-{N}.js` | Directly validates the changed template |
| Edit any `lib/eva/stage-templates/analysis-steps/stage-{N}-*.js` | Analysis steps affect gate and contract logic |
| Edit `lib/eva/reality-gates.js` or `lib/eva/decision-filter-engine.js` | Cross-cutting gate logic used by all stages |
| Edit `lib/eva/stage-templates/validation.js` | Shared validation utility; affects all templates |
| Edit `lib/eva/stage-templates/index.js` | Registry auto-registration |
| Upgrade any dependency used by the EVA engine | Confirm nothing regressed |

### Also Useful For

- **Before starting an audit** — Establish a clean baseline so failures during the audit are attributable to your changes, not pre-existing issues.
- **Pre-merge check** — Run the E2E runner against a PR branch to catch regressions before review.
- **After a merge conflict resolution** — Confirm neither side of the conflict broke a contract.
- **Periodic health check** — If the EVA engine hasn't been touched in weeks, a quick run confirms no environmental drift.

### Not a Substitute For

Live venture execution, Supabase integration, frontend alignment (Stage 6 GUI mismatch), or LLM output quality. See [Known Gaps](#known-gaps).

---

## How to Run

### Full Regression (Recommended Starting Point)

```bash
# Unit tests — all 40 files, ~2,250 assertions
npm run test:unit

# E2E runner — all 25 stages + 4 gate suites
node scripts/e2e-stage-runner.mjs
```

### Targeted Runs

```bash
# E2E: single stage only
node scripts/e2e-stage-runner.mjs --stage=13

# E2E: machine-readable output (CI pipelines, scripting)
node scripts/e2e-stage-runner.mjs --json

# Unit: single stage file (Vitest filter)
npm run test:unit -- stage-13

# Unit: watch mode during active development
npm run test:watch

# Individual stage E2E runner (standalone scripts)
node scripts/test-stage13-e2e.js
```

### CI Integration

The E2E runner exits with code `1` if any critical or high-severity finding is present; `0` otherwise. Pipe `--json` output to parse structured results:

```bash
node scripts/e2e-stage-runner.mjs --json > results.json
# results.json shape: { stageResults, allFindings, summary }
# summary.criticalCount + summary.highCount > 0 → fail the build
```

---

## Reading Output

### E2E Runner Console

```
Phase 1: THE TRUTH (Stages 1-5)
  Stage 01 - Draft Idea & Chairman Review
    ✓ Template structure
    ✓ Validate (valid data)
    ✓ Validate (invalid data)
    ✓ computeDerived
    ✓ Schema/defaultData consistency
  ...

Gate Tests
  ✓ Kill gates (Stages 3, 5, 13, 23)
  ✓ Reality gates
  ✓ Decision filter engine
  ✓ Reality gate module boundaries

Summary: 25/25 stages PASS, 0 findings
```

| Icon | Meaning |
|------|---------|
| `✓` | Pass |
| `!` | High severity finding |
| `~` | Medium severity finding |
| `✗` | Critical finding (causes exit code 1) |

### Unit Test Output (Vitest)

Standard Vitest output. A finding like:

```
FAIL tests/unit/eva/stage-templates/stage-13.test.js
  ✗ computeDerived > ranked by weighted_score
    Expected: ['Alpha', 'Beta']
    Received: ['Beta', 'Alpha']
```

...means Stage 13's `computeDerived` sorting logic broke. Go to `lib/eva/stage-templates/stage-13.js` and fix the ranking logic.

---

## Adding Tests When Changing a Stage

When you edit a stage template, add tests in the corresponding files:

| Change Type | Where to Add Tests |
|-------------|-------------------|
| New schema field added | `tests/unit/eva/stage-templates/stage-{N}.test.js` — add to valid data builder and add a "missing field" failure case |
| New enum value | Same unit test file — add new value to valid case, confirm old invalid values still fail |
| New derived field | Unit test: add assertion in `computeDerived` describe block |
| New gate or gate condition | `tests/unit/eva/stage-templates/chairman-gates.test.js` or the stage unit test |
| Cross-stage contract change | Unit test for both the upstream stage (output) and the downstream stage (consume); E2E runner `testDefaultDataSchema()` will also catch missing keys |
| New constants exported (MIN_*, WEIGHT_SUM) | Add constant assertion at the top of the stage unit test |

**Minimal test extension for a new schema field** — in `tests/unit/eva/stage-templates/stage-{N}.test.js`:

```javascript
// Add to createValidData()
function createValidData(overrides = {}) {
  return {
    // ... existing fields ...
    your_new_field: 'valid-default-value',
    ...overrides
  };
}

// Add a failure case
it('fails when your_new_field is missing', () => {
  const data = createValidData({ your_new_field: undefined });
  const result = template.validate(data);
  expect(result.valid).toBe(false);
});
```

After adding tests, run:

```bash
npm run test:unit -- stage-{N}
node scripts/e2e-stage-runner.mjs --stage={N}
```

Both should pass before you commit.

---

## Known Gaps

These are out of scope for this regression suite by design:

| Gap | Scope | Status |
|-----|-------|--------|
| Live LLM outputs | Tests use synthetic data — actual Claude analysis is not validated | By design |
| Supabase persistence | `fetchUpstreamArtifacts` and DB writes are mocked | By design |
| Prompt injection | Stage inputs interpolated into LLM prompts; `sanitizeForPrompt()` not enforced in all stages | Deferred (~200 LOC, Stages 2–16) |
| Dead code in `computeDerived` | When `analysisStep` exists, `computeDerived` body is unreachable | Deferred (~500 LOC cleanup) |
| Frontend/GUI alignment | Stage 6 backend schema ≠ EHG frontend component | Cross-repo, deferred |
| Performance at scale | No load tests for thousands of ventures | Out of scope |
| Browser/UI validation | No Playwright tests for EVA frontend | Separate layer |

For the deferred items, see `brainstorm/2026-03-04-systemic-audit-findings-remediation.md`.

---

## Related Documentation

- **Test report** (last clean run, 2026-02-15): [`docs/eva/e2e-stage-test-report.md`](../../eva/e2e-stage-test-report.md)
- **Full testing guide** (orchestrator, integration, UAT): [`docs/guides/workflow/cli-venture-lifecycle/guides/testing-guide.md`](../workflow/cli-venture-lifecycle/guides/testing-guide.md)
- **Audit findings and remediation**: [`brainstorm/2026-03-04-systemic-audit-findings-remediation.md`](../../../brainstorm/2026-03-04-systemic-audit-findings-remediation.md)
- **Stage lifecycle overview**: [`docs/guides/workflow/25-stage-venture-lifecycle-overview.md`](../workflow/25-stage-venture-lifecycle-overview.md)
- **Stage templates**: `lib/eva/stage-templates/stage-{N}.js` (N = 1–25)
- **E2E master runner**: `scripts/e2e-stage-runner.mjs`
- **Individual E2E runners**: `scripts/test-stage{N}-e2e.js` (N = 1–25)
- **Unit test files**: `tests/unit/eva/stage-templates/`

---

*Version History*
- **v1.0.0** (2026-03-04): Initial runbook. Captures regression suite built during March 2026 systemic audit (PRs #1747–#1773).
