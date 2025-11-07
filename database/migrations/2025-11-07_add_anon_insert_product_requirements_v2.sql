-- Migration: Add RLS INSERT policy for anon role on product_requirements_v2
-- Date: 2025-11-07
-- SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
-- Purpose: Allow add-prd-to-database.js to insert PRDs using ANON_KEY
-- Pattern: PAT-RLS-001 (proven RLS policy application method)
--
-- Context:
-- - Script add-prd-to-database.js uses ANON_KEY to insert PRDs
-- - Table exists with authenticated_read and service_role_all policies
-- - Missing: anon INSERT policy
--
-- Security Analysis:
-- - PRDs are system-generated during PLAN phase (not user-specific)
-- - created_by field tracks which phase created the PRD
-- - No user-specific filtering needed (system-wide PRDs)
-- - Decision: Allow all anon INSERTs with WITH CHECK (true)

-- Drop policy if exists (idempotent)
DROP POLICY IF EXISTS anon_insert_product_requirements_v2 ON public.product_requirements_v2;

-- Create INSERT policy for anon role
CREATE POLICY anon_insert_product_requirements_v2
  ON public.product_requirements_v2
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Verification comment
COMMENT ON POLICY anon_insert_product_requirements_v2 ON public.product_requirements_v2
IS 'Allow anon role to insert PRDs during PLAN phase automation. Created: 2025-11-07, SD-CREWAI-COMPETITIVE-INTELLIGENCE-001';
