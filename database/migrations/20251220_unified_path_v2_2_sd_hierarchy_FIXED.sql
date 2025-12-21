-- ============================================================================
-- EHG Unified Execution Path v2.2 - SD Hierarchy
-- ============================================================================
-- Date: 2025-12-20
-- Purpose: Seed the 6-Pillar Foundation SD hierarchy
-- Execution: psql or Supabase dashboard
--
-- Hierarchy:
--   SD-PARENT-1.0 (Persistence & Governance Spine)
--     SD-1.1 (System Memory)
--       SD-1.1.1 (Create system_events table)
--     SD-1.2 (State Machine Hardening)
--       SD-1.2.1 (Persist stageStates to DB)
--   SD-PARENT-2.0 (Logic Locking & Genesis Pulse)
--     SD-2.1 (Stage Column Unification)
--       SD-2.1.1 (Standardize current_lifecycle_stage)
--     SD-2.2 (Vertical Genesis Seed)
--       SD-2.2.1 (Seed 6-pillar data structures)
--   SD-PARENT-3.0 (Glass Cockpit Alpha)
--     SD-3.1 (Read-Only Visibility)
--       SD-3.1.1 (Build DecisionDeck component)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PARENT 1.0: The Persistence & Governance Spine
-- Pillars: 2 (Command Engine), 5 (Capital Ledger), 6 (Truth Layer)
-- ============================================================================

INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-1.0',
  'SD-UNIFIED-PATH-1.0',
  'The Persistence & Governance Spine',
  'active',
  'infrastructure',
  'critical',
  'Eradicate "Amnesia" and establish the "Black Box" audit trail. This parent SD addresses the core infrastructure issues identified in the Microscope Audit: in-memory state loss and missing system event tracking.',
  'The Microscope Audit revealed critical issues: venture-state-machine.js uses in-memory Map() causing state loss on restart, and no centralized audit trail exists for system events.',
  'System events table creation, state machine persistence hardening. Out of scope: UI changes, business logic.',
  'infrastructure',
  'parent',
  NULL,
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [2, 5, 6],
    "pillar_names": ["Command Engine", "Capital Ledger", "Truth Layer"],
    "key_outcomes": [
      "system_events table with correlation_id, idempotency_key",
      "Token tracking columns for Capital Ledger",
      "Calibration columns for Truth Layer",
      "State persistence via database, not in-memory Map()"
    ],
    "crisis_resolved": "Amnesia Trap",
    "execution_order": 1
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Child 1.1: System Memory (Governance)
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-1.1',
  'SD-UNIFIED-PATH-1.1',
  'System Memory (Governance)',
  'active',
  'infrastructure',
  'critical',
  'Create the system_events audit log table that will serve as the "Black Box" for all agent actions, state transitions, and resource consumption.',
  'Without centralized event logging, debugging production issues requires manual log analysis. The system_events table provides structured, queryable audit trail.',
  'Table creation with 6-pillar DNA columns. Out of scope: trigger creation, event emission.',
  'infrastructure',
  'child',
  'SD-UNIFIED-PATH-1.0',
  'PLAN_PRD',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [2, 6],
    "pillar_names": ["Command Engine", "Truth Layer"],
    "success_criteria": [
      "system_events table created",
      "RLS enabled with service_role access",
      "Indexes on correlation_id and venture_id",
      "Test INSERT succeeds"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Grandchild 1.1.1: Create system_events table
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-1.1.1',
  'SD-UNIFIED-PATH-1.1.1',
  'Create public.system_events audit table with 6-pillar DNA',
  'active',
  'infrastructure',
  'critical',
  'Execute migration to create system_events table with columns supporting all 6 pillars: event tracking (Pillar 2), token costs (Pillar 5), and calibration delta (Pillar 6).',
  'This is the atomic execution unit. One migration file, one commit.',
  'Single migration: 20251220_create_system_events.sql',
  'infrastructure',
  'child',
  'SD-UNIFIED-PATH-1.1',
  'EXEC_IMPLEMENTATION',
  '{
    "source": "EHG Unified Path v2.2",
    "definition_of_done": [
      "Migration file created: database/migrations/20251220_create_system_events.sql",
      "Table has columns: id, event_type, correlation_id, idempotency_key, agent_id, agent_type, token_cost, budget_remaining, predicted_outcome, actual_outcome, calibration_delta, venture_id, payload, created_at",
      "RLS enabled with service_role full access",
      "Test INSERT via psql returns success"
    ],
    "migration_file": "database/migrations/20251220_create_system_events.sql"
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Child 1.2: State Machine Hardening
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-1.2',
  'SD-UNIFIED-PATH-1.2',
  'State Machine Hardening (Persistence)',
  'draft',
  'infrastructure',
  'high',
  'Refactor venture-state-machine.js to use database as source of truth for stageStates Map, treating in-memory as cache only.',
  'The Microscope Audit identified that stageStates = new Map() causes state loss on server restart. Pending handoffs were already fixed in SD-HARDENING-V2-002C.',
  'Refactor stageStates to query venture_stage_work table. Out of scope: new table creation (uses existing).',
  'infrastructure',
  'child',
  'SD-UNIFIED-PATH-1.0',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [2, 3],
    "pillar_names": ["Command Engine", "Assembly Line"],
    "depends_on": ["SD-UNIFIED-PATH-1.1"],
    "success_criteria": [
      "stageStates reads from venture_stage_work on initialize()",
      "Restart test: kill server, restart, verify state preserved",
      "Unit test created and passes"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Grandchild 1.2.1: Persist stageStates
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-1.2.1',
  'SD-UNIFIED-PATH-1.2.1',
  'Persist stageStates Map to venture_stage_work table',
  'draft',
  'infrastructure',
  'high',
  'Modify venture-state-machine.js to load stageStates from database on initialize() and update database on state changes.',
  'Atomic execution: refactor getStageState() and setStageState() methods.',
  'Single file change: lib/agents/venture-state-machine.js',
  'infrastructure',
  'child',
  'SD-UNIFIED-PATH-1.2',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "definition_of_done": [
      "venture-state-machine.js no longer uses stageStates = new Map() as source of truth",
      "All stageStates reads go through venture_stage_work table query",
      "Restart test: kill server, restart, verify state preserved",
      "Unit test tests/unit/venture-state-machine-persistence.test.js passes"
    ],
    "file_changes": ["lib/agents/venture-state-machine.js"],
    "test_file": "tests/unit/venture-state-machine-persistence.test.js"
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- PARENT 2.0: Logic Locking & The Genesis Pulse
-- Pillars: 3 (Assembly Line), 4 (Crew Registry), 5 (Capital Ledger)
-- ============================================================================

INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-2.0',
  'SD-UNIFIED-PATH-2.0',
  'Logic Locking & The Genesis Pulse',
  'draft',
  'database',
  'high',
  'Unify the schema and seed "Vertical" data (full history) to ensure logical coherence across all 6 pillars.',
  'The Microscope Audit identified "Split-Brain" data: three competing stage columns. Additionally, the system needs seed data to validate all pillar infrastructure.',
  'Stage column unification, 6-pillar data seeding. Out of scope: UI changes.',
  'database',
  'parent',
  NULL,
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [3, 4, 5],
    "pillar_names": ["Assembly Line", "Crew Registry", "Capital Ledger"],
    "key_outcomes": [
      "current_lifecycle_stage is the ONLY canonical stage column",
      "5 ventures with full historical data",
      "agent_registry populated with crew data",
      "capital_transactions seeded"
    ],
    "crisis_resolved": "Split-Brain Data",
    "execution_order": 2,
    "depends_on": ["SD-UNIFIED-PATH-1.0"]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Child 2.1: Stage Column Unification
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-2.1',
  'SD-UNIFIED-PATH-2.1',
  'Stage Column Unification',
  'draft',
  'database',
  'high',
  'Standardize current_lifecycle_stage as the single canonical stage column, deprecating current_workflow_stage and current_stage.',
  'Three competing stage columns create confusion and potential for inconsistent state.',
  'Code audit, column deprecation documentation, migration.',
  'database',
  'child',
  'SD-UNIFIED-PATH-2.0',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [3],
    "pillar_names": ["Assembly Line"],
    "success_criteria": [
      "grep -r current_workflow_stage returns 0 active references",
      "grep -r current_stage returns 0 active references (except column definition)",
      "All code uses current_lifecycle_stage"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Grandchild 2.1.1: Standardize current_lifecycle_stage
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-2.1.1',
  'SD-UNIFIED-PATH-2.1.1',
  'Standardize current_lifecycle_stage as canonical 25-stage truth',
  'draft',
  'database',
  'high',
  'Update all code to use current_lifecycle_stage exclusively. Add migration documenting deprecation.',
  'Atomic execution: code refactor + documentation.',
  'Multiple file changes, one migration for documentation.',
  'database',
  'child',
  'SD-UNIFIED-PATH-2.1',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "definition_of_done": [
      "current_lifecycle_stage is the ONLY stage column used in code",
      "grep -r current_workflow_stage returns 0 active references",
      "grep -r current_stage returns 0 active references (except definition)",
      "Migration documents deprecation of other columns"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Child 2.2: Vertical Genesis Seed
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-2.2',
  'SD-UNIFIED-PATH-2.2',
  'Vertical Genesis Seed',
  'draft',
  'database',
  'medium',
  'Seed 5 ventures with full historical data across all 6 pillars: stage work, system events, agent registry, capital transactions.',
  'The "Glass Cockpit" needs real data to display. Seeding validates all pillar infrastructure works together.',
  'Seed data for all 6 pillars. Out of scope: production data.',
  'database',
  'child',
  'SD-UNIFIED-PATH-2.0',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [3, 4, 5, 6],
    "pillar_names": ["Assembly Line", "Crew Registry", "Capital Ledger", "Truth Layer"],
    "depends_on": ["SD-UNIFIED-PATH-2.1"],
    "success_criteria": [
      "5 ventures have venture_stage_work rows for stages 1-5",
      "Each stage has system_events entries with correlation_id",
      "agent_registry has 5 agent records",
      "capital_transactions has token allocation entries"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Grandchild 2.2.1: Seed all 6-pillar data
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-2.2.1',
  'SD-UNIFIED-PATH-2.2.1',
  'Seed 6-pillar data structures for 5 ventures',
  'draft',
  'database',
  'medium',
  'Execute seed migration with full vertical history: stage_work, system_events, agent_registry, capital_transactions, chairman_directives.',
  'Atomic execution: single seed migration.',
  'Single migration: database/migrations/20251222_genesis_seed.sql',
  'database',
  'child',
  'SD-UNIFIED-PATH-2.2',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "definition_of_done": [
      "5 ventures have venture_stage_work rows for stages 1-5",
      "system_events has >= 25 rows with correlation_id",
      "agent_registry has 5 agent records with agent_type, capabilities, cost_per_action",
      "capital_transactions has token allocations per stage work"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- PARENT 3.0: The Glass Cockpit (Alpha)
-- Pillars: 1 (Glass Cockpit)
-- ============================================================================

INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-3.0',
  'SD-UNIFIED-PATH-3.0',
  'The Glass Cockpit (Alpha)',
  'draft',
  'feature',
  'medium',
  'Light up the "Decision Deck" so the Chairman can see the factory floor. Read-only visibility into pending handoffs and directives.',
  'The Microscope Audit identified "Ghostware" - UI disconnected from database. The Glass Cockpit provides real-time visibility.',
  'Read-only UI component. Out of scope: action buttons, state mutations.',
  'feature',
  'parent',
  NULL,
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [1],
    "pillar_names": ["Glass Cockpit"],
    "key_outcomes": [
      "DecisionDeck component renders pending_ceo_handoffs",
      "DecisionDeck component renders chairman_directives",
      "Read-only queries only (no mutations)",
      "Chairman can see factory floor status"
    ],
    "crisis_resolved": "Ghostware / Chairman Blindness",
    "execution_order": 3,
    "depends_on": ["SD-UNIFIED-PATH-2.0"]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Child 3.1: Read-Only Visibility
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-3.1',
  'SD-UNIFIED-PATH-3.1',
  'Read-Only Visibility',
  'draft',
  'feature',
  'medium',
  'Build the DecisionDeck component with read-only queries to pending_ceo_handoffs and chairman_directives tables.',
  'Read-only first ensures we can see before we act. Prevents accidental state corruption.',
  'React component, Supabase queries, no mutations.',
  'feature',
  'child',
  'SD-UNIFIED-PATH-3.0',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "pillars_addressed": [1],
    "pillar_names": ["Glass Cockpit"],
    "success_criteria": [
      "DecisionDeck.tsx component exists",
      "Queries pending_ceo_handoffs read-only",
      "Queries chairman_directives read-only",
      "No console errors on render"
    ]
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

-- Grandchild 3.1.1: Build DecisionDeck
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority,
  description, rationale, scope,
  sd_type, relationship_type, parent_sd_id, current_phase,
  metadata
) VALUES (
  'SD-UNIFIED-PATH-3.1.1',
  'SD-UNIFIED-PATH-3.1.1',
  'Build DecisionDeck component with read-only queries',
  'draft',
  'feature',
  'medium',
  'Create src/components/decision-deck/DecisionDeck.tsx that displays pending handoffs and recent directives.',
  'Atomic execution: single component file.',
  'Single file: src/components/decision-deck/DecisionDeck.tsx',
  'feature',
  'child',
  'SD-UNIFIED-PATH-3.1',
  'LEAD_APPROVAL',
  '{
    "source": "EHG Unified Path v2.2",
    "definition_of_done": [
      "Component src/components/decision-deck/DecisionDeck.tsx exists",
      "Queries pending_ceo_handoffs and chairman_directives read-only",
      "No INSERT/UPDATE/DELETE queries in component",
      "Renders in EHG app without console errors"
    ],
    "file_path": "src/components/decision-deck/DecisionDeck.tsx"
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  description = EXCLUDED.description,
  parent_sd_id = EXCLUDED.parent_sd_id,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  updated_at = NOW();

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- After running, verify with:
-- SELECT id, title, relationship_type, parent_sd_id, priority, status
-- FROM strategic_directives_v2
-- WHERE id LIKE 'SD-UNIFIED-PATH-%'
-- ORDER BY id;
