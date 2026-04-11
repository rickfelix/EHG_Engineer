-- SD-MAN-FIX-FIX-DUPLICATE-ARTIFACTS-001
-- Backfill NULL decision_type in chairman_decisions to 'stage_gate'.
-- At L0 autonomy, createOrReusePendingDecision() previously omitted decision_type,
-- causing NULL values that break .neq('decision_type', 'advisory') filters
-- (PostgreSQL NULL != value returns NULL, not TRUE).
--
-- This migration is idempotent: safe to run multiple times.

UPDATE chairman_decisions
SET decision_type = 'stage_gate'
WHERE decision_type IS NULL;
