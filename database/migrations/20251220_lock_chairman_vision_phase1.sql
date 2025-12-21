-- File: database/migrations/20251220_lock_chairman_vision_phase1.sql
-- SD: IDEATION-GENESIS-AUDIT - Priority 2: Lock the Vision
-- Date: 2025-12-20
-- Purpose: Add immutable raw_chairman_intent column to ventures table
-- Phase: 1 of 3 (Safe column additions)

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'Phase 1: Add raw_chairman_intent for immutable vision tracking';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Context: IDEATION GENESIS AUDIT revealed that Chairman vision';
  RAISE NOTICE 'is not locked at Stage 0. This migration adds columns to:';
  RAISE NOTICE '  1. Capture immutable original intent (raw_chairman_intent)';
  RAISE NOTICE '  2. Track when vision was locked (problem_statement_locked_at)';
  RAISE NOTICE '';

  -- Add raw_chairman_intent column (nullable for backward compatibility during phase 1)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'ventures'
    AND column_name = 'raw_chairman_intent'
  ) THEN
    ALTER TABLE public.ventures ADD COLUMN raw_chairman_intent TEXT;

    COMMENT ON COLUMN public.ventures.raw_chairman_intent IS
      'Immutable original Chairman input captured at venture creation. This field should NEVER be modified after initial creation. Use problem_statement for the working/editable version.';

    RAISE NOTICE '  [+] Added raw_chairman_intent column (immutable original)';
  ELSE
    RAISE NOTICE '  [=] raw_chairman_intent column already exists';
  END IF;

  -- Add problem_statement_locked_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'ventures'
    AND column_name = 'problem_statement_locked_at'
  ) THEN
    ALTER TABLE public.ventures ADD COLUMN problem_statement_locked_at TIMESTAMPTZ;

    COMMENT ON COLUMN public.ventures.problem_statement_locked_at IS
      'Timestamp when the problem_statement was locked (moved from draft to Stage 1). Once set, the raw_chairman_intent should be considered immutable.';

    RAISE NOTICE '  [+] Added problem_statement_locked_at timestamp';
  ELSE
    RAISE NOTICE '  [=] problem_statement_locked_at column already exists';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE 'Phase 1 Complete';
  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - raw_chairman_intent: Stores immutable original vision';
  RAISE NOTICE '  - problem_statement_locked_at: Tracks lock timestamp';
  RAISE NOTICE '  - Existing problem_statement values: UNCHANGED';
  RAISE NOTICE '  - All columns nullable for backward compatibility';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Run Phase 2 to cleanup NULL problem_statement values';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';

END $$;
