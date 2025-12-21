-- ============================================================================
-- Migration: Enhance UNIFIED-PATH SDs for LEO Protocol Compliance
-- ============================================================================
-- Date: 2025-12-20
-- Purpose: Add missing strategic_objectives, success_metrics, success_criteria,
--          risks, dependencies, and stakeholders to all UNIFIED-PATH SDs
--
-- LEO Protocol Quality Requirements:
--   - strategic_objectives: Min 2 items, SMART criteria
--   - success_metrics: Min 3 metrics with baseline + target + measurement
--   - success_criteria: Min 3 specific, measurable criteria
--   - risks: Min 1 with mitigation and contingency
--   - dependencies: Technical and business dependencies with status
--   - stakeholders: Roles and responsibilities
--
-- Quality Rubric Weights:
--   - Description: 35%
--   - Strategic Objectives: 30%
--   - Success Metrics: 25%
--   - Risk Assessment: 10%
--
-- Execution: Run via database agent or psql
-- ============================================================================

BEGIN;

-- ============================================================================
-- SD-UNIFIED-PATH-1.0: The Persistence & Governance Spine (PARENT)
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-1.0-001",
      "objective": "Eliminate in-memory state loss (Amnesia) by persisting all runtime state to database",
      "measurable": "100% of state survives server restart within 5 seconds",
      "achievable": "Uses existing venture_stage_work and pending_ceo_handoffs tables",
      "relevant": "Addresses Microscope Audit critical finding",
      "timebound": "Complete within 2 development cycles"
    },
    {
      "id": "OBJ-1.0-002",
      "objective": "Establish system_events as the Black Box audit trail for all agent actions",
      "measurable": "Every state mutation generates a traceable event with correlation_id",
      "achievable": "Single table creation with RLS and helper function",
      "relevant": "Foundation for Pillar 6 (Truth Layer) calibration",
      "timebound": "Table operational within 1 cycle"
    },
    {
      "id": "OBJ-1.0-003",
      "objective": "Enable Capital Ledger tracking via token_cost columns",
      "measurable": "Token consumption tracked per agent action with budget_remaining snapshot",
      "achievable": "Columns added to system_events schema",
      "relevant": "Foundation for Pillar 5 (Capital Ledger)",
      "timebound": "Schema ready in first migration"
    }
  ]'::jsonb,

  success_metrics = '{
    "persistence": {
      "baseline": "0% state survives restart (in-memory Map)",
      "target": "100% state survives restart",
      "measurement_method": "Kill server, restart, verify stage state matches pre-kill",
      "timeline": "Verified after SD-1.2.1 completion"
    },
    "audit_coverage": {
      "baseline": "0 events tracked (no system_events table)",
      "target": "100% of state mutations generate events",
      "measurement_method": "SELECT COUNT(*) FROM system_events WHERE event_type = ''STAGE_TRANSITION''",
      "timeline": "Measurable after SD-1.1.1 completion"
    },
    "token_tracking": {
      "baseline": "No token cost tracking",
      "target": "Every agent action has token_cost recorded",
      "measurement_method": "SELECT AVG(token_cost) FROM system_events WHERE agent_id IS NOT NULL",
      "timeline": "Measurable after Pillar 5 logic implementation"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-1.0-001",
      "criterion": "system_events table exists with all 6-pillar DNA columns",
      "verification": "SELECT column_name FROM information_schema.columns WHERE table_name = ''system_events''",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.0-002",
      "criterion": "venture-state-machine.js uses database as source of truth, not in-memory Map",
      "verification": "Code review: stageStates loaded from venture_stage_work on initialize()",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.0-003",
      "criterion": "Server restart preserves all venture stage state",
      "verification": "Integration test: state before restart === state after restart",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.0-004",
      "criterion": "All RLS policies enable service_role full access",
      "verification": "SELECT * FROM pg_policies WHERE tablename = ''system_events''",
      "priority": "HIGH"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-1.0-001",
      "risk": "Database query latency impacts state machine performance",
      "probability": "medium",
      "severity": "medium",
      "mitigation": "Use read-through cache pattern with JIT freshness check",
      "contingency": "Optimize with connection pooling and query caching",
      "owner": "EXEC"
    },
    {
      "id": "RISK-1.0-002",
      "risk": "Concurrent agents cause race conditions during state transitions",
      "probability": "high",
      "severity": "high",
      "mitigation": "Implement idempotency_key and database-level locking via fn_advance_venture_stage",
      "contingency": "Add optimistic locking with version column",
      "owner": "EXEC"
    },
    {
      "id": "RISK-1.0-003",
      "risk": "Migration fails on production due to existing data constraints",
      "probability": "low",
      "severity": "high",
      "mitigation": "All migrations use IF NOT EXISTS and ON CONFLICT DO UPDATE",
      "contingency": "Rollback script prepared for each migration",
      "owner": "DATABASE"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-1.0-001",
      "dependency": "ventures table exists with current_lifecycle_stage column",
      "type": "technical",
      "status": "ready",
      "notes": "Confirmed in Microscope Audit"
    },
    {
      "id": "DEP-1.0-002",
      "dependency": "venture_stage_work table exists for stage state persistence",
      "type": "technical",
      "status": "ready",
      "notes": "Already used by state machine for loading"
    },
    {
      "id": "DEP-1.0-003",
      "dependency": "pending_ceo_handoffs table exists",
      "type": "technical",
      "status": "ready",
      "notes": "Already hardened in SD-HARDENING-V2-002C"
    },
    {
      "id": "DEP-1.0-004",
      "dependency": "Supabase service_role key available for RLS bypass",
      "type": "infrastructure",
      "status": "ready",
      "notes": "Configured in .env"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "Chairman",
      "role": "Executive Sponsor",
      "involvement": "Approves final hierarchy, validates 6-pillar coverage"
    },
    {
      "name": "LEAD Agent",
      "role": "Strategic Validator",
      "involvement": "Approves SD scope, ensures strategic alignment"
    },
    {
      "name": "PLAN Agent",
      "role": "Technical Architect",
      "involvement": "Designs implementation approach, creates PRD"
    },
    {
      "name": "EXEC Agent",
      "role": "Implementer",
      "involvement": "Writes code, runs tests, creates migrations"
    },
    {
      "name": "DATABASE Sub-Agent",
      "role": "Schema Validator",
      "involvement": "Validates migrations, checks RLS policies"
    }
  ]'::jsonb,

  target_application = 'EHG_Engineer',
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-1.0';

