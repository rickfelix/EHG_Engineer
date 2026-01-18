-- Migration: Quality Lifecycle Fixes (SD-QUALITY-FIXES-001)
-- Created: 2026-01-18
-- Purpose: Fix issues identified through triangulated AI analysis (Claude, OpenAI, Gemini)
-- Application: EHG Engineer (Management Dashboard)
-- Database: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)

-- =============================================================================
-- FIX 1: Add RLS policies to feedback_sd_map (missing from 391 migration)
-- Identified by: OpenAI (confirmed by triangulation)
-- =============================================================================

ALTER TABLE IF EXISTS feedback_sd_map ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS select_feedback_sd_map_policy ON feedback_sd_map;
DROP POLICY IF EXISTS insert_feedback_sd_map_policy ON feedback_sd_map;
DROP POLICY IF EXISTS update_feedback_sd_map_policy ON feedback_sd_map;
DROP POLICY IF EXISTS delete_feedback_sd_map_policy ON feedback_sd_map;

-- authenticated: SELECT only (consistent with feedback and releases tables)
CREATE POLICY select_feedback_sd_map_policy ON feedback_sd_map
  FOR SELECT TO authenticated
  USING (true);

-- service_role: ALL
CREATE POLICY insert_feedback_sd_map_policy ON feedback_sd_map
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY update_feedback_sd_map_policy ON feedback_sd_map
  FOR UPDATE TO service_role
  USING (true);

CREATE POLICY delete_feedback_sd_map_policy ON feedback_sd_map
  FOR DELETE TO service_role
  USING (true);

-- =============================================================================
-- FIX 2: Update source_type CHECK constraint (schema/code mismatch)
-- Identified by: OpenAI (confirmed - code values would fail CHECK constraint)
-- Schema allowed: 'manual_feedback', 'auto_capture', 'uat_failure'
-- Code uses: 'error_capture', 'uncaught_exception', 'unhandled_rejection', 'manual_capture'
-- =============================================================================

-- Drop the old constraint
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_source_type_check;

-- Add new constraint with all required values
-- Original values: manual_feedback, auto_capture, uat_failure
-- Code values: error_capture, uncaught_exception, unhandled_rejection, manual_capture
ALTER TABLE feedback ADD CONSTRAINT feedback_source_type_check
  CHECK (source_type IN (
    'manual_feedback',       -- Original: user-submitted feedback via UI/CLI
    'auto_capture',          -- Original: automated capture systems
    'uat_failure',           -- Original: UAT test failures
    'error_capture',         -- Code: default for captureError()
    'uncaught_exception',    -- Code: process.on('uncaughtException')
    'unhandled_rejection',   -- Code: process.on('unhandledRejection')
    'manual_capture'         -- Code: captureException() API
  ));

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- 1. Added RLS policies to feedback_sd_map (SELECT for authenticated, ALL for service_role)
-- 2. Updated source_type CHECK constraint to include all values used by feedback-capture.js
--
-- Note on burst detection thresholds (documented in burst-detector.js):
-- PRD specified 100+ errors/minute, implementation uses 3+ occurrences in 5-minute window.
-- This deviation is intentional for the CLI-centric workflow of EHG Engineer where
-- error "storms" are less frequent than production web apps. Threshold is configurable
-- via BURST_CONFIG and can be adjusted for venture-specific needs.
