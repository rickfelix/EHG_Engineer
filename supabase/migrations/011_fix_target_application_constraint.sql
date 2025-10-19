-- Migration: Fix target_application constraint to allow ventures
-- Purpose: Allow 'EHG_engineer', 'EHG', and any venture names (venture_*)
-- Created: 2025-10-16
-- Issue: Current constraint only allows 'EHG' and 'EHG_ENGINEER' (case-sensitive)

-- Step 1: Drop the existing constraint (so we can update data)
ALTER TABLE public.strategic_directives_v2
DROP CONSTRAINT IF EXISTS check_target_application;

-- Step 2: Migrate existing data from 'EHG_ENGINEER' to 'EHG_engineer'
UPDATE public.strategic_directives_v2
SET target_application = 'EHG_engineer'
WHERE target_application = 'EHG_ENGINEER';

-- Step 3: Add new constraint that allows:
-- 1. 'EHG_engineer' (exact match, for LEO Protocol infrastructure)
-- 2. 'EHG' (exact match, for EHG business application)
-- 3. Any value starting with 'venture_' (for venture projects)
ALTER TABLE public.strategic_directives_v2
ADD CONSTRAINT check_target_application
CHECK (
  target_application = 'EHG_engineer'
  OR target_application = 'EHG'
  OR target_application LIKE 'venture_%'
);

-- Step 4: Verify the constraint was created successfully
DO $$
DECLARE
  constraint_exists BOOLEAN;
  constraint_def TEXT;
BEGIN
  -- Check if constraint exists
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_target_application'
      AND conrelid = 'public.strategic_directives_v2'::regclass
  ) INTO constraint_exists;

  IF NOT constraint_exists THEN
    RAISE EXCEPTION 'Constraint check_target_application was not created!';
  END IF;

  -- Get constraint definition
  SELECT pg_get_constraintdef(oid)
  INTO constraint_def
  FROM pg_constraint
  WHERE conname = 'check_target_application'
    AND conrelid = 'public.strategic_directives_v2'::regclass;

  RAISE NOTICE 'Constraint created successfully: %', constraint_def;
END $$;