-- ============================================================================
-- SD-UNIFIED-PATH-1.1: System Memory (Governance)
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-1.1-001",
      "objective": "Create system_events table as central audit log",
      "measurable": "Table exists with 16 columns supporting all 6 pillars",
      "achievable": "Single CREATE TABLE migration",
      "relevant": "Foundation for Command Engine and Truth Layer",
      "timebound": "Immediate (first execution)"
    },
    {
      "id": "OBJ-1.1-002",
      "objective": "Enable event correlation via correlation_id and parent_event_id",
      "measurable": "Related events can be queried via correlation chain",
      "achievable": "UUID columns with FK and indexes",
      "relevant": "Required for Event Linking Pattern",
      "timebound": "Included in initial schema"
    }
  ]'::jsonb,

  success_metrics = '{
    "table_creation": {
      "baseline": "Table does not exist",
      "target": "Table exists with all columns",
      "measurement_method": "\\d system_events returns 16+ columns",
      "timeline": "After migration execution"
    },
    "rls_security": {
      "baseline": "No policies",
      "target": "3 policies (service_role, authenticated, anon)",
      "measurement_method": "SELECT COUNT(*) FROM pg_policies WHERE tablename = ''system_events''",
      "timeline": "After migration execution"
    },
    "helper_function": {
      "baseline": "No function",
      "target": "fn_log_system_event() operational",
      "measurement_method": "SELECT fn_log_system_event(''TEST'') returns UUID",
      "timeline": "After migration execution"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-1.1-001",
      "criterion": "system_events table has correlation_id and idempotency_key columns",
      "verification": "Schema inspection shows both columns",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.1-002",
      "criterion": "RLS enabled with service_role full access",
      "verification": "Policy query confirms service_role ALL policy",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.1-003",
      "criterion": "Test INSERT succeeds via psql or fn_log_system_event",
      "verification": "INSERT returns UUID, SELECT confirms row",
      "priority": "HIGH"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-1.1-001",
      "risk": "Table bloat from high-volume event logging",
      "probability": "medium",
      "severity": "low",
      "mitigation": "Add partition by created_at month in future iteration",
      "contingency": "VACUUM and archival policy",
      "owner": "DATABASE"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-1.1-001",
      "dependency": "Database connection available",
      "type": "infrastructure",
      "status": "ready",
      "notes": "Pooler URL configured"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "EXEC Agent",
      "role": "Migration Author",
      "involvement": "Creates and tests migration SQL"
    },
    {
      "name": "DATABASE Sub-Agent",
      "role": "Schema Reviewer",
      "involvement": "Validates column types and constraints"
    }
  ]'::jsonb,

  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-1.1';

