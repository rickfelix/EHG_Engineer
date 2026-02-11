-- Migration: Add research_results column to venture_drafts table
-- SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
-- User Story: US-001
-- Purpose: Store versioned CrewAI competitive intelligence research results
-- Database: EHG app database (liapbndqlqxdcgpwntbv)
-- Repository: /mnt/c/_EHG/EHG/
-- Date: 2025-11-07
-- Database Agent Verdict: CONDITIONAL_PASS (88% confidence)

-- FORWARD MIGRATION
-- =================

BEGIN;

-- Step 1: Add research_results column with default empty JSONB object
ALTER TABLE venture_drafts
ADD COLUMN research_results JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Step 2: Create GIN index for efficient JSONB queries
-- This enables fast queries on JSON fields like:
-- WHERE research_results->>'validation_score' > '80'
-- WHERE research_results @> '{"quick_validation": {"validated": true}}'
CREATE INDEX idx_venture_drafts_research_results
ON venture_drafts USING GIN (research_results);

-- Step 3: Add comment documenting structure
COMMENT ON COLUMN venture_drafts.research_results IS
'Versioned research results from CrewAI competitive intelligence analysis. Structure: { quick_validation: { summary, key_findings, validation_score, timestamp }, deep_competitive: { competitors, market_analysis, pricing_data, positioning, threats_opportunities } }';

COMMIT;

-- VERIFICATION QUERY
-- ==================
-- Run this after migration to verify success:
--
-- SELECT
--   column_name,
--   data_type,
--   column_default,
--   is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'venture_drafts'
--   AND column_name = 'research_results';
--
-- Expected output:
-- column_name: research_results
-- data_type: jsonb
-- column_default: '{}'::jsonb
-- is_nullable: NO

-- ROLLBACK MIGRATION
-- ==================
-- Run this if rollback is needed:
--
-- BEGIN;
-- DROP INDEX IF EXISTS idx_venture_drafts_research_results;
-- ALTER TABLE venture_drafts DROP COLUMN IF EXISTS research_results;
-- COMMIT;
