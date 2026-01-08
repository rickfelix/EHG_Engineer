-- Migration: Fix epistemic_status constraint
-- Date: 2026-01-08
-- SD: SD-GENESIS-FIX-001 (US-001)
-- Purpose: Expand epistemic_status constraint to include all status values used in code
--
-- Root Cause: The original constraint only allowed:
--   ('simulation', 'official', 'archived', 'incinerated')
-- But code writes additional values:
--   'ratified', 'rejected', 'deployment_failed'
--
-- This migration alters the constraint to include all valid statuses.

-- Step 1: Drop the existing constraint
ALTER TABLE simulation_sessions
  DROP CONSTRAINT IF EXISTS simulation_sessions_epistemic_status_check;

-- Step 2: Add the expanded constraint with all valid status values
ALTER TABLE simulation_sessions
  ADD CONSTRAINT simulation_sessions_epistemic_status_check
  CHECK (epistemic_status IN (
    'simulation',       -- Initial state: active simulation
    'official',         -- Promoted to official/production
    'archived',         -- Failed kill gate, preserved for review
    'incinerated',      -- Purged/deleted permanently
    'ratified',         -- Approved/ratified by governance
    'rejected',         -- Rejected during review
    'deployment_failed' -- Deployment attempt failed
  ));

-- Step 3: Update the column comment to reflect all valid statuses
COMMENT ON COLUMN simulation_sessions.epistemic_status IS
  'Tracks simulation state lifecycle: simulation (active), ratified (approved), official (promoted to production), rejected (failed review), deployment_failed (deploy error), archived (preserved for review), incinerated (purged)';
