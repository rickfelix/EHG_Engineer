-- Migration: ship_review_findings synthesized_at column
-- SD-MAN-INFRA-RECONCILE-S18-S26-001
-- Date: 2026-04-28
--
-- Adds synthesized_at TIMESTAMPTZ to distinguish backfilled rows (post-hoc
-- reconciliation of historical merges) from real-time-logged rows produced
-- by /ship Step 5.5. Used by SD-MAN-INFRA-RECONCILE-S18-S26-001's audit
-- script (scripts/audit-phantom-completions.js) when inserting backfill
-- rows for SDs whose PRs merged before ship_review_findings was wired in.
--
-- Existing rows: synthesized_at remains NULL. Real-time-logged future rows
-- continue to leave it NULL. Only the audit script populates it.
--
-- Idempotent: uses IF NOT EXISTS.

ALTER TABLE ship_review_findings
  ADD COLUMN IF NOT EXISTS synthesized_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN ship_review_findings.synthesized_at IS
  'Set when row was inserted by post-hoc reconciliation (e.g., scripts/audit-phantom-completions.js for SD-MAN-INFRA-RECONCILE-S18-S26-001). NULL for real-time-logged rows from /ship Step 5.5.';
