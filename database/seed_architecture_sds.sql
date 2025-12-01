-- ============================================================================
-- Seed Strategic Directives for EHG v3.0 Architecture Consolidation
-- ============================================================================
-- Context: Consolidating EHG_Engineer and EHG into a single product "EHG"
-- Target Table: strategic_directives_v2
-- Execution: Run via scripts/execute-database-sql.js
-- Date: 2025-11-29

-- 1) Parent SD – Architecture Consolidation
INSERT INTO strategic_directives_v2 (
  id,
  sd_key,
  title,
  status,
  category,
  priority,
  description,
  rationale,
  scope,
  sd_type,
  relationship_type,
  current_phase,
  metadata
) VALUES (
  'SD-ARCH-EHG-000',
  'SD-ARCH-EHG-000',
  'EHG v3.0 Architecture Consolidation & Governance Hardening',
  'draft',
  'infrastructure',
  'critical',
  'Consolidate EHG_Engineer (Governance) and EHG (Venture Runtime) into a single product architecture with strict schema separation. This is the parent orchestrator SD for all EHG v3.0 architecture work.',
  'The current split between EHG_Engineer and EHG creates "Split Brain" risk where governance says X but runtime says Y. Consolidating into a single Supabase project with schema separation enables EVA to query intent vs reality in a single transaction.',
  'All EHG architecture: database consolidation, schema separation, RLS policies, EVA integration, UI unification.',
  'infrastructure',
  'parent',
  'LEAD_PRE_APPROVAL',
  '{
    "source": "Blueprint v3.0 (Opus 4.5 + Anti-Gravity)",
    "intent": "Consolidate Governance and Runtime into a single Supabase project with strict schema separation.",
    "key_outcomes": [
      "One Supabase project for all of EHG",
      "Three schemas: governance.*, portfolio.*, runtime.*",
      "portfolio.ventures as anchor table",
      "Runtime never writes to governance",
      "Agents always venture-scoped via RLS",
      "EVA has God View via v_intent_vs_reality"
    ],
    "assumptions": "Migration will be performed in phases to minimize downtime.",
    "out_of_scope": "Execution deferred to later PLAN/EXEC phases."
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  sd_key = EXCLUDED.sd_key,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  rationale = EXCLUDED.rationale,
  scope = EXCLUDED.scope,
  sd_type = EXCLUDED.sd_type,
  relationship_type = EXCLUDED.relationship_type,
  current_phase = EXCLUDED.current_phase,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata;

-- 2) Child SD – Database Consolidation (Phase 0)
INSERT INTO strategic_directives_v2 (
  id,
  sd_key,
  title,
  status,
  category,
  priority,
  description,
  rationale,
  scope,
  sd_type,
  relationship_type,
  parent_sd_id,
  current_phase,
  metadata
) VALUES (
  'SD-ARCH-EHG-001',
  'SD-ARCH-EHG-001',
  'Consolidate EHG Databases into Single Supabase Project with Governance/Portfolio/Runtime Schemas',
  'draft',
  'infrastructure',
  'critical',
  'Merge the two Supabase projects (EHG_Engineer and EHG) into a single project with three schemas: governance.*, portfolio.*, runtime.*. This is the critical Phase 0 work that enables all subsequent architecture improvements.',
  'Split database architecture prevents atomic queries across governance and runtime data. EVA cannot efficiently determine intent vs reality without cross-database joins.',
  'Database migration: schema creation, table migration, FK wiring, RLS policies, application re-pointing.',
  'infrastructure',
  'child_phase',
  'SD-ARCH-EHG-000',
  'LEAD_PRE_APPROVAL',
  '{
    "source": "Blueprint v3.0",
    "phase": "Phase 0 - Database Consolidation",
    "success_criteria": [
      "EHG Governance and Venture Layers share one Supabase project (former EHG_Engineer project)",
      "Schemas created: governance.*, portfolio.*, runtime.*",
      "All governance tables moved into governance.* schema",
      "All runtime tables moved into runtime.* schema",
      "All runtime tables reference portfolio.ventures via FKs",
      "governance.audit_logs preserved and append-only",
      "RLS policies for runtime.* tested in staging",
      "No destructive changes in prod until later EXEC SDs"
    ],
    "out_of_scope": "Execution deferred to later PLAN/EXEC phases."
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  sd_key = EXCLUDED.sd_key,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  rationale = EXCLUDED.rationale,
  scope = EXCLUDED.scope,
  sd_type = EXCLUDED.sd_type,
  relationship_type = EXCLUDED.relationship_type,
  parent_sd_id = EXCLUDED.parent_sd_id,
  current_phase = EXCLUDED.current_phase,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata;

-- 3) Child SD – Venture Protocol & Autonomy
INSERT INTO strategic_directives_v2 (
  id,
  sd_key,
  title,
  status,
  category,
  priority,
  description,
  rationale,
  scope,
  sd_type,
  relationship_type,
  parent_sd_id,
  current_phase,
  metadata
) VALUES (
  'SD-ARCH-EHG-002',
  'SD-ARCH-EHG-002',
  'Establish Venture Protocol Anchor & Per-Venture Autonomy Controls',
  'draft',
  'infrastructure',
  'critical',
  'Define portfolio.ventures as the anchor table for all venture data. Implement per-venture autonomy configuration (L0-L4) with kill switch capability. Establish RLS pattern using current_venture() helper function.',
  'Each venture needs independent autonomy levels (L0 advisory to L4 trial mode). Agents must be hard-scoped to specific ventures via RLS to prevent cross-venture data leakage.',
  'Venture Protocol tables, autonomy configuration, RLS helper functions, venture-scoped policies.',
  'infrastructure',
  'child_phase',
  'SD-ARCH-EHG-000',
  'LEAD_PRE_APPROVAL',
  '{
    "source": "Blueprint v3.0",
    "phase": "Phase 2 - Venture Protocol",
    "success_criteria": [
      "portfolio.ventures defined as anchor table for all ventures",
      "portfolio.venture_autonomy_config defined for per-venture L0-L4 autonomy",
      "Columns: autonomy_level, max_allowed_level, kill_switch_active, audit fields",
      "All runtime.* tables reference portfolio.ventures.id",
      "RLS helper function current_venture() implemented and tested",
      "Clear mapping between venture tier, autonomy level, and supervision policies"
    ],
    "out_of_scope": "EVA integration handled in separate SD. This SD focuses on schema and RLS."
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  sd_key = EXCLUDED.sd_key,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  rationale = EXCLUDED.rationale,
  scope = EXCLUDED.scope,
  sd_type = EXCLUDED.sd_type,
  relationship_type = EXCLUDED.relationship_type,
  parent_sd_id = EXCLUDED.parent_sd_id,
  current_phase = EXCLUDED.current_phase,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata;

-- 4) Child SD – Stage Data Contracts & Supervision Policies
INSERT INTO strategic_directives_v2 (
  id,
  sd_key,
  title,
  status,
  category,
  priority,
  description,
  rationale,
  scope,
  sd_type,
  relationship_type,
  parent_sd_id,
  current_phase,
  metadata
) VALUES (
  'SD-ARCH-EHG-003',
  'SD-ARCH-EHG-003',
  'Define Stage Data Contracts & LEO Supervision Policies for All 40 Stages',
  'draft',
  'infrastructure',
  'critical',
  'Create governance.stage_data_contracts table with 40 rows defining input/output schemas for each stage. Create governance.leo_supervision_policies for EVA autonomy rules. Define cross-schema views for EVA God View.',
  'EVA needs formal contracts to understand what each stage requires and produces. Supervision policies define when EVA can act autonomously vs when human approval is required.',
  'Stage data contracts (JSON Schema + TypeScript), supervision policies, cross-schema views.',
  'infrastructure',
  'child_phase',
  'SD-ARCH-EHG-000',
  'LEAD_PRE_APPROVAL',
  '{
    "source": "Blueprint v3.0",
    "phase": "Phase 1 - Schema Contracts",
    "success_criteria": [
      "governance.stage_data_contracts defined with 40 rows (one per stage)",
      "Hybrid schema format: JSON Schema (draft-07) for validation + generated TypeScript for IDE",
      "governance.leo_supervision_policies defined with autonomy rules",
      "Columns: min_autonomy_level, allowed_actions, human_approval_required, mandatory_review_stages",
      "Cross-schema views defined: v_active_stage_contracts, v_venture_supervision, v_intent_vs_reality",
      "Runtime never writes directly to these governance tables"
    ],
    "out_of_scope": "Execution deferred to later PLAN/EXEC phases."
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  sd_key = EXCLUDED.sd_key,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  rationale = EXCLUDED.rationale,
  scope = EXCLUDED.scope,
  sd_type = EXCLUDED.sd_type,
  relationship_type = EXCLUDED.relationship_type,
  parent_sd_id = EXCLUDED.parent_sd_id,
  current_phase = EXCLUDED.current_phase,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata;

-- 5) Child SD – EHG UI Integration (Governance + Venture)
INSERT INTO strategic_directives_v2 (
  id,
  sd_key,
  title,
  status,
  category,
  priority,
  description,
  rationale,
  scope,
  sd_type,
  relationship_type,
  parent_sd_id,
  current_phase,
  metadata
) VALUES (
  'SD-ARCH-EHG-004',
  'SD-ARCH-EHG-004',
  'Integrate EHG Governance UI into EHG Venture UI Under a Unified EHG Experience',
  'draft',
  'infrastructure',
  'critical',
  'Create a single EHG shell application that exposes both Governance Mode (SDs, PRDs, LEO, compliance) and Venture Mode (40-stage workflows, EVA orchestration). Retire the "EHG_Engineer" name in favor of "EHG Governance".',
  'Users should not need to switch between two applications. A unified EHG experience improves usability and reduces context switching. The "EHG_Engineer" name causes confusion.',
  'UI integration, navigation unification, branding alignment, mode switching.',
  'feature',
  'child_phase',
  'SD-ARCH-EHG-000',
  'LEAD_PRE_APPROVAL',
  '{
    "source": "Blueprint v3.0",
    "success_criteria": [
      "Single EHG shell exposing Governance Mode and Venture Mode",
      "Shared visual language and navigation between modes",
      "No user-facing use of EHG_Engineer - replaced by EHG Governance / Governance Mode",
      "Focus on UI integration, not deep EVA autonomy behavior",
      "Clear mode indicator showing which mode user is in"
    ],
    "out_of_scope": "EVA autonomy behavior changes. This SD focuses on UI/UX integration only."
  }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  sd_key = EXCLUDED.sd_key,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  rationale = EXCLUDED.rationale,
  scope = EXCLUDED.scope,
  sd_type = EXCLUDED.sd_type,
  relationship_type = EXCLUDED.relationship_type,
  parent_sd_id = EXCLUDED.parent_sd_id,
  current_phase = EXCLUDED.current_phase,
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- After running, verify with:
-- SELECT id, title, sd_type, relationship_type, parent_sd_id, priority, current_phase
-- FROM strategic_directives_v2
-- WHERE id LIKE 'SD-ARCH-EHG-%'
-- ORDER BY id;
