-- ==========================================
-- Migration Rollback Script
-- Stage 56 - Database Schema & Data Contracts
-- ==========================================

-- CAUTION: This script will drop all tables and data
-- Only run this in development environments

-- ==========================================
-- Drop all triggers
-- ==========================================

DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
DROP TRIGGER IF EXISTS update_ventures_updated_at ON ventures;
DROP TRIGGER IF EXISTS update_ideas_updated_at ON ideas;
DROP TRIGGER IF EXISTS update_feedback_intelligence_updated_at ON feedback_intelligence;

-- ==========================================
-- Drop all policies
-- ==========================================

DROP POLICY IF EXISTS "Company access companies" ON companies;
DROP POLICY IF EXISTS "Users can view their own access" ON user_company_access;
DROP POLICY IF EXISTS "Company admins can manage access" ON user_company_access;
DROP POLICY IF EXISTS "Company access ventures" ON ventures;
DROP POLICY IF EXISTS "Company access ideas" ON ideas;
DROP POLICY IF EXISTS "Company access feedback_intelligence" ON feedback_intelligence;
DROP POLICY IF EXISTS "Company access feedback_trends" ON feedback_trends;
DROP POLICY IF EXISTS "Company access customer_sentiment_history" ON customer_sentiment_history;

-- ==========================================
-- Drop all indexes
-- ==========================================

-- Company indexes
DROP INDEX IF EXISTS idx_companies_slug;
DROP INDEX IF EXISTS idx_companies_industry;

-- User access indexes
DROP INDEX IF EXISTS idx_user_company_access_user;
DROP INDEX IF EXISTS idx_user_company_access_company;
DROP INDEX IF EXISTS idx_user_company_access_role;

-- Venture indexes
DROP INDEX IF EXISTS idx_ventures_company;
DROP INDEX IF EXISTS idx_ventures_status;
DROP INDEX IF EXISTS idx_ventures_current_stage;
DROP INDEX IF EXISTS idx_ventures_created_by;

-- Idea indexes
DROP INDEX IF EXISTS idx_ideas_venture;
DROP INDEX IF EXISTS idx_ideas_company;
DROP INDEX IF EXISTS idx_ideas_created_by;

-- Feedback intelligence indexes
DROP INDEX IF EXISTS idx_feedback_intelligence_venture;
DROP INDEX IF EXISTS idx_feedback_intelligence_customer;
DROP INDEX IF EXISTS idx_feedback_intelligence_sentiment;
DROP INDEX IF EXISTS idx_feedback_intelligence_churn_risk;
DROP INDEX IF EXISTS idx_feedback_intelligence_created_at;
DROP INDEX IF EXISTS idx_feedback_intelligence_source;

-- Feedback trends indexes
DROP INDEX IF EXISTS idx_feedback_trends_venture_period;
DROP INDEX IF EXISTS idx_feedback_trends_period_type;

-- Customer sentiment history indexes
DROP INDEX IF EXISTS idx_customer_sentiment_customer;
DROP INDEX IF EXISTS idx_customer_sentiment_venture;
DROP INDEX IF EXISTS idx_customer_sentiment_measurement_date;

-- ==========================================
-- Drop all tables (in reverse dependency order)
-- ==========================================

DROP TABLE IF EXISTS customer_sentiment_history CASCADE;
DROP TABLE IF EXISTS feedback_trends CASCADE;
DROP TABLE IF EXISTS feedback_intelligence CASCADE;
DROP TABLE IF EXISTS ideas CASCADE;
DROP TABLE IF EXISTS ventures CASCADE;
DROP TABLE IF EXISTS user_company_access CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- ==========================================
-- Drop functions
-- ==========================================

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ==========================================
-- Drop extensions (only if not used by other schemas)
-- ==========================================

-- Note: Be careful with these as they might be used by other parts of the application
-- DROP EXTENSION IF EXISTS "uuid-ossp";
-- DROP EXTENSION IF EXISTS "pgcrypto";

-- ==========================================
-- Rollback confirmation
-- ==========================================

-- Insert a record to confirm rollback completion
-- This will fail if tables still exist, indicating rollback issues
DO $$
BEGIN
    RAISE NOTICE 'Database rollback completed successfully at %', NOW();
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Rollback failed: %', SQLERRM;
END
$$;