-- ============================================================================
-- SD-UNIFIED-PATH-1.1.1: Create system_events table
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-1.1.1-001",
      "objective": "Execute single migration creating system_events with 6-pillar DNA",
      "measurable": "Migration file exists and executes without error",
      "achievable": "Standard CREATE TABLE with IF NOT EXISTS",
      "relevant": "Atomic grandchild deliverable",
      "timebound": "Single commit"
    }
  ]'::jsonb,

  success_metrics = '{
    "migration_success": {
      "baseline": "No table",
      "target": "Table created, 1 test row inserted",
      "measurement_method": "SELECT COUNT(*) FROM system_events = 1",
      "timeline": "Immediate on execution"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-1.1.1-001",
      "criterion": "Migration file created at database/migrations/20251220_create_system_events.sql",
      "verification": "File exists and is valid SQL",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.1.1-002",
      "criterion": "All 16 columns present per schema specification",
      "verification": "Column count matches specification",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.1.1-003",
      "criterion": "RLS policies created for service_role, authenticated, anon",
      "verification": "pg_policies query returns 3 rows",
      "priority": "HIGH"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-1.1.1-001",
      "risk": "Migration conflicts with existing table",
      "probability": "low",
      "severity": "medium",
      "mitigation": "IF NOT EXISTS clause on all DDL",
      "contingency": "DROP and recreate if needed",
      "owner": "EXEC"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-1.1.1-001",
      "dependency": "Parent SD-1.1 approved",
      "type": "governance",
      "status": "ready",
      "notes": "Parent is active"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "EXEC Agent",
      "role": "Implementer",
      "involvement": "Creates and executes migration"
    }
  ]'::jsonb,

  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-1.1.1';

-- ============================================================================
-- SD-UNIFIED-PATH-1.1.1-PATCH: Add causality columns
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-PATCH-001",
      "objective": "Add Event Linking Pattern columns for immutable audit trail",
      "measurable": "parent_event_id, actor_type, actor_role columns exist",
      "achievable": "ALTER TABLE ADD COLUMN",
      "relevant": "Strategic Audit requirement from Codex + Anti-Gravity",
      "timebound": "Single migration"
    },
    {
      "id": "OBJ-PATCH-002",
      "objective": "Enable calibration without mutating original events",
      "measurable": "Outcome events link to prediction events via parent_event_id FK",
      "achievable": "Self-referential FK on system_events",
      "relevant": "Pillar 6 Truth Layer immutability requirement",
      "timebound": "Included in patch migration"
    }
  ]'::jsonb,

  success_metrics = '{
    "column_addition": {
      "baseline": "0 causality columns",
      "target": "3 columns added (parent_event_id, actor_type, actor_role)",
      "measurement_method": "SELECT column_name FROM information_schema.columns WHERE table_name = ''system_events'' AND column_name IN (''parent_event_id'', ''actor_type'', ''actor_role'')",
      "timeline": "After patch migration"
    },
    "fk_constraint": {
      "baseline": "No self-referential FK",
      "target": "parent_event_id REFERENCES system_events(id)",
      "measurement_method": "Check pg_constraint for FK",
      "timeline": "After patch migration"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-PATCH-001",
      "criterion": "parent_event_id UUID column with FK to system_events(id)",
      "verification": "Column exists with proper constraint",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-PATCH-002",
      "criterion": "actor_type VARCHAR(20) with CHECK (actor_type IN (''human'', ''agent'', ''system''))",
      "verification": "CHECK constraint in pg_constraint",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-PATCH-003",
      "criterion": "actor_role VARCHAR(50) for specific role identification",
      "verification": "Column exists",
      "priority": "HIGH"
    },
    {
      "id": "SC-PATCH-004",
      "criterion": "Index on parent_event_id for causality queries",
      "verification": "Index exists in pg_indexes",
      "priority": "MEDIUM"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-PATCH-001",
      "risk": "ALTER TABLE on table with existing data fails",
      "probability": "low",
      "severity": "low",
      "mitigation": "All columns are nullable, no data migration needed",
      "contingency": "Drop columns and retry",
      "owner": "EXEC"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-PATCH-001",
      "dependency": "system_events table exists (SD-1.1.1 complete)",
      "type": "technical",
      "status": "ready",
      "notes": "Table created in prior migration"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "Strategic Audit Team (Codex + Anti-Gravity)",
      "role": "Requirement Source",
      "involvement": "Defined Event Linking Pattern requirement"
    },
    {
      "name": "EXEC Agent",
      "role": "Implementer",
      "involvement": "Creates patch migration"
    }
  ]'::jsonb,

  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-1.1.1-PATCH';

