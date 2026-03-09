# Architecture Plan: Semantic Validation Gates

## Stack & Repository Decisions

- **Repository**: EHG_Engineer (backend — all gate infrastructure lives here)
- **Language**: Node.js ESM modules (consistent with existing 61 gate files)
- **Database**: Supabase (PostgreSQL) — existing tables for 7 gates, 1 new migration for 3 gates
- **Testing**: Vitest (consistent with existing gate test patterns)
- **No new dependencies** — all gates use existing Supabase client, LLM client factory, and file system utilities

## Legacy Deprecation Plan

No systems are replaced. This is purely additive:
- `vision-completion-score.js` gains an optional blocking mode (advisory remains default until Phase 1 deploys)
- `OrchestratorCompletionGuardian` gains a pre-completion semantic check hook (existing auto-fix logic unchanged)
- `sd-type-applicability-policy.js` gains 10 new validator categories (existing 7 untouched)

## Route & Component Structure

### Gate Module Pattern (per gate)

Each gate follows the established factory pattern:

```
scripts/modules/handoff/executors/<phase>/gates/
├── <gate-name>.js           # Gate implementation (50-120 LOC)
├── index.js                 # Updated exports (add 1 line)
```

### Phase-to-Gate Mapping

```
lead-to-plan/gates/
├── scope-reduction-verification.js      # Gate 6
├── sd-type-compatibility.js             # Gate 9
├── overlapping-scope-detection.js       # Gate 10

plan-to-exec/gates/
├── vision-dimension-completeness.js     # Gate 4
├── architecture-requirement-trace.js    # Gate 7

exec-to-plan/gates/
├── deliverables-completeness.js         # Gate 2
├── smoke-test-validation.js             # Gate 5
├── user-story-coverage.js              # Gate 8

plan-to-lead/gates/
├── scope-audit.js                       # Gate 1
├── child-scope-coverage.js              # Gate 3
├── user-story-coverage-verify.js        # Gate 8 (verification pass)
```

### Shared Utilities

```
scripts/modules/handoff/validation/
├── semantic-gate-utils.js               # Shared helpers (confidence scoring, auto-fix detection)
├── scope-similarity.js                  # Keyword-based scope overlap (Gate 10)
├── scope-snapshot.js                    # Scope change tracking (Gate 6)
```

### SD-Type Applicability Matrix

Extension to `sd-type-applicability-policy.js`:

| Gate | feature | bugfix | infra | docs | security | refactor | orchestrator | database | enhancement |
|------|---------|--------|-------|------|----------|----------|-------------|----------|-------------|
| SCOPE_AUDIT | REQ | REQ | OPT | SKIP | REQ | OPT | SKIP | REQ | OPT |
| DELIVERABLES | REQ | REQ | REQ | SKIP | REQ | REQ | SKIP | REQ | REQ |
| CHILD_SCOPE | SKIP | SKIP | SKIP | SKIP | SKIP | SKIP | REQ | SKIP | SKIP |
| VISION_DIM | REQ | OPT | OPT | SKIP | REQ | SKIP | SKIP | REQ | REQ |
| SMOKE_TEST | REQ | REQ | OPT | SKIP | REQ | SKIP | SKIP | OPT | OPT |
| SCOPE_REDUCTION | REQ | REQ | REQ | SKIP | REQ | REQ | REQ | REQ | SKIP |
| ARCH_TRACE | REQ | OPT | REQ | SKIP | REQ | OPT | SKIP | REQ | OPT |
| USER_STORIES | REQ | REQ | OPT | SKIP | REQ | SKIP | SKIP | OPT | REQ |
| SD_TYPE_COMPAT | SKIP | SKIP | SKIP | SKIP | SKIP | SKIP | REQ | SKIP | SKIP |
| OVERLAP_DETECT | REQ | REQ | REQ | OPT | REQ | REQ | REQ | REQ | REQ |

REQ = Required (blocking), OPT = Optional (warning), SKIP = Not applicable

## Data Layer

### Existing Tables (no changes needed for 7 gates)

