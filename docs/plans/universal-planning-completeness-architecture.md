# Architecture Plan: Universal Planning Completeness Framework

**Plan Key**: `ARCH-PLAN-COMPLETE-001`
**Vision**: `VISION-PLAN-COMPLETE-L2-001` → [Vision Document](./universal-planning-completeness-vision.md)
**Source Brainstorm**: [brainstorm/2026-03-06-orchestrator-planning-completeness-gate.md](../../brainstorm/2026-03-06-orchestrator-planning-completeness-gate.md)

## Stack & Repository Decisions

- **Repository**: `EHG_Engineer` (backend protocol infrastructure)
- **Database**: Supabase PostgreSQL — 2 new tables, extensions to existing validation infrastructure
- **Runtime**: Node.js ESM modules — consistent with existing gate/handoff infrastructure
- **Validation**: Reuse existing validation patterns (placeholder detection, boilerplate %, structural checks) — no new validation libraries
- **Gate Integration**: Extends `unified-handoff-system.js` executor pipeline — same pattern as existing gates

## Legacy Deprecation Plan

No systems are deprecated. This framework extends the existing gate pipeline:

| Existing Component | Change |
|-------------------|--------|
| `prd-gates.js` (GATE_PRD_EXISTS) | Unchanged — PRD existence remains a separate gate |
| `architecture-plan-validation.js` | Unchanged — advisory architecture check remains |
| `gate-policy-resolver.js` | Extended — new gate registered in `validation_gate_registry` |
| `gate-result-schema.js` | Unchanged — planning completeness gate uses the same return format |
| `validation_gate_registry` (DB table) | Extended — new rows for planning completeness gate per sd_type |

## Route & Component Structure

### New Modules

```
scripts/modules/handoff/executors/plan-to-exec/gates/
  └── planning-completeness-gate.js          # Main gate logic

scripts/modules/planning-completeness/
  ├── artifact-registry.js                    # Query artifact requirements by sd_type
  ├── artifact-validator.js                   # 4-level validation cascade
  ├── validators/
  │   ├── existence-validator.js              # Level 1: artifact record exists
  │   ├── structure-validator.js              # Level 2: required fields present
  │   ├── anti-dummy-validator.js             # Level 3: placeholder + boilerplate detection
  │   └── substance-validator.js              # Level 4: sd_type-specific checks
  └── ring-validators/
      ├── ring1-venture-validator.js           # Venture-level artifact validation
      ├── ring2-orchestrator-validator.js      # Orchestrator-level artifact validation
      └── ring3-sd-validator.js               # Individual SD artifact validation
```

### Modified Modules

```
scripts/modules/handoff/executors/plan-to-exec/
  └── gates/gate-1-plan-to-exec.js           # Register new gate in validator registry

scripts/modules/sd-next/
  └── display/index.js                        # Show artifact completeness in queue display
```

## Data Layer

### New Table: `planning_artifact_types`

Defines what artifacts are required per sd_type. Seeded with initial data.

```sql
CREATE TABLE planning_artifact_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_type TEXT NOT NULL,                    -- feature, infrastructure, database, security, etc.
  artifact_key TEXT NOT NULL,               -- e.g., 'wireframes', 'schema_design', 'threat_model'
  artifact_name TEXT NOT NULL,              -- Human-readable: 'Wireframes / UI Mockups'
  description TEXT,                         -- What this artifact should contain
  ring INTEGER NOT NULL DEFAULT 3,          -- 1=venture, 2=orchestrator, 3=individual
  requirement_level TEXT NOT NULL DEFAULT 'hard',  -- 'hard' (blocking) or 'soft' (advisory)
  structural_schema JSONB,                  -- Required fields/sections for structure validation
  min_content_length INTEGER DEFAULT 50,    -- Minimum character count for substance
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sd_type, artifact_key, ring)
);

-- Index for common query pattern
CREATE INDEX idx_pat_sdtype_ring ON planning_artifact_types(sd_type, ring) WHERE is_active = true;
```

### New Table: `planning_artifacts`

Stores artifact records linked to SDs with validation state.

```sql
CREATE TABLE planning_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,                      -- References strategic_directives_v2.sd_key
  artifact_type_id UUID NOT NULL REFERENCES planning_artifact_types(id),
  artifact_key TEXT NOT NULL,               -- Denormalized for query convenience
  content JSONB,                            -- Structured artifact content
  source_file TEXT,                         -- Optional file path reference
  validation_state TEXT NOT NULL DEFAULT 'pending',  -- pending, passed, failed, warning
  validation_details JSONB,                 -- Last validation result details
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sd_id, artifact_key)
);

-- Index for gate query: "get all artifacts for this SD"
CREATE INDEX idx_pa_sd_id ON planning_artifacts(sd_id);

-- RLS: service role only (protocol infrastructure)
ALTER TABLE planning_artifact_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON planning_artifact_types
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON planning_artifacts
  FOR ALL USING (auth.role() = 'service_role');
```

