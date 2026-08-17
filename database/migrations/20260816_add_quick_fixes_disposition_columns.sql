-- @approved-by: codestreetlabs@gmail.com
-- (chairman verbal "approve disposition file", window-packet sitting item 2, 2026-08-17 ~20:1xZ, Adam scribe 08049808)
-- Migration: Add disposition columns to quick_fixes table
-- Purpose: Structured, machine-readable disposition surface for
--          scripts/coordinator-stale-qf-disposition-sweep.mjs, which periodically
--          re-verifies stale (age>3d, unclaimed, open) quick_fixes rows against a
--          two-signal citation checker (lib/eva/quick-fix-citation-checker.js) and
--          either closes the ones whose premise is machine-verifiably resolved or
--          absent, marks near-duplicates against a surviving row, or re-stamps
--          verified_at on rows confirmed still-present. Previously an unclaimed
--          open QF had NO periodic disposition mechanism at all -- only
--          claim/PR-gated staleness fences existed (qf-auto-start.cjs,
--          clear-stale-qf-claims, orphan-qf-reaper), none of which ever touch a
--          row nobody has claimed.
-- Created: 2026-08-16
-- Related: SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001
-- @staged: additive only (new columns, no ALTER of any existing column's type or
--          constraint) -- but this is CONTENT-GATED, not merely additive-safe: a
--          bulk --apply run WRITES disposition/status on live rows based on an
--          automated citation-checker verdict, so it requires the coordinator's
--          one-time H2 two-sided-sample verification pass (FR-8) before the first
--          bulk run, in addition to the canonical authorized-apply handshake
--          (scripts/apply-migration.js --prod-deploy with a genuine
--          @approved-by: <email> or @delegated-by: adam token), which a LEO fleet
--          worker session cannot self-stamp. A human/coordinator/Adam must run the
--          schema apply; the coordinator separately confirms H2 via the sweep's
--          own --h2-confirmed=<ISO-date> CLI flag before any bulk --apply.
-- @coordination-note: SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 (draft/LEAD, as of this
--          writing) separately scopes a timestamp -> timestamptz conversion
--          touching quick_fixes' EXISTING columns (created_at, started_at,
--          completed_at, not_before is already timestamptz). This migration only
--          ADDS new columns (verified_at/disposed_at are created as timestamptz
--          from the start), so there is no direct DDL conflict -- informational
--          only, for the ceremony operator's awareness of related in-flight work
--          on this same table.

BEGIN;

-- Disposition: what the sweep decided about this row's premise, or how it was
-- resolved. NULL means "never touched by the sweep" (default, no behavior change
-- for any pre-existing or newly-created row).
ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS disposition text
  CHECK (disposition IN (
    'premise_resolved',        -- citation checker: ABSENT (fix shipped / file gone) -> status='closed'
    'premise_unverified_stale', -- citation checker: INCONCLUSIVE (no reliable signal) -> status='closed'
    'duplicate_of',             -- content-fingerprint dedupe: near-duplicate of a surviving QF -> status='closed'
    're_verified',              -- citation checker: STILL-PRESENT, <=3 extracted paths -> status unchanged ('open')
    'promoted'                  -- citation checker: STILL-PRESENT, >3 extracted paths -> status='escalated'
  ))
  DEFAULT NULL;

ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS disposition_reason_code text;

ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS disposed_at timestamptz;

ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS disposed_by text;

-- Deliberately timestamptz (not the legacy `timestamp without time zone` shape of
-- created_at/started_at/completed_at) -- new columns start correct rather than
-- inheriting the tz-naive defect FOUR-AUDIT-CRITICAL-001 exists to fix elsewhere
-- on this same table. Read via lib/time/pg-timestamp.cjs pgTimestampMs() same as
-- every other timestamp on this table, JS-side only, never raw SQL GREATEST.
ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS duplicate_of_id TEXT REFERENCES quick_fixes(id);

COMMENT ON COLUMN quick_fixes.disposition IS
  'Structured sweep verdict (scripts/coordinator-stale-qf-disposition-sweep.mjs). NULL = never
   swept. See CHECK constraint for the 5 possible values and their paired status transition.';
COMMENT ON COLUMN quick_fixes.disposition_reason_code IS
  'Machine-checkable evidence code, e.g. test_passing:<path>, file_absent:<path>. Populated for
   every premise_resolved row; NULL is invalid for that disposition (see sweep unit tests).';
COMMENT ON COLUMN quick_fixes.disposed_at IS
  'Timestamp the sweep last wrote a disposition to this row.';
COMMENT ON COLUMN quick_fixes.disposed_by IS
  'Actor that wrote the disposition, e.g. coordinator-stale-qf-disposition-sweep. Not a session
   or chairman identity -- an automated-actor label for audit trail.';
COMMENT ON COLUMN quick_fixes.verified_at IS
  'Timestamp the premise was last machine-confirmed still-present (re_verified/promoted) or
   resolved. Read by lib/fleet/qf-auto-start.cjs isAutoStartableQF() as an alternate, more-recent
   staleness-clock source alongside created_at (whichever is more recent wins).';
COMMENT ON COLUMN quick_fixes.duplicate_of_id IS
  'FK to the surviving quick_fixes.id this row was closed as a near-duplicate of. TEXT, not
   uuid -- quick_fixes.id is a TEXT QF-YYYYMMDD-NNN identifier, not a uuid (LEAD-phase
   correction to the original proposal, which specified uuid and would not have applied).';

COMMIT;

-- Rollback:
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS disposition;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS disposition_reason_code;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS disposed_at;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS disposed_by;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS verified_at;
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS duplicate_of_id;