-- ============================================================================
-- SD-UNIFIED-PATH-1.2: State Machine Hardening
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-1.2-001",
      "objective": "Eliminate in-memory stageStates Map as source of truth",
      "measurable": "All state reads go through database query",
      "achievable": "Refactor getStageState() to query venture_stage_work",
      "relevant": "Addresses Amnesia Trap from Microscope Audit",
      "timebound": "Single refactor cycle"
    },
    {
      "id": "OBJ-1.2-002",
      "objective": "Implement JIT Truth Check before state mutations",
      "measurable": "verifyStateFreshness() called before _approveHandoff()",
      "achievable": "Add method and call site",
      "relevant": "Prevents Split-Brain state from concurrent agents",
      "timebound": "Included in refactor"
    }
  ]'::jsonb,

  success_metrics = '{
    "restart_persistence": {
      "baseline": "State lost on restart",
      "target": "State survives restart within 5 seconds",
      "measurement_method": "Integration test: kill server, restart, verify state",
      "timeline": "After SD-1.2.1 completion"
    },
    "freshness_check": {
      "baseline": "No freshness verification",
      "target": "100% of mutations preceded by DB check",
      "measurement_method": "Code coverage of verifyStateFreshness()",
      "timeline": "After SD-1.2.1 completion"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-1.2-001",
      "criterion": "stageStates Map is cache only, not source of truth",
      "verification": "Code review confirms all reads query DB first",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.2-002",
      "criterion": "verifyStateFreshness() throws StateStalenessError on mismatch",
      "verification": "Unit test confirms error thrown",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.2-003",
      "criterion": "Restart test passes",
      "verification": "State before === state after restart",
      "priority": "CRITICAL"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-1.2-001",
      "risk": "Performance regression from DB queries on every state access",
      "probability": "medium",
      "severity": "medium",
      "mitigation": "Cache with JIT freshness check, not cache-first",
      "contingency": "Add query result caching with TTL",
      "owner": "EXEC"
    },
    {
      "id": "RISK-1.2-002",
      "risk": "StateStalenessError causes infinite retry loops",
      "probability": "low",
      "severity": "high",
      "mitigation": "Error is retryable but with max retry count",
      "contingency": "Add exponential backoff",
      "owner": "EXEC"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-1.2-001",
      "dependency": "SD-1.1 complete (system_events exists for audit)",
      "type": "governance",
      "status": "ready",
      "notes": "Audit trail ready for state change logging"
    },
    {
      "id": "DEP-1.2-002",
      "dependency": "venture_stage_work table has required columns",
      "type": "technical",
      "status": "ready",
      "notes": "Confirmed in initialize() code"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "PLAN Agent",
      "role": "Architecture Designer",
      "involvement": "Defines JIT Truth Check pattern"
    },
    {
      "name": "EXEC Agent",
      "role": "Implementer",
      "involvement": "Refactors venture-state-machine.js"
    },
    {
      "name": "TESTING Sub-Agent",
      "role": "Test Creator",
      "involvement": "Creates restart and concurrency tests"
    }
  ]'::jsonb,

  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-1.2';