| Table | Gates Using It | Query Pattern |
|-------|---------------|---------------|
| `sd_scope_deliverables` | 1 (SCOPE_AUDIT), 2 (DELIVERABLES), 3 (CHILD_SCOPE) | SELECT WHERE sd_id, GROUP BY completion_status |
| `product_requirements_v2` | 5 (SMOKE_TEST), 8 (USER_STORIES) | SELECT user_stories, smoke_test_steps WHERE sd_id |
| `eva_vision_scores` | 4 (VISION_DIM) | SELECT score, dimensions WHERE sd_id |
| `eva_architecture_plans` | 7 (ARCH_TRACE) | SELECT dimensions WHERE plan_key |
| `strategic_directives_v2` | 3 (CHILD_SCOPE), 9 (SD_TYPE), 10 (OVERLAP) | SELECT scope, sd_type WHERE parent_sd_id / status=in_progress |

### New Migration (for 3 gates)

```sql
-- Gate 6: Scope snapshot for reduction verification
ALTER TABLE sd_phase_handoffs
  ADD COLUMN scope_snapshot JSONB DEFAULT NULL;
-- Populated at LEAD-TO-PLAN with current SD scope text
-- Compared at EXEC-TO-PLAN against current scope

-- Gate 10: Scope keywords for overlap detection
ALTER TABLE strategic_directives_v2
  ADD COLUMN scope_keywords TEXT[] DEFAULT '{}';
-- Populated at SD creation via keyword extraction
-- Queried by OVERLAPPING_SCOPE_DETECTION gate

-- Index for overlap queries
CREATE INDEX idx_sd_scope_keywords ON strategic_directives_v2
  USING GIN (scope_keywords)
  WHERE status IN ('draft', 'in_progress', 'ready');
```

### RLS Policy

No new RLS needed — all gate queries use `service_role_key` (existing pattern).

## API Surface

### Gate Result Contract (extends existing gate-result-schema.js)

Each semantic gate returns:

```javascript
{
  name: 'DELIVERABLES_COMPLETENESS',
  passed: true|false,
  score: 85,        // 0-100
  maxScore: 100,
  confidence: 0.92, // NEW: 0.0-1.0, how confident the gate is in its judgment
  semantic: true,   // NEW: flag distinguishing semantic from structural gates
  details: {
    total: 5,
    completed: 4,
    missing: ['FR-3: Real-time notifications'],
    autoFixDetected: false  // NEW: flags auto-generated artifacts
  }
}
```

### Configuration API (via validation_gate_registry table)

```sql
INSERT INTO validation_gate_registry (gate_key, phase, sd_type, applicability, threshold)
VALUES
  ('DELIVERABLES_COMPLETENESS', 'EXEC_TO_PLAN', 'feature', 'REQUIRED', 85),
  ('DELIVERABLES_COMPLETENESS', 'EXEC_TO_PLAN', 'documentation', 'DISABLED', NULL),
  -- ... 180 total rows (10 gates × 18 SD types, minus SKIP entries)
```

### Semantic Fidelity Score API

```javascript
// Computed per SD after all semantic gates run
function computeSemanticFidelityScore(gateResults) {
  const semanticGates = gateResults.filter(g => g.semantic);
  if (semanticGates.length === 0) return null;

  const weightedSum = semanticGates.reduce((sum, g) =>
    sum + (g.score * g.confidence), 0);
  const weightTotal = semanticGates.reduce((sum, g) =>
    sum + (g.maxScore * g.confidence), 0);

  return Math.round((weightedSum / weightTotal) * 100);
}
```

## Implementation Phases

### Phase 1: High Reuse (~1 week, 4 gates, ~250 LOC)

| Gate | LOC Est. | Reuses | New Code |
|------|----------|--------|----------|
| DELIVERABLES_COMPLETENESS | ~60 | extract-deliverables-from-prd.js, sd_scope_deliverables table | Completion rollup, auto-fix detection |
| USER_STORY_COVERAGE | ~70 | story-auto-validation.js, acceptance-criteria-validation.js | Coverage percentage calculation |
| VISION_DIMENSION_COMPLETENESS | ~30 | vision-completion-score.js (promote advisory→blocking) | Threshold enforcement, confidence scoring |
| SD_TYPE_COMPATIBILITY | ~80 | orchestrator-preflight.js, sd-hierarchy-mapper.js | Type compatibility matrix, child validation |

