<!-- Archived from: docs/plans/orchestrator-completion-validation-gates-architecture.md -->
<!-- SD Key: SD-LEO-ORCH-ORCHESTRATOR-COMPLETION-VALIDATION-001 -->
<!-- Archived at: 2026-03-13T21:35:38.127Z -->

# Architecture Plan: Orchestrator Completion Validation Gates

## Stack & Repository Decisions

- **Language**: JavaScript (ESM) — consistent with existing gate infrastructure
- **New dependency**: `acorn` (MIT licensed, lightweight JS parser) for Gate 3 AST analysis. ~200KB, no transitive dependencies. Used for parsing import/export statements and building call graphs.
- **Repository**: All changes in `EHG_Engineer` monorepo. No new repos.
- **Gate pattern**: Follow existing gate file structure in `scripts/modules/handoff/executors/plan-to-lead/gates/`. Each gate exports a `run(context)` function returning `{ passed, score, max_score, issues, details }`.

## Legacy Deprecation Plan

- **`verifyPipelineFlow`** in `OrchestratorCompletionGuardian`: Currently advisory-only. Gate 3 (wire check) supersedes this with hard-blocking AST analysis. The advisory version remains for backward compatibility but its results are no longer the decision point — Gate 3's result is authoritative.
- **`runCompletenessAudit`**: Continues as-is. These new gates complement it, not replace it.
- No other deprecations — all four gates are additive.

## Route & Component Structure

### New Files

```
scripts/modules/handoff/executors/plan-to-lead/gates/
  ├── integration-smoke-test-gate.js       # Gate 1: PRD smoke_test_cmd execution
  ├── acceptance-criteria-traceability.js   # Gate 2: Vision success criteria → test mapping
  ├── wire-check-gate.js                   # Gate 3: AST call graph reachability
  └── automated-uat-gate.js                # Gate 4: Scenario execution

lib/static-analysis/
  ├── call-graph-builder.js                # AST-based call graph from entry points
  ├── module-resolver.js                   # ESM/CJS import resolution (handles .js/.mjs/.cjs)
  └── reachability-checker.js              # Entry point → target function reachability

tests/unit/gates/
  ├── integration-smoke-test-gate.test.js
  ├── acceptance-criteria-traceability.test.js
  ├── wire-check-gate.test.js
  └── automated-uat-gate.test.js

tests/unit/static-analysis/
  ├── call-graph-builder.test.js
  ├── module-resolver.test.js
  └── reachability-checker.test.js

database/migrations/
  └── 20260314_orchestrator_validation_gates.sql
```

### Modified Files

| File | Change |
|------|--------|
| `scripts/modules/handoff/executors/plan-to-lead/gate-index.js` | Register 4 new gates |
| `scripts/modules/handoff/orchestrator-completion-guardian.js` | Ensure new gates run in `validate()` flow |
| `package.json` | Add `acorn` dependency |

## Data Layer

### Migration: `20260314_orchestrator_validation_gates.sql`

```sql
-- Add smoke_test_cmd to PRD schema
ALTER TABLE product_requirements_v2
  ADD COLUMN IF NOT EXISTS smoke_test_cmd TEXT;

-- Register 4 new gates in validation_gate_registry
INSERT INTO validation_gate_registry (gate_key, gate_name, gate_category, weight, enabled, applies_to_types, description)
VALUES
  ('GATE_INTEGRATION_SMOKE_TEST', 'Integration Smoke Test', 'completion', 0.25, true,
   ARRAY['feature', 'integration', 'infrastructure', 'orchestrator'],
   'Executes PRD-declared smoke_test_cmd and verifies exit code 0'),
  ('GATE_ACCEPTANCE_TRACEABILITY', 'Acceptance Criteria Traceability', 'completion', 0.25, true,
   ARRAY['feature', 'integration', 'infrastructure', 'orchestrator', 'quality'],
   'Maps vision success criteria to test files/verification methods'),
  ('GATE_WIRE_CHECK', 'Wire Check (AST Call Graph)', 'completion', 0.30, true,
   ARRAY['feature', 'integration', 'infrastructure'],
   'Verifies new modules are reachable from entry points via AST call graph analysis'),
  ('GATE_AUTOMATED_UAT', 'Automated UAT', 'completion', 0.20, true,
   ARRAY['feature', 'integration'],
   'Generates and executes automated user journey scenarios from user stories')
ON CONFLICT (gate_key) DO NOTHING;
```

