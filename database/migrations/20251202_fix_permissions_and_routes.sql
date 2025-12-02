-- Migration: Fix User Permissions and Routes
-- Issue: 403 errors due to missing user records and broken RLS policies
-- Database: dedlbzhpgkmetvhbkyzq (Consolidated)
-- Date: 2025-12-02
-- Priority: P0 - Critical (App cannot load)

-- ==============================================
-- FIX 1: Create profiles record for authenticated user
-- ==============================================

INSERT INTO public.profiles (id, first_name, last_name, created_at, updated_at)
VALUES (
  '69c8aa7a-7661-48ed-9779-746fa6290873',
  'Rick',
  'User',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ==============================================
-- FIX 2: Create user_preferences record for authenticated user
-- ==============================================

INSERT INTO public.user_preferences (id, theme, created_at, updated_at)
VALUES (
  '69c8aa7a-7661-48ed-9779-746fa6290873',
  'system',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ==============================================
-- FIX 3: Create nav_preferences record for authenticated user
-- ==============================================

INSERT INTO public.nav_preferences (id, user_id, default_maturity, show_draft, show_development, show_complete, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '69c8aa7a-7661-48ed-9779-746fa6290873',
  'complete',
  false,
  false,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- ==============================================
-- FIX 4: Ensure RLS policies allow authenticated users to read key tables
-- ==============================================

-- Drop and recreate ventures policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can view ventures" ON public.ventures;
CREATE POLICY "Authenticated users can view ventures"
  ON public.ventures FOR SELECT
  TO authenticated
  USING (true);

-- Drop and recreate companies policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can view companies" ON public.companies;
CREATE POLICY "Authenticated users can view companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (true);

-- Drop and recreate portfolios policy for authenticated users
DROP POLICY IF EXISTS "Authenticated users can view portfolios" ON public.portfolios;
CREATE POLICY "Authenticated users can view portfolios"
  ON public.portfolios FOR SELECT
  TO authenticated
  USING (true);

-- Ensure nav_routes is readable by authenticated users
DROP POLICY IF EXISTS "Authenticated users can view nav_routes" ON public.nav_routes;
CREATE POLICY "Authenticated users can view nav_routes"
  ON public.nav_routes FOR SELECT
  TO authenticated
  USING (true);

-- ==============================================
-- FIX 5: Fix nav_preferences policies
-- ==============================================

DROP POLICY IF EXISTS "nav_preferences_own" ON public.nav_preferences;
DROP POLICY IF EXISTS "Users can manage their nav preferences" ON public.nav_preferences;

CREATE POLICY "Users can manage their nav preferences"
  ON public.nav_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================
-- FIX 6: Ensure profiles/user_preferences have proper policies
-- ==============================================

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- User Preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;

CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ==============================================
-- FIX 7: Fix user_company_access policy (avoid referencing non-existent users table)
-- ==============================================

DROP POLICY IF EXISTS "Users can view their company access" ON public.user_company_access;
DROP POLICY IF EXISTS "Users can manage company access" ON public.user_company_access;

CREATE POLICY "Users can view their company access"
  ON public.user_company_access FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================
-- VERIFICATION
-- ==============================================
-- After running, verify with:
-- SELECT * FROM profiles WHERE id = '69c8aa7a-7661-48ed-9779-746fa6290873';
-- SELECT * FROM user_preferences WHERE id = '69c8aa7a-7661-48ed-9779-746fa6290873';
-- SELECT * FROM nav_preferences WHERE user_id = '69c8aa7a-7661-48ed-9779-746fa6290873';
