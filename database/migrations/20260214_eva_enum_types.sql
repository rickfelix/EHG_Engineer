-- Migration: Create PostgreSQL ENUM types for EVA categorical fields
-- SD Reference: SD-EVA-FIX-DB-SCHEMA-001
-- Audit Finding: CRIT-002 - Convert CHECK constraints to proper ENUM types
-- Architecture Compliance: v1.6 Section 7.3 - "All categorical fields SHALL use defined enums"
--
-- Purpose: Replace TEXT columns with CHECK constraints with proper PostgreSQL ENUM types
-- This migration creates 16 ENUM types used across EVA stages
--
-- Idempotency: All CREATE TYPE statements are wrapped in exception handlers
-- Safe to run multiple times without errors

-- ============================================================================
-- CROSS-STAGE ENUMS (used by multiple EVA stages)
-- ============================================================================

-- Severity levels for risks, issues, defects
DO $$ BEGIN
  CREATE TYPE eva_severity AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Task status for action items, initiatives
DO $$ BEGIN
  CREATE TYPE eva_task_status AS ENUM ('pending', 'in_progress', 'done', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Defect/bug tracking status
DO $$ BEGIN
  CREATE TYPE eva_defect_status AS ENUM ('open', 'in_progress', 'resolved', 'wontfix');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Initiative/project status
DO $$ BEGIN
  CREATE TYPE eva_initiative_status AS ENUM ('planned', 'in_progress', 'completed', 'abandoned', 'deferred');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Learning/insight categorization
DO $$ BEGIN
  CREATE TYPE eva_learning_category AS ENUM ('product', 'market', 'technical', 'financial', 'process');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Testing scope levels
DO $$ BEGIN
  CREATE TYPE eva_test_type AS ENUM ('unit', 'integration', 'e2e');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STAGE-SPECIFIC ENUMS (organized by EVA stage)
-- ============================================================================

-- Stage 1: Vision/Architecture - Business archetype classification
DO $$ BEGIN
  CREATE TYPE eva_archetype AS ENUM ('saas', 'marketplace', 'deeptech', 'hardware', 'services', 'media', 'fintech');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 5: Exit Planning - Exit strategy types
DO $$ BEGIN
  CREATE TYPE eva_exit_type AS ENUM ('acquisition', 'ipo', 'merger', 'mbo', 'liquidation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 5: Exit Planning - Buyer classification
DO $$ BEGIN
  CREATE TYPE eva_buyer_type AS ENUM ('strategic', 'financial', 'competitor', 'pe');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 6: Pricing Strategy - Revenue model types
DO $$ BEGIN
  CREATE TYPE eva_pricing_model AS ENUM ('freemium', 'subscription', 'one_time', 'usage_based', 'marketplace_commission', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 7: Naming - Brand naming strategy
DO $$ BEGIN
  CREATE TYPE eva_naming_strategy AS ENUM ('descriptive', 'abstract', 'acronym', 'founder', 'metaphorical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 8: Go-to-Market - Marketing channel types
DO $$ BEGIN
  CREATE TYPE eva_channel_type AS ENUM ('paid', 'organic', 'earned', 'owned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 9: Roadmap - Milestone prioritization
DO $$ BEGIN
  CREATE TYPE eva_milestone_priority AS ENUM ('now', 'next', 'later');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 11: Launch Planning - Launch phase types
DO $$ BEGIN
  CREATE TYPE eva_launch_type AS ENUM ('soft_launch', 'beta', 'general_availability');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 11: Launch Planning - Release categorization
DO $$ BEGIN
  CREATE TYPE eva_release_category AS ENUM ('feature', 'bugfix', 'infrastructure', 'documentation', 'configuration');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Stage 12: Health Monitoring - Overall health assessment
DO $$ BEGIN
  CREATE TYPE eva_health_band AS ENUM ('critical', 'fragile', 'viable', 'strong');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Apply this migration: supabase db push --include-all
-- 2. Execute column type conversion migration (ALTER TABLE ... ALTER COLUMN ...)
-- 3. Drop old CHECK constraints
-- 4. Add ENUM-based constraints to existing columns
