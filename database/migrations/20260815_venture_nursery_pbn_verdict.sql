-- Migration: add pbn_verdict jsonb to venture_nursery (Proven / Better / New gate)
-- Date: 2026-08-15
-- SD: SD-LEO-FEAT-PROVEN-BETTER-NEW-001 (TR-1, TR-2)
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- CHAIRMAN-GATED. Per the SD family convention this file is a DELIVERABLE, not an applied
-- change. It is inert until the approver header below is filled with the approving bare
-- email (must match git user.email — see scripts/lib/migration-guards.js APPROVED_BY_RE)
-- and applied via `node scripts/apply-migration.js`.
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK. checkApproverFactor() fails closed on a missing header, so this
--     migration cannot be applied by accident. Do NOT fill this in on the SD's behalf.
--
-- ============================================================================
-- MEASURED PRE-STATE (live catalog over the pooler, 2026-08-15 — not read from a file)
--   venture_nursery                : 16 rows, 17 columns, pbn_verdict ABSENT (count=0)
--   RLS                            : enabled, NOT forced
--   policies on venture_nursery    : venture_nursery_service_all -> {public}, cmd=SELECT ONLY
--   service_role.rolbypassrls      : TRUE  (so the write path is not gated by RLS at all)
--   triggers on venture_nursery    : NONE user-defined (only internal RI constraint triggers)
-- ============================================================================
--
-- READ BEFORE EDITING — three live-state facts that this migration does NOT fix:
--
-- (1) THE DEPENDENT VIEW WILL NOT SEE THIS COLUMN.
--     v_nursery_pending_evaluation is defined as `SELECT vn.* ...`. Postgres does NOT store
--     the star — it EXPANDS it to an explicit column list at CREATE time and FREEZES it. The
--     view is frozen at the 17 pre-PBN columns, verified via pg_attribute. Adding a column
--     here does not re-expand it, and ALTER VIEW ... SET (security_invoker=on) would not
--     either. Any consumer that reads pbn_verdict THROUGH that view gets PostgREST 42703.
--     This is the exact defect class already documented in
--     20260801_refresh_v_patterns_with_decay_column_drift.sql (six columns lost the same way).
--     DECISION FOR EXEC: read pbn_verdict from the base table, or ship a separate view-refresh
--     migration. Deliberately NOT bundled here — this file is column-add only.
--
-- (2) updated_at WILL NOT ADVANCE ON A pbn_verdict WRITE.
--     venture_nursery has NO user-defined trigger (measured). updated_at is DEFAULT NOW() on
--     insert and never touched again. A PBN gate write must set updated_at explicitly or the
--     row will claim it was last modified at park time.
--
-- (3) pbn_verdict IS ANON-READABLE THE MOMENT IT EXISTS — RESOLVED, not a schema bug.
--     venture_nursery's only policy is FOR SELECT TO public USING (true), and anon holds the
--     SELECT grant. RESOLUTION (SECURITY sub-agent review, evidence row
--     47472599-654a-4b15-89a7-055f02ea3e8e, confidence 92, PLAN phase of
--     SD-LEO-FEAT-PROVEN-BETTER-NEW-001): option (a) — inherit the existing posture, NO
--     column-level restriction. Consumer-measured basis: a live anon-key REST read confirmed
--     16/16 nursery rows already publish a "friction point -> differentiated solution" thesis
--     in the (already anon-readable) description column — the same content class as the
--     BETTER/NEW buckets. pbn_verdict therefore widens no exposure; it structures content
--     already public on that row. Contrast nursery_evaluation_log ({service_role}-only): the
--     TR-5 durable audit trail is correctly locked down, while this column mirrors the public
--     row it sits on — the overall posture is coherent, not asymmetric.
--     TWO BINDING CONDITIONS on this resolution (see PRD acceptance_criteria for
--     SD-LEO-FEAT-PROVEN-BETTER-NEW-001): C1 — the PBN writer must never place chairman
--     identity/attribution, internal identifiers beyond source_ref, or raw model-prompt dumps
--     into pbn_verdict.rule_trace (the equivalence this resolution rests on is a property of
--     the WRITER, not the schema). C2 — this note itself, now satisfied.
--     ROLLBACK if this posture is later judged wrong: REVOKE SELECT(pbn_verdict) ON
--     public.venture_nursery FROM anon in a follow-up migration — additive, zero data loss.
--     Separately filed (out of this SD's scope by design, C3): venture_nursery's anon-read-all
--     posture is a PLATFORM-WIDE default (208 anon-readable tables, 931 objects with anon
--     write grants, per SECURITY's measurement) — harness_backlog feedback row
--     54b9686a-299e-47ff-ad2a-86031c12cade. Fixing it here would address 1 of 208 while
--     implying the other 207 were reviewed; this SD does not touch venture_nursery's RLS
--     policies or grants.
--     C4 (SECURITY re-review, EXEC-TO-PLAN handoff, F3): the 16-row measured basis above
--     carries source_ref.candidate (traversability-gate.js's parkFailedCandidate writer), NOT
--     source_ref.brief — 0/16. This SD's own writer (venture-nursery.js parkVenture) produces
--     source_ref.brief instead. The equivalence still holds, for an invariant this note did NOT
--     previously state: parkVenture co-publishes ALL FIVE prompt inputs (name, problem_statement,
--     solution, target_market, thesis) into source_ref.brief on the SAME anon-readable row in
--     the SAME insert as pbn_verdict — so pbn_verdict's richer structure exposes no field the
--     row doesn't already expose beside it. THIS INVARIANT IS LOAD-BEARING: it holds only as
--     long as every field the PBN scorer's prompt reads from is ALSO in source_ref.brief. If a
--     future change feeds the scorer any input NOT already published there, this resolution
--     must be re-reviewed before that change ships.
--
-- ============================================================================

BEGIN;

-- TR-1: one additive, nullable jsonb column. NULL is meaningful and load-bearing: it is
-- "this nursery row has never been through the PBN gate", which is distinct from any verdict.
-- No DEFAULT — a default '{}'::jsonb would make all 16 existing rows indistinguishable from
-- rows that were gated and produced an empty result.
ALTER TABLE public.venture_nursery
  ADD COLUMN IF NOT EXISTS pbn_verdict JSONB;

-- TR-2 shape enforcement. The single highest-value line in this file.
-- Without it, `pbn_verdict->>'verdict' = 'PASS'` silently matches ZERO rows if the writer ever
-- emits 'pass' or 'Pass' — a filter on a mistyped jsonb path returns empty rather than
-- erroring, so the gate would read as "nothing passed" instead of failing loudly.
-- Written as a separate, named ALTER so it can be dropped independently if PLAN prefers to
-- enforce the enum only in application code.
ALTER TABLE public.venture_nursery
  ADD CONSTRAINT venture_nursery_pbn_verdict_shape_check
  CHECK (
    pbn_verdict IS NULL
    OR (
      jsonb_typeof(pbn_verdict) = 'object'
      AND pbn_verdict ? 'verdict'
      AND pbn_verdict ->> 'verdict' IN ('PASS', 'REJECT', 'TRIM')
      AND (NOT pbn_verdict ? 'rule_trace' OR jsonb_typeof(pbn_verdict -> 'rule_trace') = 'array')
    )
  );

COMMENT ON COLUMN public.venture_nursery.pbn_verdict IS
  'SD-LEO-FEAT-PROVEN-BETTER-NEW-001. The Proven/Better/New gate verdict from THIS ROW''s own '
  'park (TR-8, corrected post-PLAN): this column is NEVER updated in place after insert — '
  'reactivateVenture() does not touch it, and a re-check at unpark writes its fresh verdict to '
  'a DIFFERENT destination (a brand-new venture_nursery row on REJECT/TRIM, or the resulting '
  'venture''s metadata.stage_zero.pbn_verdict on PASS). History therefore survives by '
  'immutability, not by an append-only log compensating for an overwrite. '
  'nursery_evaluation_log via recordNurseryEvaluation() (TR-5) is still the independently- '
  'queryable audit trail — query it for "every verdict this idea has ever received across '
  'reactivations", not this column, which only ever answers "what did THIS row score". '
  'Shape: {proven:{mechanic,citations,coverage}, better:{hypothesis,friction_point,citations,'
  'coverage}, new:{wedge,wedge_count,coverage}, verdict:PASS|REJECT|TRIM, measured_at:ISO-8601 '
  'UTC, rule_trace:[], scoring_error:string|null}. coverage is a BOOLEAN (pbn-gate.js '
  'resolveBucketCoverage), NOT a fraction or percentage. NULL = never gated (distinct from any '
  'verdict). scoring_error is set only when the LLM scorer failed and buckets were forced '
  'fail-closed -- a REJECT with scoring_error set is NOT a merit rejection, see the '
  'SCORING_FAILED rule_trace entry (post-EXEC-TO-PLAN adversarial review finding). verdict is '
  'CHECK-constrained; the rest of the shape is by convention.';

COMMIT;

-- ============================================================================
-- DELIBERATELY OMITTED
--
-- No index. 16 rows. A GIN index on pbn_verdict would cost more to maintain than a seq scan
-- costs to run, and would be premature at every projected volume this table has. Revisit only
-- if venture_nursery clears ~10k rows.
--
-- No normalization of rule_trace / citations into side tables. At 16 rows with jsonb TOASTed
-- past 2KB automatically, inline is correct. The usual argument for normalizing an audit-ish
-- array — "you lose history on overwrite" — is already answered by TR-5 routing every verdict
-- into nursery_evaluation_log, so rule_trace here is only ever the trace of the CURRENT verdict.
-- ============================================================================

-- ============================================================================
-- ROLLBACK
--   BEGIN;
--   ALTER TABLE public.venture_nursery
--     DROP CONSTRAINT IF EXISTS venture_nursery_pbn_verdict_shape_check;
--   ALTER TABLE public.venture_nursery DROP COLUMN IF EXISTS pbn_verdict;
--   COMMIT;
--
--   Safe at time of writing: the column is additive and no live object depends on it.
--   v_nursery_pending_evaluation is frozen without pbn_verdict (see note 1), so the DROP does
--   NOT cascade into it. Re-verify that before rolling back if the view has been refreshed.
-- ============================================================================
