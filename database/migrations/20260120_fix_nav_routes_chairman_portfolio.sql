-- Migration: Fix navigation route duplication for chairman persona
-- SD: SD-FIX-NAV-001-A
-- Date: 2026-01-20
-- Description: Update chairman navigation to use /chairman/portfolio and remove duplicate Portfolios route

-- Background:
-- Current issue: Chairman persona sees two routes pointing to portfolio functionality:
--   1. "All Ventures" → /ventures (priority: 90)
--   2. "Portfolios" → /portfolios (priority: 95)
--
-- Solution:
--   1. Update "All Ventures" path to /chairman/portfolio for chairman persona
--   2. Remove chairman from "Portfolios" route (keep for builder only)
--   3. Adjust priorities to maintain proper navigation order

BEGIN;

-- Step 1: Update "All Ventures" route to use chairman-specific path
-- This route should point to /chairman/portfolio for chairman persona
UPDATE nav_routes
SET
  path = '/chairman/portfolio',
  description = 'View all ventures in your portfolio (Chairman)',
  persona_priority = jsonb_build_object(
    'chairman', 90,
    'builder', 85
  ),
  updated_at = NOW()
WHERE title = 'All Ventures'
  AND path = '/ventures';

-- Step 2: Update "Portfolios" route to be builder-only
-- Remove chairman from personas array since they now use /chairman/portfolio
UPDATE nav_routes
SET
  personas = ARRAY['builder']::text[],
  persona_priority = jsonb_build_object(
    'builder', 95
  ),
  description = 'View portfolio analytics and metrics (Builder)',
  updated_at = NOW()
WHERE title = 'Portfolios'
  AND path = '/portfolios';

-- Verification: Show updated routes
DO $$
BEGIN
  RAISE NOTICE 'Navigation routes updated for SD-FIX-NAV-001-A';
  RAISE NOTICE 'All Ventures now points to: /chairman/portfolio';
  RAISE NOTICE 'Portfolios is now builder-only';
END $$;

COMMIT;

-- Rollback instructions (if needed):
-- BEGIN;
-- UPDATE nav_routes SET path = '/ventures', description = NULL, persona_priority = '{"builder": 85, "chairman": 90}'::jsonb WHERE title = 'All Ventures';
-- UPDATE nav_routes SET personas = ARRAY['chairman']::text[], persona_priority = '{"builder": 45, "chairman": 95}'::jsonb, description = NULL WHERE title = 'Portfolios';
-- COMMIT;
