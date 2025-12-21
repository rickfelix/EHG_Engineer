-- ============================================================================
-- Migration: Create public.prds View (Naming Standardization)
-- ============================================================================
-- Date: 2025-12-20
-- SD: SD-UNIFIED-PATH-1.1.1 (LEO Protocol Restoration)
-- Purpose: Create universal alias view for PRD table
--
-- Background:
--   Blind Audit (Codex/Anti-Gravity) identified naming conflict:
--   - Agents write to: product_requirements_v2
--   - Auditors expect: public.prds
--
--   This view ensures universal discoverability for all agents.
-- ============================================================================

BEGIN;

-- Create the universal alias view
CREATE OR REPLACE VIEW public.prds AS
SELECT
  id,
  directive_id,
  sd_id,
  title,
  version,
  status,
  category,
  priority,
  executive_summary,
  business_context,
  technical_context,
  functional_requirements,
  non_functional_requirements,
  technical_requirements,
  system_architecture,
  data_model,
  api_specifications,
  ui_ux_requirements,
  implementation_approach,
  technology_stack,
  dependencies,
  test_scenarios,
  acceptance_criteria,
  performance_requirements,
  plan_checklist,
  metadata,
  created_at,
  updated_at
FROM public.product_requirements_v2;

COMMENT ON VIEW public.prds IS
  'Universal alias view for product_requirements_v2. '
  'Created by LEO Protocol Restoration (SD-UNIFIED-PATH-1.1.1) to resolve '
  'Codex/Anti-Gravity naming conflict. All agents should use this view for discoverability.';

-- Grant same permissions as base table
GRANT SELECT ON public.prds TO authenticated;
GRANT SELECT ON public.prds TO anon;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running, verify with:
-- SELECT COUNT(*) FROM public.prds;
-- \d public.prds