**Deliverables**: 4 gate files, updated exports in 4 phase index files, updated sd-type-applicability-policy.js, shared semantic-gate-utils.js

### Phase 2: Moderate Complexity (~1 week, 3 gates, ~290 LOC)

| Gate | LOC Est. | Reuses | New Code |
|------|----------|--------|----------|
| SCOPE_AUDIT | ~100 | sd_scope_deliverables, PRD scope field | Scope comparison logic, git diff integration |
| CHILD_SCOPE_COVERAGE | ~90 | sd-hierarchy-mapper.js, sd_scope_deliverables | Parent-child deliverable union, gap detection |
| ARCHITECTURE_REQUIREMENT_TRACEABILITY | ~100 | eva_architecture_plans, product_requirements_v2 | Dimension-to-requirement mapping |

**Deliverables**: 3 gate files, OrchestratorCompletionGuardian hook for CHILD_SCOPE, migration for scope_snapshot column

### Phase 3: New Infrastructure (~2 weeks, 3 gates, ~370 LOC + utilities)

| Gate | LOC Est. | Reuses | New Code |
|------|----------|--------|----------|
| SMOKE_TEST_VALIDATION | ~120 | smoke-test-evidence.js pattern | Command parser, file existence checker |
| SCOPE_REDUCTION_VERIFICATION | ~100 | sd_phase_handoffs | Scope snapshot capture, delta calculator |
| OVERLAPPING_SCOPE_DETECTION | ~150 | strategic_directives_v2 | scope-similarity.js utility, keyword extraction |

**Deliverables**: 3 gate files, 2 utility modules, migration for scope_keywords column + GIN index

### Total Estimate

- **New files**: ~13 gate files + 3 utilities = 16 files
- **Modified files**: 4 phase index.js + sd-type-applicability-policy.js + 1 migration = 6 files
- **Total LOC**: ~910 new code
- **Test files**: 10 test files (~100 LOC each) = ~1000 LOC tests
- **Timeline**: ~4 weeks across 3 phases

## Testing Strategy

### Unit Tests (per gate)
- Valid input → correct pass/fail with expected score
- Edge cases: empty deliverables, null vision scores, missing PRD
- Auto-fix detection: artificially generated artifacts score correctly
- SD type applicability: gate skips correctly for non-applicable types
- Confidence scoring: low-data scenarios produce low confidence

### Integration Tests
- Full handoff with semantic gates enabled → correct blocking behavior
- Orchestrator completion with CHILD_SCOPE_COVERAGE → blocks on missing scope
- SD creation with OVERLAPPING_SCOPE_DETECTION → warns on overlap

### Smoke Tests
- Existing 15 smoke tests continue passing (no regression)
- New smoke test: semantic gate result schema validates correctly

## Risk Mitigation

### Risk 1: False Positive Rate Too High
- **Mitigation**: Confidence field (0.0-1.0) — gates with < 0.7 confidence produce warnings not blocks
- **Fallback**: validation_gate_registry allows runtime downgrade from REQUIRED to OPTIONAL per SD type

### Risk 2: Auto-Fix Guardian Circumvention
- **Mitigation**: Each gate checks for `generated_by: 'AUTO_HOOK'` or `trigger_event: 'AUTO_FIX'` markers on artifacts and scores them at 0
- **Fallback**: CHILD_SCOPE_COVERAGE requires actual code changes (git diff) not just database status flags

### Risk 3: Execution Time Exceeds Budget
- **Mitigation**: All queries use indexed columns; cross-SD queries bounded by LIMIT 50; 30-second timeout per gate
- **Fallback**: Semantic gates run in batch mode (validateGatesAll) — parallel where possible

### Risk 4: Policy Matrix Misconfiguration
- **Mitigation**: Unit tests validate every cell in the SD-type × gate applicability matrix
- **Fallback**: Default to REQUIRED for unknown SD types (fail-safe)

### Risk 5: Bypass Inflation
- **Mitigation**: Semantic gate bypasses are logged separately with justification required
- **Monitoring**: Dashboard alert if semantic bypass rate exceeds 10% per week
