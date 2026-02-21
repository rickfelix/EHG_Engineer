-- Migration: Expand eva_scheduler_metrics event_type CHECK constraint
-- SD: SD-LEO-FIX-CLOSE-FOUNDATION-CLEANUP-001
-- Purpose: Allow OKR event types (okr.objective.scored, okr.snapshot.completed, okr.mid_month_review.completed)
-- Applied: 2026-02-21

ALTER TABLE eva_scheduler_metrics DROP CONSTRAINT eva_scheduler_metrics_event_type_check;

ALTER TABLE eva_scheduler_metrics ADD CONSTRAINT eva_scheduler_metrics_event_type_check
CHECK ((event_type = ANY (ARRAY[
  'scheduler_poll'::text,
  'scheduler_dispatch'::text,
  'scheduler_cadence_limited'::text,
  'scheduler_circuit_breaker_pause'::text,
  'scheduler_error'::text,
  'okr.objective.scored'::text,
  'okr.snapshot.completed'::text,
  'okr.mid_month_review.completed'::text
])));
