-- Migration: 20260712_feedback_authenticated_select_scope
-- SD: SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001 (security / RLS, Tier 3)
--
-- TIER-2 (NON-ADDITIVE: DROP POLICY) — CHAIRMAN-GATED APPLY. Do NOT auto-apply.
-- Apply only via the 3-factor ceremony (--issue-token -> MIGRATION_APPLY_TOKEN
-- + the chairman's @approved-by attestation line, inserted by the scribe upon
-- verbal approval, directly below this block). An apply without the attestation
-- line MUST refuse.
--
-- THE GAP (verified live via pg_policies 2026-07-12, twice — Adam corr ab9559a9,
-- re-verified at claim): select_feedback_policy = {authenticated} SELECT USING (true).
-- Any logged-in user of any venture could read EVERY feedback row cross-venture,
-- including harness-internal rows (chairman commissions, security findings —
-- 7,909 rows visible; the scoped predicate reduces this to the genuine
-- user-feedback set).
--
-- THE FIX: mirror the already-scoped anon policy venture_user_select_feedback
-- exactly. Harness/machine rows are excluded by BOTH clauses independently
-- (defense-in-depth): machine feedback_type values don't match 'user_%', and
-- lib/governance/emit-feedback.js exposes no venture_id parameter so every
-- harness row has venture_id NULL.
--
-- SCOPE ISOLATION: touches ONLY select_feedback_policy. The anon policies
-- (owned by in-flight SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001) and the
-- service-role-only write policies are deliberately not referenced. The service
-- role bypasses RLS, so harness tooling is unaffected.
--
-- Fail-closed: RLS stays enabled throughout; DROP+CREATE in one transaction
-- means no observable window, and any fault yields default-deny, never qual=true.

BEGIN;

DROP POLICY IF EXISTS select_feedback_policy ON public.feedback;

CREATE POLICY select_feedback_policy ON public.feedback
  FOR SELECT TO authenticated
  USING (((feedback_type)::text LIKE 'user_%') AND (venture_id IS NOT NULL));

COMMIT;
