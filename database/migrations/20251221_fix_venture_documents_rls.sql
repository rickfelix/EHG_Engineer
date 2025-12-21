-- Migration: Fix RLS Security Vulnerability
-- Date: 2025-12-21
-- Purpose: Remove overly permissive OR clause from RLS policies
--
-- SECURITY ISSUE:
-- The original RLS policies included: OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid())
-- This clause evaluates to TRUE for ANY authenticated user, effectively bypassing
-- the company ownership checks and granting unrestricted access to all data.
--
-- AFFECTED TABLES:
-- - ventures: Any auth user could access ANY venture (should be company-scoped)
-- - portfolios: Any auth user could access ANY portfolio (should be company-scoped)
-- - companies: Any auth user could access ANY company (should be company-scoped)
-- - venture_documents: Any auth user could access ANY document (should be company-scoped)
--
-- FIX:
-- Remove the OR EXISTS clause and enforce strict company-based access control
-- through the user_company_access junction table.
--
-- PUBLIC ACCESS:
-- Anonymous (unauthenticated) read access remains via separate "Anon read" policies.
-- This migration ONLY affects authenticated user access patterns.

BEGIN;

-- ============================================
-- DROP PERMISSIVE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Company access ventures" ON ventures;
DROP POLICY IF EXISTS "Company access portfolios" ON portfolios;
DROP POLICY IF EXISTS "Company access companies" ON companies;
DROP POLICY IF EXISTS "Company access venture_documents" ON venture_documents;

-- ============================================
-- CREATE STRICT COMPANY-SCOPED POLICIES
-- ============================================

-- Ventures: Authenticated users can only access ventures owned by their companies
CREATE POLICY "Company access ventures" ON ventures
FOR ALL
TO authenticated
USING (
    company_id IN (
        SELECT company_id
        FROM user_company_access
        WHERE user_id = auth.uid()
    )
);

-- Portfolios: Authenticated users can only access portfolios owned by their companies
CREATE POLICY "Company access portfolios" ON portfolios
FOR ALL
TO authenticated
USING (
    company_id IN (
        SELECT company_id
        FROM user_company_access
        WHERE user_id = auth.uid()
    )
);

-- Companies: Authenticated users can only access companies they have access to
CREATE POLICY "Company access companies" ON companies
FOR ALL
TO authenticated
USING (
    id IN (
        SELECT company_id
        FROM user_company_access
        WHERE user_id = auth.uid()
    )
);

-- Venture Documents: Authenticated users can only access documents for ventures owned by their companies
CREATE POLICY "Company access venture_documents" ON venture_documents
FOR ALL
TO authenticated
USING (
    venture_id IN (
        SELECT v.id
        FROM ventures v
        WHERE v.company_id IN (
            SELECT company_id
            FROM user_company_access
            WHERE user_id = auth.uid()
        )
    )
);

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify policies were created successfully
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND policyname IN (
        'Company access ventures',
        'Company access portfolios',
        'Company access companies',
        'Company access venture_documents'
    );

    IF policy_count != 4 THEN
        RAISE EXCEPTION 'Expected 4 policies, found %', policy_count;
    END IF;

    RAISE NOTICE 'Successfully created 4 strict company-scoped RLS policies';
END $$;

COMMIT;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT 'RLS security vulnerability fixed - removed permissive OR clauses from 4 tables' AS status;