### Seed Data: Artifact Type Registry

The registry is seeded from the brainstorm's per-sd_type artifact matrices. Example entries:

```sql
-- Feature SD artifacts (Ring 3, hard requirements)
INSERT INTO planning_artifact_types (sd_type, artifact_key, artifact_name, ring, requirement_level, min_content_length, structural_schema)
VALUES
  ('feature', 'acceptance_scenarios', 'Acceptance Scenarios', 3, 'hard', 100,
   '{"required_fields": ["scenarios"], "min_items": 1, "item_fields": ["given", "when", "then"]}'),
  ('feature', 'wireframes', 'Wireframes / UI Mockups', 3, 'hard', 50,
   '{"required_fields": ["screens"], "min_items": 1}'),
  ('feature', 'data_model_changes', 'Data Model Changes', 3, 'hard', 50,
   '{"required_fields": ["changes"], "min_items": 1}'),
  ('feature', 'api_surface', 'API Surface', 3, 'soft', 50,
   '{"required_fields": ["endpoints"], "min_items": 1}'),
  ('feature', 'user_journey', 'User Journey Mapping', 3, 'soft', 50, NULL),
  ('feature', 'accessibility', 'Accessibility Requirements', 3, 'soft', 50, NULL);

-- Database SD artifacts (Ring 3, hard requirements)
INSERT INTO planning_artifact_types (sd_type, artifact_key, artifact_name, ring, requirement_level, min_content_length)
VALUES
  ('database', 'schema_design', 'Schema Design', 3, 'hard', 100),
  ('database', 'migration_plan', 'Migration Plan (Up/Down)', 3, 'hard', 100),
  ('database', 'rls_policy', 'RLS Policy Specification', 3, 'hard', 50),
  ('database', 'backfill_strategy', 'Data Backfill Strategy', 3, 'soft', 50),
  ('database', 'performance_impact', 'Performance Impact Analysis', 3, 'soft', 50),
  ('database', 'rollback_plan', 'Rollback Plan', 3, 'hard', 50);

-- Security SD artifacts (Ring 3, hard requirements)
INSERT INTO planning_artifact_types (sd_type, artifact_key, artifact_name, ring, requirement_level, min_content_length)
VALUES
  ('security', 'threat_model', 'Threat Model', 3, 'hard', 200),
  ('security', 'attack_surface', 'Attack Surface Inventory', 3, 'hard', 100),
  ('security', 'mitigation_strategy', 'Mitigation Strategy', 3, 'hard', 100),
  ('security', 'security_test_plan', 'Security Test Plan', 3, 'hard', 100),
  ('security', 'compliance_checklist', 'Compliance Checklist', 3, 'soft', 50);

-- Bugfix SD artifacts (Ring 3, advisory/soft requirements)
INSERT INTO planning_artifact_types (sd_type, artifact_key, artifact_name, ring, requirement_level, min_content_length)
VALUES
  ('bugfix', 'root_cause_analysis', 'Root Cause Analysis', 3, 'soft', 50),
  ('bugfix', 'reproduction_steps', 'Reproduction Steps', 3, 'soft', 50),
  ('bugfix', 'fix_strategy', 'Fix Strategy', 3, 'soft', 50),
  ('bugfix', 'regression_test_plan', 'Regression Test Plan', 3, 'soft', 50),
  ('bugfix', 'related_issues', 'Related Issues Assessment', 3, 'soft', 50);

-- Additional sd_types: infrastructure, refactor, enhancement, documentation, orchestrator
-- follow same pattern with appropriate artifact keys from brainstorm document
```

### Existing Tables: Gate Registration

```sql
-- Register planning completeness gate in validation_gate_registry
INSERT INTO validation_gate_registry (gate_key, gate_name, phase_transition, is_blocking, sd_types, validator_path)
VALUES
  ('GATE_PLANNING_COMPLETENESS', 'Planning Completeness Gate', 'PLAN-TO-EXEC', true,
   ARRAY['feature', 'database', 'security', 'infrastructure', 'refactor'],
   'scripts/modules/handoff/executors/plan-to-exec/gates/planning-completeness-gate.js');

-- Advisory version for low-risk types
INSERT INTO validation_gate_registry (gate_key, gate_name, phase_transition, is_blocking, sd_types, validator_path)
VALUES
  ('GATE_PLANNING_COMPLETENESS_ADVISORY', 'Planning Completeness Gate (Advisory)', 'PLAN-TO-EXEC', false,
   ARRAY['enhancement', 'bugfix', 'documentation'],
   'scripts/modules/handoff/executors/plan-to-exec/gates/planning-completeness-gate.js');
```

## API Surface

### Internal Module API