-- ============================================================================
-- SD-UNIFIED-PATH-1.2.1: Persist stageStates to venture_stage_work
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-1.2.1-001",
      "objective": "Refactor venture-state-machine.js to use DB as source of truth",
      "measurable": "getStageState() queries venture_stage_work table",
      "achievable": "Modify existing method",
      "relevant": "Atomic grandchild execution",
      "timebound": "Single commit"
    }
  ]'::jsonb,

  success_metrics = '{
    "code_change": {
      "baseline": "stageStates = new Map() is source of truth",
      "target": "venture_stage_work is source of truth",
      "measurement_method": "Code diff shows DB query in getStageState()",
      "timeline": "After commit"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-1.2.1-001",
      "criterion": "verifyStateFreshness() method added",
      "verification": "Method exists in class",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.2.1-002",
      "criterion": "_approveHandoff() calls verifyStateFreshness() first",
      "verification": "Call site exists before mutation",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-1.2.1-003",
      "criterion": "Unit test verifies restart persistence",
      "verification": "Test file exists and passes",
      "priority": "HIGH"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-1.2.1-001",
      "risk": "Refactor breaks existing handoff flow",
      "probability": "medium",
      "severity": "high",
      "mitigation": "Unit tests for all existing methods before refactor",
      "contingency": "Git revert to prior commit",
      "owner": "EXEC"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-1.2.1-001",
      "dependency": "Parent SD-1.2 approved",
      "type": "governance",
      "status": "ready",
      "notes": "Design pattern defined in parent"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "EXEC Agent",
      "role": "Implementer",
      "involvement": "Modifies venture-state-machine.js"
    }
  ]'::jsonb,

  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-1.2.1';

-- ============================================================================
-- SD-UNIFIED-PATH-2.0: Logic Locking & The Genesis Pulse (PARENT)
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-2.0-001",
      "objective": "Unify stage columns to single canonical truth",
      "measurable": "current_lifecycle_stage is the ONLY stage column used in code",
      "achievable": "Code refactor and deprecation documentation",
      "relevant": "Resolves Split-Brain Data from Microscope Audit",
      "timebound": "Within 2 cycles"
    },
    {
      "id": "OBJ-2.0-002",
      "objective": "Seed 5 ventures with full 6-pillar historical data",
      "measurable": "Each venture has stage_work, system_events, agent_registry, capital_transactions",
      "achievable": "Comprehensive seed migration",
      "relevant": "Validates all pillar infrastructure works together",
      "timebound": "After stage unification"
    }
  ]'::jsonb,

  success_metrics = '{
    "stage_unification": {
      "baseline": "3 competing stage columns (current_lifecycle_stage, current_workflow_stage, current_stage)",
      "target": "1 canonical column (current_lifecycle_stage)",
      "measurement_method": "grep returns 0 active references to deprecated columns",
      "timeline": "After SD-2.1.1"
    },
    "seed_coverage": {
      "baseline": "0 ventures with full history",
      "target": "5 ventures with complete pillar data",
      "measurement_method": "SELECT COUNT(*) FROM ventures WHERE has_full_history = true",
      "timeline": "After SD-2.2.1"
    }
  }'::jsonb,

  success_criteria = '[
    {
      "id": "SC-2.0-001",
      "criterion": "No code references current_workflow_stage or current_stage",
      "verification": "grep -r returns 0 matches in active code",
      "priority": "CRITICAL"
    },
    {
      "id": "SC-2.0-002",
      "criterion": "5 ventures have venture_stage_work rows for stages 1-5",
      "verification": "Query returns 25 rows (5 ventures x 5 stages)",
      "priority": "HIGH"
    },
    {
      "id": "SC-2.0-003",
      "criterion": "system_events has >= 25 rows with correlation_id",
      "verification": "Query count >= 25",
      "priority": "HIGH"
    }
  ]'::jsonb,

  risks = '[
    {
      "id": "RISK-2.0-001",
      "risk": "Deprecating stage columns breaks existing queries",
      "probability": "medium",
      "severity": "medium",
      "mitigation": "Audit all queries before removal, add views for compatibility",
      "contingency": "Keep deprecated columns as computed fields",
      "owner": "PLAN"
    },
    {
      "id": "RISK-2.0-002",
      "risk": "Seeded ventures fail Gate Validation due to missing artifacts",
      "probability": "high",
      "severity": "high",
      "mitigation": "Artifact-Deep Seeding pattern synthesizes required JSON blobs",
      "contingency": "Add placeholder artifacts with explicit TODOs",
      "owner": "EXEC"
    }
  ]'::jsonb,

  dependencies = '[
    {
      "id": "DEP-2.0-001",
      "dependency": "SD-PARENT-1.0 complete (system_events exists)",
      "type": "governance",
      "status": "ready",
      "notes": "Seeding needs event table for historical data"
    },
    {
      "id": "DEP-2.0-002",
      "dependency": "agent_registry table exists or will be created",
      "type": "technical",
      "status": "pending",
      "notes": "May need schema creation for Pillar 4 data"
    }
  ]'::jsonb,

  stakeholders = '[
    {
      "name": "Chairman",
      "role": "Data Validator",
      "involvement": "Reviews seeded ventures for realism"
    },
    {
      "name": "PLAN Agent",
      "role": "Architect",
      "involvement": "Designs stage unification and seeding approach"
    },
    {
      "name": "EXEC Agent",
      "role": "Implementer",
      "involvement": "Refactors code and creates seed migration"
    }
  ]'::jsonb,

  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-2.0';

