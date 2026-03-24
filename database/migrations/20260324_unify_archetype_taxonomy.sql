-- ============================================================================
-- Migration: Unify Archetype Taxonomy
-- SD: SD-MAN-INFRA-UNIFY-ARCHETYPE-TAXONOMY-001
-- Purpose: Expand archetype_benchmarks to include all Stage 1 canonical
--          archetypes, enabling direct ventures.archetype writes from Stage 1.
-- ============================================================================

-- ============================================================================
-- Phase 1: Add Stage 1 canonical archetypes to archetype_benchmarks
-- Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
-- Financial benchmarks derived from closest existing archetype.
-- ============================================================================

INSERT INTO archetype_benchmarks (archetype, display_name, margin_target, margin_acceptable, breakeven_months, cac_ltv_ratio, description)
VALUES
  -- Canonical alias for saas_b2b/saas_b2c (blended benchmarks)
  ('saas', 'SaaS', 0.65, 0.45, 21, 2.75, 'Software-as-a-service (B2B and B2C blended)'),
  -- Canonical alias for ai_agents
  ('ai_product', 'AI Product', 0.65, 0.45, 18, 3.50, 'AI-native tools, agents, copilots, automation'),
  -- Canonical alias for content
  ('media', 'Media', 0.50, 0.30, 24, 2.00, 'Content, publishing, entertainment'),
  -- Canonical alias for hardware
  ('deeptech', 'Deep Tech', 0.40, 0.25, 30, 2.00, 'Hardware, R&D, scientific computing'),
  -- New archetypes (no direct equivalent in original benchmarks)
  ('e_commerce', 'E-Commerce', 0.35, 0.20, 18, 3.00, 'Direct-to-consumer product sales'),
  ('fintech', 'Fintech', 0.60, 0.40, 24, 3.50, 'Financial services and products'),
  ('healthtech', 'Healthtech', 0.55, 0.35, 30, 3.00, 'Healthcare technology'),
  ('edtech', 'Edtech', 0.50, 0.30, 24, 2.50, 'Education technology'),
  ('creator_tools', 'Creator Tools', 0.60, 0.40, 18, 3.00, 'Tools for creators, freelancers, designers'),
  ('real_estate', 'Real Estate Tech', 0.25, 0.15, 36, 4.00, 'Property technology')
ON CONFLICT (archetype) DO NOTHING;

-- ============================================================================
-- Phase 2: Migrate existing ventures to canonical archetype values
-- Old benchmark values -> Stage 1 canonical values.
-- marketplace and services already match, no change needed.
-- ============================================================================

UPDATE ventures SET archetype = 'saas'       WHERE archetype = 'saas_b2b';
UPDATE ventures SET archetype = 'saas'       WHERE archetype = 'saas_b2c';
UPDATE ventures SET archetype = 'deeptech'   WHERE archetype = 'hardware';
UPDATE ventures SET archetype = 'ai_product' WHERE archetype = 'ai_agents';
UPDATE ventures SET archetype = 'media'      WHERE archetype = 'content';

-- ============================================================================
-- Verification: Count Stage 1 archetypes in benchmarks table
-- Expected: >= 12 (original 7 + 10 new = 17, with marketplace and services shared)
-- ============================================================================

DO $$
DECLARE
  stage1_count INTEGER;
BEGIN
  SELECT count(*) INTO stage1_count
  FROM archetype_benchmarks
  WHERE archetype IN (
    'saas', 'marketplace', 'ai_product', 'e_commerce', 'fintech',
    'healthtech', 'edtech', 'media', 'creator_tools', 'services',
    'deeptech', 'real_estate'
  );

  IF stage1_count < 12 THEN
    RAISE WARNING 'Expected 12 Stage 1 archetypes in archetype_benchmarks, found %', stage1_count;
  ELSE
    RAISE NOTICE 'Verification passed: % Stage 1 archetypes found in archetype_benchmarks', stage1_count;
  END IF;
END $$;
