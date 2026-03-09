# Architecture Plan: Architecture-to-SD Phase Coverage Gate

## Stack & Repository Decisions

- **Repository**: EHG_Engineer (all gate infrastructure lives here)
- **Language**: Node.js ESM modules (consistent with existing handoff and gate scripts)
- **Database**: Supabase (PostgreSQL) — existing `eva_architecture_plans` table, `sections` column
- **Testing**: Vitest (consistent with existing gate test patterns)
- **No new dependencies** — all functionality uses existing Supabase client and handoff infrastructure

## Legacy Deprecation Plan

No systems are replaced. This is purely additive:
- `create-orchestrator-from-plan.js` gains phase extraction → `sections` column population (existing `parsePhases()` reused)
- `unified-handoff-system.js` gains a new gate check at LEAD-TO-PLAN (existing gate injection pattern)
- `leo-create-sd.js` gains an advisory warning (non-blocking, informational)
- `archplan-command.mjs` gains `sections` population during upsert (existing flow extended)

## Route & Component Structure

### New Files
```
scripts/modules/handoff/validation/
  phase-coverage-validator.js          # Pure validation logic (~60-80 LOC)

scripts/
  backfill-architecture-sections.js    # One-time backfill for existing plans (~40 LOC)
```

### Modified Files
```
scripts/eva/archplan-command.mjs                      # Populate sections during upsert
scripts/create-orchestrator-from-plan.js              # Export parsePhases() as shared utility
scripts/modules/handoff/executors/lead-to-plan/       # Add phase coverage gate check
scripts/leo-create-sd.js                              # Add advisory warning for uncovered phases
```

### Module Organization
- `phase-coverage-validator.js` — Pure function module. Takes structured phases (from `sections` JSONB) and list of SDs (from `strategic_directives_v2`), returns coverage report: `{ covered: [{phase, sd_key}], uncovered: [{phase}], coveragePercent, passed }`. No side effects, no database calls.
- `backfill-architecture-sections.js` — One-time migration script. Reads all architecture plans, extracts phases from content, populates `sections` column. Idempotent (skips plans with non-null sections).

## Data Layer

### Existing Table: `eva_architecture_plans`

The `sections` column already exists (type JSONB, currently NULL). Populate with this schema:

```jsonc
{
  "implementation_phases": [
    {
      "number": 1,
      "title": "Schema + Core Clustering",
      "description": "Database migration, taxonomy module, AI clustering engine, CLI tooling",
      "child_designation": "child",          // "child" | "separate_orchestrator"
      "covered_by_sd_key": "SD-XXX-001-B",  // null if uncovered
      "deliverables": ["Database tables", "Clustering algorithm", "CLI scripts"],
      "estimate_loc": 280
    },
    {
      "number": 3,
      "title": "Chairman UI",
      "description": "Planning tab on Vision route",
      "child_designation": "separate_orchestrator",
      "covered_by_sd_key": null,             // UNCOVERED — gate will block
      "deliverables": ["PlanningTab.tsx", "WaveSequenceView.tsx"],
      "estimate_loc": 400
    }
  ],
  "extracted_at": "2026-03-08T20:00:00Z",
  "extraction_source": "content_parse"       // "content_parse" | "manual" | "backfill"
}
```

### Key Queries

**Phase coverage check (gate query):**
```sql
-- Get architecture plan phases for an SD's arch_key
SELECT sections->'implementation_phases' as phases
FROM eva_architecture_plans
WHERE plan_key = $1;

-- Get all SDs linked to this architecture plan
SELECT sd_key, title, status, parent_sd_id
FROM strategic_directives_v2
WHERE metadata->>'arch_key' = $1
   OR metadata->>'architecture_plan_key' = $1;
```

**Backfill existing plans:**
```sql
SELECT id, plan_key, content, sections
FROM eva_architecture_plans
WHERE sections IS NULL
  AND content IS NOT NULL;
```

### No Schema Changes Needed
The `sections` column already exists as JSONB. No migration required — only data population.

### RLS
No new RLS needed — all queries use `service_role_key` (existing pattern).

## API Surface

### Phase Coverage Validator API

```javascript
// phase-coverage-validator.js

/**
 * Validates that all architecture phases are covered by SDs.
 * @param {Object[]} phases - From eva_architecture_plans.sections.implementation_phases
 * @param {Object[]} sds - From strategic_directives_v2 (linked SDs)
 * @returns {Object} Coverage report
 */
export function validatePhaseCoverage(phases, sds) {
  // Returns:
  // {
  //   covered: [{ phase, sd_key, sd_title }],
  //   uncovered: [{ phase }],
  //   coveragePercent: 66.7,
  //   totalPhases: 3,
  //   coveredCount: 2,
  //   passed: false  // true only if coveragePercent === 100
  // }
}

/**
 * Formats coverage report for terminal display.
 * @param {Object} report - From validatePhaseCoverage()
 * @returns {string} Formatted output
 */
export function formatCoverageReport(report) {
  // Returns formatted string showing:
  // ✅ Phase 1: Schema + Clustering → SD-XXX-001-B
  // ✅ Phase 2: SD Promotion → SD-XXX-001-D
  // ❌ Phase 3: Chairman UI → NO SD ASSIGNED (separate orchestrator)
  //
  // Coverage: 2/3 (66.7%) — BLOCKING
}
```

