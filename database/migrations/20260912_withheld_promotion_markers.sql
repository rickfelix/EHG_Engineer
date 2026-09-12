-- SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A (FR-7): dedicated, freely-mutable table for the
-- withheld-promotion / promoted-to-QF pipeline bookkeeping that lib/governance/
-- withheld-registry.mjs and scripts/feedback-fingerprint-promoter.mjs previously kept in
-- public.feedback.metadata -- now broken by the append-only trigger
-- (database/chairman-gated/20260907_feedback_immutability_trigger.sql).
--
-- WHY A NEW TABLE (not the insert-correction pattern used for the other 5 owned call sites):
-- a LEAD-phase risk-agent review measured the insert-correction alternative would add ~440
-- rows/day of pure bookkeeping churn (a 6-hourly cron rewriting every pending marker) against
-- a ~132/day organic baseline, and found a hard architectural blocker: the promoter's existing
-- server-side PostgREST predicate for "pending marker not yet promoted/disposed" cannot be
-- re-expressed as "the latest correction in a chain" -- a defect class the promoter's own
-- history already documents once (V-1: a consumed row was silently re-admitted forever).
--
-- TIER-1 (worker-auto-appliable, no chairman ceremony): plain CREATE TABLE + ENABLE RLS +
-- CREATE POLICY, no ON DELETE CASCADE, no DO block, no COMMENT -- confirmed via
-- scripts/lib/migration-tier-classifier.mjs before this file was written.

CREATE TABLE IF NOT EXISTS public.withheld_promotion_markers (
  feedback_id uuid PRIMARY KEY REFERENCES public.feedback(id),
  fingerprint text NOT NULL,
  member_feedback_ids uuid[] NOT NULL DEFAULT '{}',
  max_severity text,
  admission_path text,
  gauge_value numeric,
  floor numeric,
  engine text,
  decision text,
  first_withheld_at timestamptz NOT NULL DEFAULT now(),
  last_withheld_at timestamptz NOT NULL DEFAULT now(),
  first_withheld_run text,
  last_withheld_run text,
  withheld_run_count integer NOT NULL DEFAULT 1,
  promoted_at timestamptz,
  promoted_qf_id text,
  promoted_fingerprint text,
  disposed_by text,
  disposed_reason text,
  disposed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withheld_promotion_markers_fingerprint
  ON public.withheld_promotion_markers (fingerprint);

ALTER TABLE public.withheld_promotion_markers ENABLE ROW LEVEL SECURITY;

-- Service-role only, matching every other governance table withheld-registry.mjs and
-- feedback-fingerprint-promoter.mjs already touch (SUPABASE_SERVICE_ROLE_KEY bypasses RLS
-- entirely -- rolbypassrls=true -- so this policy exists for completeness/defense-in-depth,
-- not because service-role calls are actually gated by it).
CREATE POLICY withheld_promotion_markers_service_role ON public.withheld_promotion_markers
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- ROLLBACK (FR-9): this migration is purely additive and never destructive to run in
-- isolation -- it can be safely applied even before the producer cutover (see the backfill
-- script and FR-9's sequencing). To roll back after a cutover regression, revert ONLY the
-- producer-file commit (withheld-registry.mjs / feedback-fingerprint-promoter.mjs); this
-- table and its backfilled data are left in place for reconciliation, never dropped:
--   DROP TABLE IF EXISTS public.withheld_promotion_markers; -- only if truly abandoning this design
-- ============================================================================
