-- ============================================================================
-- Migration: Artifact-Deep Seeding (6-Pillar Genesis Pulse) - FINAL (VALIDATED)
-- ============================================================================
-- Date: 2025-12-20
-- SD: SD-UNIFIED-PATH-2.2.1
-- Purpose: Seed 5 ventures with comprehensive 6-pillar historical data
-- Status: ✅ EXECUTED SUCCESSFULLY
--
-- SCHEMA ALIGNMENT (VALIDATED):
-- - agent_registry.id = UUID (gen_random_uuid())
-- - agent_registry requires hierarchy_level (2-4) and hierarchy_path (ltree)
-- - venture_stage_work uses advisory_data (JSONB), not work_artifacts
-- - venture_stage_work requires work_type ('artifact_only', 'automated_check', etc.)
-- - pending_ceo_handoffs.id = UUID, vp_agent_id = text
-- - system_events.agent_id = UUID
--
-- The 6 Pillars (ALL VERIFIED):
--   1. Glass Cockpit - 2 pending_ceo_handoffs ✅
--   2. Command Engine - 14 system_events (11 transitions, 3 actions) ✅
--   3. Assembly Line - 32 venture_stage_work rows (5+8+3+6+10) ✅
--   4. Crew Registry - 5 agents (2 CEOs, 2 VPs, 1 crew) ✅
--   5. Capital Ledger - 3,315 tokens tracked ✅
--   6. Truth Layer - 11 events with prediction/outcome calibration ✅
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Create 5 Demo Ventures
-- ============================================================================

