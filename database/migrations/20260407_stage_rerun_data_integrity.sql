-- Migration: 20260407_stage_rerun_data_integrity.sql
-- SD: SD-LEO-FIX-STAGE-RUN-DATA-001 (Stage Re-run Data Integrity)
-- Purpose: Add unique constraints to prevent duplicate rows on stage re-runs
--
-- Step 1: Cleanup customer_personas duplicates + add UNIQUE constraint
-- Step 2: Cleanup venture_artifacts duplicates + add partial unique index
-- Step 3: brand_genome_submissions already has unique_venture_version (no-op)
--
-- Rollback:
--   ALTER TABLE customer_personas DROP CONSTRAINT IF EXISTS uq_customer_personas_name_industry;
--   DROP INDEX IF EXISTS idx_venture_artifacts_idempotent;

BEGIN;

-- ============================================================
-- STEP 1: customer_personas — deduplicate + UNIQUE constraint
-- ============================================================

-- 1a. Delete duplicate customer_personas rows, keeping the most recent per (name, industry).
-- The existing partial unique index idx_customer_personas_canonical covers
-- (name, COALESCE(industry, '')) WHERE canonical_id IS NULL, but PostgREST
-- requires a real UNIQUE constraint for ON CONFLICT.
DELETE FROM customer_personas
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY name, industry
             ORDER BY created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM customer_personas
  ) ranked
  WHERE rn > 1
);

-- 1b. Add a proper UNIQUE constraint (idempotent check).
-- This differs from the existing partial unique index which has a WHERE clause
-- and uses COALESCE, so there is no conflict.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'customer_personas'
      AND constraint_name = 'uq_customer_personas_name_industry'
  ) THEN
    ALTER TABLE customer_personas
      ADD CONSTRAINT uq_customer_personas_name_industry UNIQUE (name, industry);
  END IF;
END $$;

-- ============================================================
-- STEP 2: venture_artifacts — deduplicate + partial unique index
-- ============================================================

-- 2a. Delete duplicate venture_artifacts where is_current=true,
-- keeping the most recent per (venture_id, lifecycle_stage, artifact_type).
DELETE FROM venture_artifacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY venture_id, lifecycle_stage, artifact_type
             ORDER BY created_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM venture_artifacts
    WHERE is_current = true
  ) ranked
  WHERE rn > 1
);

-- 2b. Add partial unique index (WHERE clauses not allowed on constraints,
-- so we use CREATE UNIQUE INDEX instead).
CREATE UNIQUE INDEX IF NOT EXISTS idx_venture_artifacts_idempotent
  ON venture_artifacts (venture_id, lifecycle_stage, artifact_type)
  WHERE is_current = true;

-- ============================================================
-- STEP 3: brand_genome_submissions — no-op
-- ============================================================
-- The unique_venture_version constraint already exists on (venture_id, version).
-- Fix is application-side (switch INSERT to upsert). Nothing to do here.

COMMIT;