### Gate Integration Point

```javascript
// In lead-to-plan executor (or unified-handoff-system.js):

import { validatePhaseCoverage, formatCoverageReport } from '../validation/phase-coverage-validator.js';

// During LEAD-TO-PLAN gate checks:
async function checkPhaseCoverage(supabase, sdId, archKey) {
  if (!archKey) return { passed: true }; // No arch plan = gate not applicable

  const { data: plan } = await supabase
    .from('eva_architecture_plans')
    .select('sections')
    .eq('plan_key', archKey)
    .single();

  if (!plan?.sections?.implementation_phases) return { passed: true }; // No phases = gate not applicable

  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, parent_sd_id')
    .or(`metadata->>arch_key.eq.${archKey},metadata->>architecture_plan_key.eq.${archKey}`);

  const report = validatePhaseCoverage(plan.sections.implementation_phases, sds);

  if (!report.passed) {
    console.log(formatCoverageReport(report));
    return {
      passed: false,
      error: `Architecture phase coverage incomplete: ${report.coveredCount}/${report.totalPhases} phases covered. Missing: ${report.uncovered.map(u => u.phase.title).join(', ')}`,
      report
    };
  }

  return { passed: true, report };
}
```

## Implementation Phases

### Phase 1: Foundation (~100-150 LOC, 1 SD)

| Component | LOC Est. | Description |
|-----------|----------|-------------|
| `phase-coverage-validator.js` | ~60-80 | Pure validation logic + format output |
| `archplan-command.mjs` changes | ~20-30 | Populate `sections` during upsert using `parsePhases()` |
| `backfill-architecture-sections.js` | ~40 | One-time backfill for existing plans |
| `leo-create-sd.js` advisory | ~15-20 | Non-blocking warning for uncovered phases |
| LEAD-TO-PLAN gate integration | ~20-30 | Blocking check in handoff executor |

**Deliverables:**
1. `phase-coverage-validator.js` with `validatePhaseCoverage()` and `formatCoverageReport()`
2. `sections` column populated on all new architecture plans
3. Backfill script run against existing plans
4. Advisory warning in SD creation
5. Blocking gate at LEAD-TO-PLAN

**Total estimate**: ~150 LOC new + ~50 LOC modified = ~200 LOC

## Testing Strategy

### Unit Tests (`phase-coverage-validator.test.js`)
- All phases covered → passed: true, coveragePercent: 100
- One phase uncovered → passed: false, uncovered array populated
- "Separate orchestrator" phase with `covered_by_sd_key` → correctly counted as covered
- "Separate orchestrator" phase without `covered_by_sd_key` → counted as uncovered
- Empty phases array → passed: true (no phases = nothing to cover)
- Null/undefined sections → passed: true (gate not applicable)

### Integration Tests
- Create architecture plan with 3 phases → create 2 SDs → run gate → blocks
- Create architecture plan with 3 phases → create 3 SDs → run gate → passes
- Existing plan without sections (NULL) → gate passes (not applicable until sections populated)

### Smoke Tests
- Existing handoff smoke tests continue passing (no regression)
- Backfill script runs without errors on current database

## Risk Mitigation

### Risk 1: Phase Parsing Produces Incorrect Results
- **Mitigation**: `parsePhases()` already exists and is tested. Backfill script logs extraction results for manual review. Advisory-first rollout catches parsing issues before blocking enforcement.
- **Fallback**: Manual correction of `sections` JSONB via database update if parsing fails for a specific plan.

### Risk 2: Incremental SD Creation Conflicts
- **Mitigation**: The gate fires at the orchestrator's LEAD-TO-PLAN, not at individual child creation. This means the orchestrator must have all phase SDs lined up before the orchestrator itself proceeds — but children can still be created incrementally as long as all exist before the orchestrator's LEAD-TO-PLAN.
- **Fallback**: If timing is too tight, the advisory warning at SD creation provides early notice of missing phases.

### Risk 3: Plan Mutation After SD Creation
- **Mitigation**: The `sections` column captures phases at plan creation time. Subsequent plan edits should re-extract phases and update `sections`. The gate always reads the current `sections` value.
- **Fallback**: For the initial implementation, plans are treated as immutable once SDs are created against them. Versioning is a future enhancement.

### Risk 4: "Separate Orchestrator" SD Doesn't Exist Yet
- **Mitigation**: The gate reports the uncovered phase with its `child_designation: "separate_orchestrator"` flag, making it clear this isn't a missing child but a missing sibling orchestrator. The error message guides the user to create the separate orchestrator SD.
- **Fallback**: `covered_by_sd_key` can be populated manually via database update if the SD is created through a non-standard path.
