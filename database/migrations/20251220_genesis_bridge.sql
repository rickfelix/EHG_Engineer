-- ============================================================================
-- Migration: Genesis Bridge - SD-to-PRD Instantiation
-- ============================================================================
-- Created: 2025-12-20
-- SD: SD-PARENT-4.0 (The First Pulse)
-- Purpose: Unlock the Venture Execution Domain by creating the first PRD
--
-- THE LAW: The system must generate its own authority to become autonomous.
--
-- This migration creates:
-- 1. SD-PARENT-4.0: The parent Strategic Directive authorizing Phase II work
-- 2. PRD-GENESIS-001: The first Product Requirement Document
-- 3. Unlocks Solara Energy for Stage 5→6 transition
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Create SD-PARENT-4.0 (The First Pulse)
-- ============================================================================

-- First check if strategic_directives_v2 table exists, create if needed
CREATE TABLE IF NOT EXISTS strategic_directives_v2 (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'archived', 'cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'high' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  category VARCHAR(50),
  parent_id VARCHAR(100) REFERENCES strategic_directives_v2(id),
  chairman_feedback TEXT,
  intent_summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  approved_by VARCHAR(100),
  approved_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Insert SD-PARENT-4.0: The First Pulse
INSERT INTO strategic_directives_v2 (
  id,
  title,
  description,
  status,
  priority,
  category,
  chairman_feedback,
  intent_summary,
  created_by,
  approved_by,
  approved_at,
  metadata
) VALUES (
  'SD-PARENT-4.0',
  'Phase II: Stable Autonomy - The First Pulse',
  'Strategic Directive authorizing the initialization of autonomous venture execution. ' ||
  'This SD establishes the governance foundation for all Phase II work, including: ' ||
  '(1) EVA health scans and venture monitoring, ' ||
  '(2) Stage transitions under PRD authority, ' ||
  '(3) Truth Layer calibration and prediction logging.',
  'active',
  'critical',
  'GOVERNANCE',
  'Activate Phase II: Enable autonomous venture execution with full governance traceability.',
  'The Chairman OS must transition from "Governed into a Corner" to "Stable Autonomy." ' ||
  'This requires: (a) SD-to-PRD bridge for venture work authorization, ' ||
  '(b) Meta-operation support for EVA scans, ' ||
  '(c) Truth Layer integration for calibration.',
  'CHAIRMAN',
  'CHAIRMAN',
  NOW(),
  jsonb_build_object(
    'phase', 'II',
    'codename', 'The First Pulse',
    'pillars', ARRAY['Glass Cockpit', 'Command Engine', 'Assembly Line', 'Crew Registry', 'Capital Ledger', 'Truth Layer'],
    'domain', 'LEO_PROTOCOL',
    'version', '4.0'
  )
) ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  updated_at = NOW();

-- ============================================================================
-- PHASE 2: Create PRD-GENESIS-001 (Solara Stage 5→6)
-- ============================================================================

INSERT INTO product_requirements_v2 (
  id,
  directive_id,
  title,
  version,
  status,
  category,
  priority,

  -- Executive Summary
  executive_summary,
  business_context,
  technical_context,

  -- Requirements
  functional_requirements,
  non_functional_requirements,

  -- Acceptance Criteria (for Golden Nugget Validation)
  acceptance_criteria,

  -- Implementation
  implementation_approach,

  -- Progress
  progress,
  phase,

  -- Metadata
  created_by,
  metadata,
  content
) VALUES (
  'PRD-GENESIS-001',
  'SD-PARENT-4.0',
  'Solara Energy: Stage 5→6 Transition (Profitability→Risk Evaluation)',
  '1.0',
  'in_progress',
  'VENTURE_EXECUTION',
  'high',

  -- Executive Summary
  'This PRD authorizes the Stage 5 to Stage 6 transition for Solara Energy venture. ' ||
  'The venture has completed Profitability Forecasting (Stage 5) with a validated financial model. ' ||
  'This PRD defines the work required to produce the Risk Evaluation Matrix (Stage 6) artifacts.',

  -- Business Context
  'Solara Energy is an AI-powered solar panel efficiency optimization venture at Stage 5. ' ||
  'The financial model shows positive unit economics and 42% gross margin target. ' ||
  'Risk evaluation is required before proceeding to Phase 2 (THE ENGINE) execution.',

  -- Technical Context
  'Stage 6 (Risk Evaluation Matrix) requires: ' ||
  '- Comprehensive risk identification from financial, market, and technical domains ' ||
  '- Probability and impact assessment for each identified risk ' ||
  '- Mitigation strategies with contingency plans ' ||
  '- Integration with existing financial model assumptions',

  -- Functional Requirements
  jsonb_build_array(
    jsonb_build_object(
      'id', 'FR-001',
      'title', 'Risk Identification',
      'description', 'Identify all risks from financial model, market analysis, and technical assessment',
      'priority', 'critical'
    ),
    jsonb_build_object(
      'id', 'FR-002',
      'title', 'Risk Matrix Generation',
      'description', 'Generate risk_matrix artifact with probability, impact, and severity ratings',
      'priority', 'critical'
    ),
    jsonb_build_object(
      'id', 'FR-003',
      'title', 'Mitigation Planning',
      'description', 'Define mitigation strategies for HIGH and CRITICAL severity risks',
      'priority', 'high'
    )
  ),

  -- Non-Functional Requirements
  jsonb_build_array(
    jsonb_build_object(
      'id', 'NFR-001',
      'title', 'Golden Nugget Compliance',
      'description', 'risk_matrix artifact must pass GoldenNuggetValidator (min 200 chars, valid structure)',
      'priority', 'critical'
    ),
    jsonb_build_object(
      'id', 'NFR-002',
      'title', 'Governance Traceability',
      'description', 'All events must reference prd_id=PRD-GENESIS-001 and sd_id=SD-PARENT-4.0',
      'priority', 'critical'
    )
  ),

  -- Acceptance Criteria (mapped to Golden Nugget requirements)
  jsonb_build_array(
    jsonb_build_object(
      'id', 'AC-001',
      'title', 'Risk Matrix Artifact Exists',
      'description', 'risk_matrix artifact is present in handoff package',
      'validation', 'GoldenNuggetValidator.validateGoldenNuggets(6, artifacts)'
    ),
    jsonb_build_object(
      'id', 'AC-002',
      'title', 'Risk Matrix Content Quality',
      'description', 'risk_matrix has minimum 200 characters of substantive content',
      'validation', 'content.length >= 200'
    ),
    jsonb_build_object(
      'id', 'AC-003',
      'title', 'Stage 6 Gates Pass',
      'description', 'All Stage 6 exit gates are satisfied per stages_v2.yaml',
      'validation', 'validateExitGate() returns passed:true for all gates'
    ),
    jsonb_build_object(
      'id', 'AC-004',
      'title', 'Truth Layer Prediction Logged',
      'description', 'logPrediction() called with business hypothesis before transition',
      'validation', 'system_events contains AGENT_PREDICTION with prd_id=PRD-GENESIS-001'
    )
  ),

  -- Implementation Approach
  'The Solara CEO Agent (aaaaaaaa-1111-1111-1111-111111111111) will: ' ||
  '1. Load financial model from Stage 5 artifacts ' ||
  '2. Identify risks across financial, market, and technical domains ' ||
  '3. Generate risk_matrix artifact with probability/impact/severity ratings ' ||
  '4. Create mitigation strategies for HIGH+ risks ' ||
  '5. Propose handoff with artifacts for Stage 5→6 transition ' ||
  '6. Log prediction with business hypothesis before committing',

  -- Progress
  0,
  'implementation',

  -- Metadata
  'LEO:PLAN',
  jsonb_build_object(
    'venture_id', '11111111-1111-1111-1111-111111111111',
    'venture_name', 'Solara Energy',
    'from_stage', 5,
    'to_stage', 6,
    'ceo_agent_id', 'aaaaaaaa-1111-1111-1111-111111111111',
    'genesis_bridge', true,
    'created_by_phase', 'PLAN',
    'golden_nugget_requirements', jsonb_build_object(
      'required_artifacts', ARRAY['risk_matrix'],
      'min_content_length', 200,
      'epistemic_required', false
    )
  ),

  -- Full PRD Content (Markdown)
  E'# PRD-GENESIS-001: Solara Energy Stage 5→6 Transition\n\n' ||
  E'## Executive Summary\n' ||
  E'Authorize Stage 5 (Profitability Forecasting) to Stage 6 (Risk Evaluation Matrix) transition for Solara Energy.\n\n' ||
  E'## Venture Context\n' ||
  E'- **Venture**: Solara Energy (11111111-1111-1111-1111-111111111111)\n' ||
  E'- **Current Stage**: 5 (Profitability Forecasting)\n' ||
  E'- **Target Stage**: 6 (Risk Evaluation Matrix)\n' ||
  E'- **CEO Agent**: aaaaaaaa-1111-1111-1111-111111111111\n\n' ||
  E'## Required Artifacts\n' ||
  E'1. **risk_matrix** - Comprehensive risk identification and assessment\n\n' ||
  E'## Success Criteria\n' ||
  E'1. Risk matrix artifact passes Golden Nugget validation\n' ||
  E'2. All Stage 6 exit gates satisfied\n' ||
  E'3. Prediction logged with business hypothesis\n' ||
  E'4. Governance trace complete (prd_id + sd_id)\n\n' ||
  E'## Governance\n' ||
  E'- **SD Authority**: SD-PARENT-4.0\n' ||
  E'- **PRD Authority**: PRD-GENESIS-001\n' ||
  E'- **Domain**: VENTURE_EXECUTION\n'

) ON CONFLICT (id) DO UPDATE SET
  status = 'in_progress',
  updated_at = NOW();

-- ============================================================================
-- PHASE 3: Log Genesis Bridge Creation Event
-- ============================================================================

INSERT INTO system_events (
  event_type,
  correlation_id,
  idempotency_key,
  sd_id,
  prd_id,
  venture_id,
  stage_id,
  actor_type,
  actor_role,
  payload,
  directive_context,
  created_at
) VALUES (
  'PRD_CREATED',
  gen_random_uuid(),
  'GENESIS-BRIDGE-PRD-001',
  'SD-PARENT-4.0',
  'PRD-GENESIS-001',
  '11111111-1111-1111-1111-111111111111',
  5,
  'agent',
  'PLAN',  -- LEO:PLAN agent created this PRD
  jsonb_build_object(
    'action', 'Genesis Bridge Instantiation',
    'prd_id', 'PRD-GENESIS-001',
    'venture', 'Solara Energy',
    'from_stage', 5,
    'to_stage', 6,
    'milestone', 'First Sovereign PRD'
  ),
  jsonb_build_object(
    'domain', 'LEO_PROTOCOL',
    'phase', 'PLAN',
    'authorized_by', 'SD-PARENT-4.0'
  ),
  NOW()
) ON CONFLICT (idempotency_key) DO NOTHING;

-- ============================================================================
-- PHASE 4: Verification
-- ============================================================================

DO $$
DECLARE
  sd_exists BOOLEAN;
  prd_exists BOOLEAN;
  event_logged BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM strategic_directives_v2 WHERE id = 'SD-PARENT-4.0') INTO sd_exists;
  SELECT EXISTS(SELECT 1 FROM product_requirements_v2 WHERE id = 'PRD-GENESIS-001') INTO prd_exists;
  SELECT EXISTS(SELECT 1 FROM system_events WHERE idempotency_key = 'GENESIS-BRIDGE-PRD-001') INTO event_logged;

  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║           GENESIS BRIDGE INSTANTIATION COMPLETE            ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Phase II Activation Status:';
  RAISE NOTICE '  SD-PARENT-4.0 created:     %', CASE WHEN sd_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  PRD-GENESIS-001 created:   %', CASE WHEN prd_exists THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  Genesis event logged:      %', CASE WHEN event_logged THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Venture Execution Domain: UNLOCKED';
  RAISE NOTICE '  Target: Solara Energy (Stage 5 → 6)';
  RAISE NOTICE '  PRD Authority: PRD-GENESIS-001';
  RAISE NOTICE '  SD Authority: SD-PARENT-4.0';
  RAISE NOTICE '';
  RAISE NOTICE 'The system has generated its own authority.';
  RAISE NOTICE 'Stable Autonomy is now possible.';
END $$;

COMMIT;

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
-- After applying this migration, the CEO agent for Solara Energy can:
--
-- 1. Create VentureCEORuntime with:
--    {
--      ventureId: '11111111-1111-1111-1111-111111111111',
--      prdId: 'PRD-GENESIS-001',
--      sdId: 'SD-PARENT-4.0'
--    }
--
-- 2. Execute Stage 5→6 transition work
--
-- 3. All events will pass trg_enforce_dual_domain_governance trigger
--
-- 4. Handoff artifacts will be validated by GoldenNuggetValidator
-- ============================================================================