**Gate weights** (sum to 1.0):
- Wire Check: 0.30 (highest — catches the exact failure that motivated this work)
- Smoke Test: 0.25 (direct behavioral verification)
- Acceptance Traceability: 0.25 (ensures vision intent coverage)
- Automated UAT: 0.20 (end-to-end journey verification)

**Per-type applicability**: `applies_to_types` array controls which SD types each gate runs for. Documentation-only SDs are not in any gate's list. The `gate-policy-resolver.js` already filters by type — no code change needed for this filtering.

### Queries

- Gate 1: `SELECT smoke_test_cmd FROM product_requirements_v2 WHERE directive_id = $1`
- Gate 2: `SELECT content FROM eva_vision_documents WHERE sd_id = $1` → parse `## Success Criteria` section
- Gate 3: `SELECT files_changed FROM sd_phase_handoffs WHERE sd_id = $1` (or derive from git diff against base branch)
- Gate 4: `SELECT user_stories FROM product_requirements_v2 WHERE directive_id = $1` → generate scenarios

### RLS

No new RLS policies needed. Gates run with service role key (existing pattern for all gate evaluators).

## API Surface

No new API endpoints. All gates are invoked internally by `OrchestratorCompletionGuardian.validate()` during the PLAN-TO-LEAD handoff.

**Gate interface** (existing contract):
```javascript
// Each gate exports:
export async function run(context) {
  // context = { sdKey, sdId, sdType, sdUuid, orchestratorData, childrenData, supabase }
  return {
    passed: boolean,
    score: number,       // 0-100
    max_score: 100,
    issues: string[],    // Human-readable failure reasons
    details: object,     // Machine-readable gate-specific data
  };
}
```

## Implementation Phases

### Phase 1: Foundation (Child A) — Database migration + gate registration + smoke test gate
**Deliverables**:
- Migration: `smoke_test_cmd` column on `product_requirements_v2` + 4 gate registry entries
- `integration-smoke-test-gate.js`: Read PRD `smoke_test_cmd`, execute via `execSync`, check exit code. If no `smoke_test_cmd`, return `{passed: true, score: 100, issues: [], details: {reason: 'no smoke_test_cmd declared — skipped'}}`
- Register in `gate-index.js`
- Unit tests

**Estimated effort**: 1 session, ~150 LOC new code

### Phase 2: Vision Criteria Mapping (Child B) — Acceptance criteria traceability gate
**Deliverables**:
- `acceptance-criteria-traceability.js`: Fetch vision doc from `eva_vision_documents`, parse `## Success Criteria` markdown section, extract numbered criteria. For each criterion, search test files (`tests/**/*.test.js`) for matching keywords or explicit `@criteria` annotations. Score = (mapped criteria / total criteria) * 100. Unmapped criteria reported as issues.
- Parsing strategy: Split on numbered list items (`1.`, `2.`, etc.) or bullet points. Extract key phrases (nouns, verbs) for fuzzy matching against test descriptions.
- Unit tests with sample vision docs

**Estimated effort**: 1-2 sessions, ~200 LOC new code