```javascript
// artifact-registry.js
export async function getRequiredArtifacts(supabase, sdType, ring = 3) → Array<ArtifactType>
export async function getArtifactsForSD(supabase, sdKey) → Array<PlanningArtifact>

// artifact-validator.js
export async function validateArtifact(artifact, artifactType) → GateResult
export async function validateSDPlanningCompleteness(supabase, sdKey) → GateResult

// planning-completeness-gate.js (gate executor)
export async function execute(context) → GateResult
```

### Gate Result Format (existing schema)

```javascript
{
  passed: boolean,          // true if all hard requirements met
  score: number,            // count of passed checks
  maxScore: number,         // total checks (hard + soft)
  issues: [                 // hard requirement failures
    { code: 'MISSING_ARTIFACT', artifact: 'wireframes', sd_type: 'feature', message: '...' },
    { code: 'PLACEHOLDER_DETECTED', artifact: 'schema_design', pattern: 'tbd', message: '...' }
  ],
  warnings: [               // soft requirement failures
    { code: 'MISSING_OPTIONAL', artifact: 'user_journey', sd_type: 'feature', message: '...' }
  ],
  details: {
    ring: 3,
    sd_type: 'feature',
    artifacts_checked: 6,
    artifacts_passed: 4,
    artifacts_missing: 1,
    artifacts_invalid: 1,
    requirement_level_breakdown: { hard: { total: 3, passed: 2 }, soft: { total: 3, passed: 2 } }
  }
}
```

## Implementation Phases

### Child A: Database Schema
- Create `planning_artifact_types` table
- Create `planning_artifacts` table
- Seed artifact type registry for all 9 sd_types (feature, infrastructure, database, security, refactor, bugfix, enhancement, documentation, orchestrator)
- Register gate in `validation_gate_registry`
- RLS policies

### Child B: Validation Engine
- `artifact-registry.js` — query artifact requirements
- `existence-validator.js` — Level 1 checks
- `structure-validator.js` — Level 2 checks using structural_schema from registry
- `anti-dummy-validator.js` — Level 3 checks reusing placeholder patterns from `prd-quality-validation.js` and boilerplate detection from `handoff-content-quality-validation.js`
- `substance-validator.js` — Level 4 sd_type-specific checks

### Child C: Gate Integration
- `planning-completeness-gate.js` — gate executor wired into plan-to-exec pipeline
- Register in `gate-1-plan-to-exec.js` validator registry
- Ring routing logic: standalone → Ring 3 only; orchestrator child → Ring 2 + 3; venture-linked → Ring 1 + 2 + 3
- Gate policy integration via `gate-policy-resolver.js`

### Child D: Ring Validators
- `ring1-venture-validator.js` — validates venture-level artifacts exist in `eva_vision_documents`
- `ring2-orchestrator-validator.js` — validates orchestrator-level artifacts (architecture plan, dependency map)
- `ring3-sd-validator.js` — validates individual SD artifacts per sd_type

### Child E: Display & Tooling
- Update `sd:next` display to show artifact completeness status
- Update orchestrator preflight to show Ring 2 artifact status
- Activation gating: only enforce on SDs created after framework activation date

### Child F: Testing
- Unit tests for each validator level
- Integration tests for gate pipeline
- Test all 9 sd_types with both complete and incomplete artifacts
- Test hard vs soft requirement behavior
- Test activation gating (grandfathering)
- Test placeholder detection (all 14 patterns)
- Test boilerplate threshold (74% passes, 76% fails)

## Testing Strategy

### Unit Tests
- Each validator module (existence, structure, anti-dummy, substance) tested independently
- Artifact registry queries tested with mock data
- Gate result format validated against `gate-result-schema.js`

### Integration Tests
- Full gate pipeline execution with real Supabase queries
- Test each sd_type through the complete validation cascade
- Test hard requirement failure blocks PLAN-TO-EXEC handoff
- Test soft requirement failure produces warning but passes gate
- Test orchestrator child triggers Ring 2 validation
- Test quick-fix exemption (QFs skip the gate entirely)

### Regression Tests
- Existing PLAN-TO-EXEC gates (PRD existence, architecture validation) still function
- Existing handoff pipeline not disrupted
- sd:next display still works with additional artifact information

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Gate too strict — blocks legitimate SDs | High | Soft requirements for low-risk sd_types. Activation gating for rollout. Monitor gate pass rates. |
| Placeholder detection false positives | Medium | Reuse proven patterns from prd-quality-validation.js (14 patterns, battle-tested). Add "legitimate use" exceptions if discovered. |
| Performance — additional queries at handoff | Low | Artifact queries are simple indexed lookups. Total added latency: <100ms. |
| Migration complexity — seed data accuracy | Medium | Seed data derived directly from brainstorm artifact matrices. Review against actual SD patterns before activation. |
| Existing in-flight SDs disrupted | High | Activation gating: gate only fires for SDs created after activation date. Store activation date in gate config. |
| Quick-fix routing to avoid gate | Medium | Monitor QF creation rate. If spike detected after activation, investigate and adjust thresholds. |
