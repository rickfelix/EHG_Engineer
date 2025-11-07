-- Migration: Add RLS SELECT policy for anon role on product_requirements_v2
-- Date: 2025-11-07
-- SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
-- Purpose: Allow anon to read PRDs after INSERT (required for .select() after insert)
-- Pattern: PAT-RLS-001 (proven RLS policy application method)
--
-- Context:
-- - INSERT policy added but INSERT with .select() still fails
-- - Root cause: No SELECT policy for anon role
-- - PostgreSQL RLS requires SELECT policy to verify inserted rows
--
-- Security Analysis:
-- - PRDs are system-generated during PLAN phase
-- - Reading PRDs is safe for anon role (read-only operations)
-- - Consistent with strategic_directives_v2 pattern (anon_read_strategic_directives_v2)

-- Drop policy if exists (idempotent)
DROP POLICY IF EXISTS anon_read_product_requirements_v2 ON public.product_requirements_v2;

-- Create SELECT policy for anon role
CREATE POLICY anon_read_product_requirements_v2
  ON public.product_requirements_v2
  FOR SELECT
  TO anon
  USING (true);

-- Verification comment
COMMENT ON POLICY anon_read_product_requirements_v2 ON public.product_requirements_v2
IS 'Allow anon role to read PRDs (required for INSERT with .select()). Created: 2025-11-07, SD-CREWAI-COMPETITIVE-INTELLIGENCE-001';