-- ============================================================================
-- SD-UNIFIED-PATH-2.1, 2.1.1, 2.2, 2.2.1 (Stage Unification and Seeding)
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-2.1-001",
      "objective": "Deprecate current_workflow_stage and current_stage columns",
      "measurable": "Zero active code references to deprecated columns",
      "achievable": "Search and replace with code review",
      "relevant": "Eliminates Split-Brain confusion",
      "timebound": "Single refactor cycle"
    }
  ]'::jsonb,
  success_metrics = '{"column_unification": {"baseline": "3 columns", "target": "1 column", "measurement_method": "grep -r", "timeline": "After refactor"}}'::jsonb,
  success_criteria = '[{"id": "SC-2.1-001", "criterion": "Only current_lifecycle_stage used", "verification": "grep returns 0", "priority": "CRITICAL"}]'::jsonb,
  risks = '[{"id": "RISK-2.1-001", "risk": "Breaking existing queries", "probability": "medium", "severity": "medium", "mitigation": "Audit before removal", "owner": "PLAN"}]'::jsonb,
  dependencies = '[{"id": "DEP-2.1-001", "dependency": "SD-2.0 approved", "type": "governance", "status": "ready"}]'::jsonb,
  stakeholders = '[{"name": "EXEC Agent", "role": "Implementer", "involvement": "Refactors code"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-2.1';

UPDATE strategic_directives_v2 SET
  description = 'Update all code to use current_lifecycle_stage exclusively. Add migration documenting deprecation of other stage columns.',
  rationale = 'Atomic execution: code refactor + documentation. Resolves Split-Brain Data issue.',
  strategic_objectives = '[{"id": "OBJ-2.1.1-001", "objective": "Refactor all stage references to current_lifecycle_stage", "measurable": "grep returns 0 deprecated references", "achievable": "Search and replace", "relevant": "Atomic grandchild", "timebound": "Single commit"}]'::jsonb,
  success_metrics = '{"refactor": {"baseline": "Multiple columns used", "target": "Single column used", "measurement_method": "grep verification", "timeline": "After commit"}}'::jsonb,
  success_criteria = '[{"id": "SC-2.1.1-001", "criterion": "grep returns 0 for deprecated columns", "verification": "Command output", "priority": "CRITICAL"}]'::jsonb,
  risks = '[{"id": "RISK-2.1.1-001", "risk": "Missed reference", "probability": "low", "severity": "low", "mitigation": "Multiple grep patterns", "owner": "EXEC"}]'::jsonb,
  dependencies = '[{"id": "DEP-2.1.1-001", "dependency": "Parent SD-2.1 approved", "type": "governance", "status": "ready"}]'::jsonb,
  stakeholders = '[{"name": "EXEC Agent", "role": "Implementer", "involvement": "Executes refactor"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-2.1.1';

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[{"id": "OBJ-2.2-001", "objective": "Seed comprehensive historical data for 5 ventures", "measurable": "All 6 pillars have data for each venture", "achievable": "Seed migration", "relevant": "Validates infrastructure", "timebound": "After stage unification"}]'::jsonb,
  success_metrics = '{"seed_coverage": {"baseline": "0 ventures", "target": "5 ventures with full history", "measurement_method": "Query count", "timeline": "After migration"}}'::jsonb,
  success_criteria = '[{"id": "SC-2.2-001", "criterion": "5 ventures × 5 stages = 25 venture_stage_work rows", "verification": "Query count", "priority": "HIGH"}]'::jsonb,
  risks = '[{"id": "RISK-2.2-001", "risk": "Radioactive Ventures without artifacts", "probability": "high", "severity": "high", "mitigation": "Artifact-Deep Seeding pattern", "owner": "EXEC"}]'::jsonb,
  dependencies = '[{"id": "DEP-2.2-001", "dependency": "SD-2.1 complete", "type": "governance", "status": "pending"}]'::jsonb,
  stakeholders = '[{"name": "EXEC Agent", "role": "Implementer", "involvement": "Creates seed migration"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-2.2';