INSERT INTO public.ventures (
  id, name, description, status, current_lifecycle_stage,
  created_at, updated_at, is_demo
) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Solara Energy', 'Next-gen solar panel efficiency optimization using AI', 'active', 5, NOW() - INTERVAL '30 days', NOW(), true),
  ('22222222-2222-2222-2222-222222222222', 'MedSync AI', 'Healthcare patient data synchronization platform', 'active', 8, NOW() - INTERVAL '45 days', NOW(), true),
  ('33333333-3333-3333-3333-333333333333', 'FinTrack Pro', 'Personal finance automation for small businesses', 'active', 3, NOW() - INTERVAL '15 days', NOW(), true),
  ('44444444-4444-4444-4444-444444444444', 'EduPath AI', 'Personalized learning path generation for students', 'paused', 6, NOW() - INTERVAL '60 days', NOW(), true),
  ('55555555-5555-5555-5555-555555555555', 'GreenLogistics', 'Carbon-neutral supply chain optimization', 'active', 10, NOW() - INTERVAL '90 days', NOW(), true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- ============================================================================
-- SECTION 2: Pillar 4 - Crew Registry (Agent Registry)
-- ============================================================================

INSERT INTO public.agent_registry (
  id, agent_type, display_name, description, status, capabilities,
  hierarchy_level, hierarchy_path, venture_id, created_at
) VALUES
  -- CEO Agents (Level 2 under Chairman)
  ('aaaaaaaa-1111-1111-1111-111111111111'::uuid, 'venture_ceo', 'Solara CEO Agent', 'CEO agent for Solara Energy venture', 'active', ARRAY['stage_transitions', 'handoff_approval']::text[], 2, 'chairman.ceo_solara'::ltree, '11111111-1111-1111-1111-111111111111', NOW() - INTERVAL '30 days'),
  ('aaaaaaaa-2222-2222-2222-222222222222'::uuid, 'venture_ceo', 'MedSync CEO Agent', 'CEO agent for MedSync AI venture', 'active', ARRAY['stage_transitions', 'handoff_approval']::text[], 2, 'chairman.ceo_medsync'::ltree, '22222222-2222-2222-2222-222222222222', NOW() - INTERVAL '45 days'),
  -- Executive Agents (VPs, Level 3)
  ('bbbbbbbb-1111-1111-1111-111111111111'::uuid, 'executive', 'VP Ideation Alpha', 'VP agent for ideation stages 1-5', 'active', ARRAY['hypothesis_generation', 'risk_identification']::text[], 3, 'chairman.eva.vp_ideation'::ltree, NULL, NOW() - INTERVAL '100 days'),
  ('bbbbbbbb-2222-2222-2222-222222222222'::uuid, 'executive', 'VP Validation Alpha', 'VP agent for validation stages 6-10', 'active', ARRAY['market_research', 'customer_interviews']::text[], 3, 'chairman.eva.vp_validation'::ltree, NULL, NOW() - INTERVAL '100 days'),
  -- Crew Agents (Level 4)
  ('cccccccc-1111-1111-1111-111111111111'::uuid, 'crew', 'Market Analyst', 'Analyzes market trends and competition', 'active', ARRAY['market_analysis', 'competitor_tracking']::text[], 4, 'chairman.eva.vp_validation.analyst'::ltree, NULL, NOW() - INTERVAL '100 days')
ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = NOW();

-- ============================================================================
-- SECTION 3: Pillar 3 - Assembly Line (Venture Stage Work)
-- ============================================================================

-- Helper function for stage artifacts
CREATE OR REPLACE FUNCTION temp_stage_artifacts(p_stage INTEGER) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
  RETURN CASE
    WHEN p_stage BETWEEN 1 AND 5 THEN jsonb_build_object('phase', 'ideation', 'assumptions', jsonb_build_array(jsonb_build_object('id', 'A-' || p_stage, 'text', 'Market need validated')))
    WHEN p_stage BETWEEN 6 AND 10 THEN jsonb_build_object('phase', 'validation', 'validation_results', jsonb_build_array(jsonb_build_object('method', 'Customer interviews', 'sample_size', 15)))
    ELSE jsonb_build_object('phase', 'development', 'status', 'in_progress')
  END;
END;
$$;

-- Solara Energy (Stage 5)
INSERT INTO public.venture_stage_work (venture_id, lifecycle_stage, stage_status, health_score, work_type, advisory_data, created_at, updated_at)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, stage, CASE WHEN stage < 5 THEN 'completed' ELSE 'in_progress' END, CASE WHEN stage < 5 THEN 'green' ELSE 'yellow' END, 'artifact_only', temp_stage_artifacts(stage), NOW() - INTERVAL '30 days', NOW()
FROM generate_series(1, 5) AS stage ON CONFLICT (venture_id, lifecycle_stage) DO UPDATE SET advisory_data = EXCLUDED.advisory_data;

-- MedSync AI (Stage 8)
INSERT INTO public.venture_stage_work (venture_id, lifecycle_stage, stage_status, health_score, work_type, advisory_data, created_at, updated_at)
SELECT '22222222-2222-2222-2222-222222222222'::uuid, stage, CASE WHEN stage < 8 THEN 'completed' ELSE 'in_progress' END, 'green', 'artifact_only', temp_stage_artifacts(stage), NOW() - INTERVAL '45 days', NOW()
FROM generate_series(1, 8) AS stage ON CONFLICT (venture_id, lifecycle_stage) DO UPDATE SET advisory_data = EXCLUDED.advisory_data;

-- FinTrack Pro (Stage 3)
INSERT INTO public.venture_stage_work (venture_id, lifecycle_stage, stage_status, health_score, work_type, advisory_data, created_at, updated_at)
SELECT '33333333-3333-3333-3333-333333333333'::uuid, stage, CASE WHEN stage < 3 THEN 'completed' ELSE 'in_progress' END, 'green', 'artifact_only', temp_stage_artifacts(stage), NOW() - INTERVAL '15 days', NOW()
FROM generate_series(1, 3) AS stage ON CONFLICT (venture_id, lifecycle_stage) DO UPDATE SET advisory_data = EXCLUDED.advisory_data;

-- EduPath AI (Stage 6, blocked)
INSERT INTO public.venture_stage_work (venture_id, lifecycle_stage, stage_status, health_score, work_type, advisory_data, created_at, updated_at)
SELECT '44444444-4444-4444-4444-444444444444'::uuid, stage, CASE WHEN stage < 6 THEN 'completed' WHEN stage = 6 THEN 'blocked' ELSE 'not_started' END, CASE WHEN stage <= 5 THEN 'green' ELSE 'red' END, 'artifact_only', temp_stage_artifacts(stage), NOW() - INTERVAL '60 days', NOW()
FROM generate_series(1, 6) AS stage ON CONFLICT (venture_id, lifecycle_stage) DO UPDATE SET advisory_data = EXCLUDED.advisory_data;

-- GreenLogistics (Stage 10)
INSERT INTO public.venture_stage_work (venture_id, lifecycle_stage, stage_status, health_score, work_type, advisory_data, created_at, updated_at)
SELECT '55555555-5555-5555-5555-555555555555'::uuid, stage, CASE WHEN stage < 10 THEN 'completed' ELSE 'in_progress' END, 'green', 'artifact_only', temp_stage_artifacts(stage), NOW() - INTERVAL '90 days', NOW()
FROM generate_series(1, 10) AS stage ON CONFLICT (venture_id, lifecycle_stage) DO UPDATE SET advisory_data = EXCLUDED.advisory_data;

-- ============================================================================
-- SECTION 4: Pillars 2 & 6 - Command Engine + Truth Layer (System Events)
-- ============================================================================

-- System events - Solara (1-4)
INSERT INTO public.system_events (event_type, venture_id, stage_id, correlation_id, agent_id, agent_type, actor_type, actor_role, token_cost, predicted_outcome, actual_outcome, calibration_delta, payload, created_at, resolved_at)
SELECT 'STAGE_TRANSITION', '11111111-1111-1111-1111-111111111111'::uuid, stage, gen_random_uuid(), 'aaaaaaaa-1111-1111-1111-111111111111'::uuid, 'venture_ceo', 'agent', 'CEO', 150 + (stage * 25), jsonb_build_object('confidence', 0.85), jsonb_build_object('success', true), 0.0, jsonb_build_object('from_stage', stage, 'to_stage', stage + 1), NOW() - INTERVAL '30 days' + (stage * INTERVAL '5 days'), NOW() - INTERVAL '30 days' + (stage * INTERVAL '5 days') + INTERVAL '1 hour'
FROM generate_series(1, 4) AS stage;

-- System events - MedSync (1-7)
INSERT INTO public.system_events (event_type, venture_id, stage_id, correlation_id, agent_id, agent_type, actor_type, actor_role, token_cost, predicted_outcome, actual_outcome, calibration_delta, payload, created_at, resolved_at)
SELECT 'STAGE_TRANSITION', '22222222-2222-2222-2222-222222222222'::uuid, stage, gen_random_uuid(), 'aaaaaaaa-2222-2222-2222-222222222222'::uuid, 'venture_ceo', 'agent', 'CEO', 200 + (stage * 30), jsonb_build_object('confidence', 0.80), jsonb_build_object('success', true), CASE WHEN stage = 5 THEN -0.15 ELSE 0.05 END, jsonb_build_object('from_stage', stage, 'to_stage', stage + 1), NOW() - INTERVAL '45 days' + (stage * INTERVAL '4 days'), NOW() - INTERVAL '45 days' + (stage * INTERVAL '4 days') + INTERVAL '2 hours'
FROM generate_series(1, 7) AS stage;

-- Agent actions
INSERT INTO public.system_events (event_type, venture_id, correlation_id, agent_id, agent_type, actor_type, actor_role, token_cost, payload, created_at)
SELECT 'AGENT_ACTION', v.id, gen_random_uuid(), 'bbbbbbbb-1111-1111-1111-111111111111'::uuid, 'executive', 'agent', 'VP_IDEATION', 75, jsonb_build_object('action', 'hypothesis_generation'), NOW() - INTERVAL '10 days'
FROM public.ventures v WHERE v.id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- ============================================================================
-- SECTION 5: Pillar 1 - Glass Cockpit (Pending CEO Handoffs)
-- ============================================================================

INSERT INTO public.pending_ceo_handoffs (
  id, venture_id, from_stage, to_stage, vp_agent_id,
  handoff_data, status, proposed_at
) VALUES
  ('dddddddd-1111-1111-1111-111111111111'::uuid, '11111111-1111-1111-1111-111111111111', 5, 6, 'vp-ideation-001', jsonb_build_object('artifacts', jsonb_build_array(jsonb_build_object('type', 'hypothesis_summary', 'content', 'Core hypotheses validated')), 'key_decisions', jsonb_build_array('Proceed to validation phase')), 'pending', NOW() - INTERVAL '1 hour'),
  ('dddddddd-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333', 3, 4, 'vp-ideation-001', jsonb_build_object('artifacts', jsonb_build_array(jsonb_build_object('type', 'market_analysis', 'content', 'SMB fintech opportunity')), 'key_decisions', jsonb_build_array('B2B focus confirmed')), 'pending', NOW() - INTERVAL '30 minutes')
ON CONFLICT (id) DO UPDATE SET status = 'pending';

-- ============================================================================
-- SECTION 6: Cleanup
-- ============================================================================

DROP FUNCTION IF EXISTS temp_stage_artifacts(INTEGER);

COMMIT;

-- ============================================================================
-- VERIFICATION RESULTS (Executed 2025-12-20 18:31 UTC)
-- ============================================================================
-- ✅ PILLAR 1 (Glass Cockpit): 2 pending CEO handoffs
-- ✅ PILLAR 2 (Command Engine): 14 system events (11 transitions + 3 actions)
-- ✅ PILLAR 3 (Assembly Line): 32 venture stage work rows
-- ✅ PILLAR 4 (Crew Registry): 5 agents (2 CEOs, 2 VPs, 1 crew)
-- ✅ PILLAR 5 (Capital Ledger): 3,315 tokens tracked
-- ✅ PILLAR 6 (Truth Layer): 11 events with prediction/outcome calibration
--
-- Demo Ventures Created:
-- - Solara Energy (Stage 5, active) - 5 stage work rows
-- - MedSync AI (Stage 8, active) - 8 stage work rows
-- - FinTrack Pro (Stage 3, active) - 3 stage work rows
-- - EduPath AI (Stage 6, paused/blocked) - 6 stage work rows
-- - GreenLogistics (Stage 10, active) - 10 stage work rows
-- ============================================================================