### Phase 3: AST Call Graph Wire Check (Child C) — Static analysis + wire check gate
**Deliverables**:
- `lib/static-analysis/module-resolver.js`: Resolve import paths for ESM (`import x from './y'`), CJS (`require('./y')`), and dynamic imports (`await import('./y')`). Handle `.js`, `.mjs`, `.cjs` extensions, `index.js` barrel files, and relative/absolute paths. Windows path normalization.
- `lib/static-analysis/call-graph-builder.js`: Use `acorn` to parse JS files into AST. Extract: (a) import statements → module dependencies, (b) function declarations and call expressions → call edges. Build a directed graph of {file, function} → {file, function} edges.
- `lib/static-analysis/reachability-checker.js`: Given a set of entry points (pipeline scripts) and a set of target modules (new files from the SD), determine if each target is reachable from at least one entry point via the call graph. BFS/DFS traversal.
- `wire-check-gate.js`: Identify new files from SD children (via git diff or handoff metadata). Identify entry points (pipeline scripts that import new modules, or scripts referenced in `smoke_test_cmd`). Run reachability check. Score = (reachable modules / total new modules) * 100.
- Graceful degradation: If `acorn` parsing fails on a file (syntax error, unsupported feature), log warning and skip that file (don't block on parser bugs). Report skipped files in `details`.
- Dynamic import handling: `await import(variable)` → mark as "unresolvable" and warn but don't fail. Only fail on statically-analyzable unreachable code.
- Unit tests with fixture files covering ESM, CJS, barrel files, dynamic imports

**Estimated effort**: 2-3 sessions, ~400 LOC new code + ~200 LOC tests

### Phase 4: Automated UAT (Child D) — Scenario generation + execution
**Deliverables**:
- `automated-uat-gate.js`: Fetch user stories from `product_requirements_v2`. Use existing `scenario-generator.js` to produce Given/When/Then scenarios. For each scenario:
  - **Given**: Set up preconditions (database state, file existence)
  - **When**: Execute the action (run CLI command, call function, invoke script)
  - **Then**: Assert the postcondition (check exit code, verify DB state, check file output)
- Scenario execution uses `execSync` with timeout (30s per scenario). Failures are collected as issues.
- For SDs with no user stories: return `{passed: true, score: 100, details: {reason: 'no user stories — skipped'}}`
- SD types without runnable surfaces (documentation, protocol): justified skip
- Unit tests

**Estimated effort**: 2 sessions, ~250 LOC new code

## Testing Strategy

### Unit Tests
Each gate has dedicated tests verifying:
- Pass case (all criteria met)
- Fail case (specific failures produce correct issues)
- Skip case (non-applicable SD type returns justified pass)
- Edge cases (missing PRD fields, empty vision doc, no new files, no user stories)

### Static Analysis Tests (Gate 3 specific)
Fixture-based testing with sample JS files:
- `fixtures/esm-simple/` — basic ESM imports, entry point calls target
- `fixtures/esm-barrel/` — barrel file re-exports, entry point uses barrel
- `fixtures/cjs-mixed/` — CJS require in ESM project
- `fixtures/dynamic-import/` — `await import()` with string literal
- `fixtures/unreachable/` — module exists but no import path from entry point

### Integration Tests
- Run all 4 gates against a mock orchestrator context with realistic data
- Verify gate results integrate correctly with `OrchestratorCompletionGuardian`
- Verify results are stored in `sd_phase_handoffs.gate_results`

## Risk Mitigation

### AST parsing failures on edge cases (Gate 3)
**Risk**: `acorn` fails to parse files with experimental syntax, decorators, or TypeScript-like features.
**Mitigation**: Wrap parse in try/catch. Failed parses are logged as warnings and the file is excluded from analysis (not treated as a failure). Report parse failures in `details.skipped_files`.

### False positives on non-code SDs
**Risk**: Documentation or protocol SDs trigger wire check or UAT failures despite having no code.
**Mitigation**: `applies_to_types` in `validation_gate_registry` restricts each gate to applicable SD types. `gate-policy-resolver.js` filters before execution. Any gate that runs on an inapplicable type returns justified pass.

### `smoke_test_cmd` not populated for existing PRDs
**Risk**: Gate 1 fires on orchestrators with PRDs that predate the schema change.
**Mitigation**: Gate checks for NULL `smoke_test_cmd` and returns `{passed: true, details: {reason: 'no smoke_test_cmd declared'}}`. This is a justified skip, not a failure. Future PRDs are expected to populate this field.

### Automated UAT scenario quality
**Risk**: Auto-generated scenarios produce flaky or meaningless assertions.
**Mitigation**: Scenarios use conservative assertions (exit code 0, file exists, DB row exists). Complex behavioral assertions are out of scope — those are covered by unit and integration tests. UAT focuses on "does the command run without errors."

### All-at-once rollout breaks in-flight orchestrators
**Risk**: Orchestrators currently in EXEC phase complete and hit new gates they weren't designed for.
**Mitigation**: Gates gracefully handle missing data (no smoke_test_cmd, no vision criteria, no new files) by returning justified passes. Only orchestrators with complete data get full gate evaluation. The transition is smooth because gates degrade to "pass with skip" rather than "fail on missing data."