UPDATE strategic_directives_v2 SET
  description = 'Execute seed migration with full vertical history: stage_work, system_events, agent_registry, capital_transactions, chairman_directives.',
  rationale = 'Atomic execution: single seed migration. Validates all 6 pillars work together.',
  strategic_objectives = '[{"id": "OBJ-2.2.1-001", "objective": "Create Artifact-Deep seed for 5 ventures", "measurable": "Each venture passes fn_validate_stage_artifacts()", "achievable": "Comprehensive INSERT statements", "relevant": "Prevents Radioactive Ventures", "timebound": "Single migration"}]'::jsonb,
  success_metrics = '{"artifact_depth": {"baseline": "0 artifacts", "target": "Proper JSON artifacts per stage", "measurement_method": "Gate Validation passes", "timeline": "After seed"}}'::jsonb,
  success_criteria = '[{"id": "SC-2.2.1-001", "criterion": "system_events >= 25 rows", "verification": "Query count", "priority": "HIGH"}, {"id": "SC-2.2.1-002", "criterion": "Each venture has proper artifacts", "verification": "Validation function", "priority": "CRITICAL"}]'::jsonb,
  risks = '[{"id": "RISK-2.2.1-001", "risk": "Seed conflicts with existing data", "probability": "low", "severity": "medium", "mitigation": "ON CONFLICT DO UPDATE", "owner": "EXEC"}]'::jsonb,
  dependencies = '[{"id": "DEP-2.2.1-001", "dependency": "Parent SD-2.2 approved", "type": "governance", "status": "pending"}]'::jsonb,
  stakeholders = '[{"name": "EXEC Agent", "role": "Implementer", "involvement": "Creates seed"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-2.2.1';

-- ============================================================================
-- SD-UNIFIED-PATH-3.0, 3.1, 3.1.1 (Glass Cockpit)
-- ============================================================================

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[
    {
      "id": "OBJ-3.0-001",
      "objective": "Provide Chairman visibility into pending handoffs and directives",
      "measurable": "DecisionDeck component renders live data from database",
      "achievable": "React component with Supabase queries",
      "relevant": "Addresses Chairman Blindness and Ghostware issues",
      "timebound": "After data foundation complete"
    }
  ]'::jsonb,
  success_metrics = '{"visibility": {"baseline": "Chairman is blind to pending work", "target": "Real-time visibility into handoffs and directives", "measurement_method": "Component renders without errors", "timeline": "After SD-3.1.1"}}'::jsonb,
  success_criteria = '[{"id": "SC-3.0-001", "criterion": "DecisionDeck displays pending_ceo_handoffs", "verification": "Component renders data", "priority": "CRITICAL"}, {"id": "SC-3.0-002", "criterion": "No INSERT/UPDATE/DELETE queries in component", "verification": "Code review", "priority": "HIGH"}]'::jsonb,
  risks = '[{"id": "RISK-3.0-001", "risk": "Read-only queries still expose sensitive data", "probability": "low", "severity": "medium", "mitigation": "RLS policies enforce Chairman-only access", "owner": "SECURITY"}]'::jsonb,
  dependencies = '[{"id": "DEP-3.0-001", "dependency": "SD-PARENT-2.0 complete", "type": "governance", "status": "pending"}]'::jsonb,
  stakeholders = '[{"name": "Chairman", "role": "Primary User", "involvement": "Uses DecisionDeck for oversight"}, {"name": "DESIGN Sub-Agent", "role": "UI Designer", "involvement": "Reviews component layout"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-3.0';

UPDATE strategic_directives_v2 SET
  scope = 'React component, Supabase queries, no mutations. Out of scope: action buttons, state changes.',
  strategic_objectives = '[{"id": "OBJ-3.1-001", "objective": "Build read-only visibility component", "measurable": "Component renders pending_ceo_handoffs and chairman_directives", "achievable": "Standard React + Supabase pattern", "relevant": "First Glass Cockpit deliverable", "timebound": "After data seeding"}]'::jsonb,
  success_metrics = '{"component": {"baseline": "No visibility component", "target": "DecisionDeck renders correctly", "measurement_method": "No console errors on render", "timeline": "After SD-3.1.1"}}'::jsonb,
  success_criteria = '[{"id": "SC-3.1-001", "criterion": "Component file exists at specified path", "verification": "File exists", "priority": "CRITICAL"}]'::jsonb,
  risks = '[{"id": "RISK-3.1-001", "risk": "Component complexity exceeds 600 LOC", "probability": "low", "severity": "low", "mitigation": "Split into sub-components if needed", "owner": "EXEC"}]'::jsonb,
  dependencies = '[{"id": "DEP-3.1-001", "dependency": "Parent SD-3.0 approved", "type": "governance", "status": "pending"}]'::jsonb,
  stakeholders = '[{"name": "EXEC Agent", "role": "Implementer", "involvement": "Creates component"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-3.1';

UPDATE strategic_directives_v2 SET
  strategic_objectives = '[{"id": "OBJ-3.1.1-001", "objective": "Create DecisionDeck.tsx component", "measurable": "File exists and renders without errors", "achievable": "Single component file", "relevant": "Atomic grandchild", "timebound": "Single commit"}]'::jsonb,
  success_metrics = '{"implementation": {"baseline": "No component", "target": "Component renders", "measurement_method": "npm run dev shows component", "timeline": "After commit"}}'::jsonb,
  success_criteria = '[{"id": "SC-3.1.1-001", "criterion": "File at src/components/decision-deck/DecisionDeck.tsx", "verification": "File exists", "priority": "CRITICAL"}, {"id": "SC-3.1.1-002", "criterion": "No console errors on render", "verification": "Browser console clean", "priority": "HIGH"}]'::jsonb,
  risks = '[{"id": "RISK-3.1.1-001", "risk": "RLS blocks queries", "probability": "medium", "severity": "medium", "mitigation": "Verify authenticated user has Chairman role", "owner": "EXEC"}]'::jsonb,
  dependencies = '[{"id": "DEP-3.1.1-001", "dependency": "Parent SD-3.1 approved", "type": "governance", "status": "pending"}]'::jsonb,
  stakeholders = '[{"name": "EXEC Agent", "role": "Implementer", "involvement": "Creates component file"}]'::jsonb,
  updated_at = NOW()
WHERE id = 'SD-UNIFIED-PATH-3.1.1';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- After running, verify completeness with:
--
-- SELECT
--   id,
--   CASE WHEN strategic_objectives != '[]'::jsonb THEN 'OK' ELSE 'MISSING' END as objectives,
--   CASE WHEN success_metrics != '{}'::jsonb THEN 'OK' ELSE 'MISSING' END as metrics,
--   CASE WHEN success_criteria != '[]'::jsonb THEN 'OK' ELSE 'MISSING' END as criteria,
--   CASE WHEN risks != '[]'::jsonb THEN 'OK' ELSE 'MISSING' END as risks,
--   CASE WHEN dependencies != '[]'::jsonb THEN 'OK' ELSE 'MISSING' END as deps,
--   CASE WHEN stakeholders != '[]'::jsonb THEN 'OK' ELSE 'MISSING' END as stakeholders
-- FROM strategic_directives_v2
-- WHERE id LIKE 'SD-UNIFIED-PATH-%'
-- ORDER BY id;
