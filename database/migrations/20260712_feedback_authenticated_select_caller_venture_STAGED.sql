-- Migration: 20260712_feedback_authenticated_select_caller_venture_STAGED
-- SD: SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001 (security / RLS residual)
--
-- ================================================================
-- STAGED -- NOT APPLIED BY THIS SD. See "Apply runbook" below.
-- ================================================================
--
-- TIER-2 (NON-ADDITIVE: DROP POLICY) — CHAIRMAN-GATED APPLY. Do NOT auto-apply.
-- Apply only via the 3-factor ceremony (--issue-token -> MIGRATION_APPLY_TOKEN
-- + the chairman's @approved-by attestation line, inserted by the scribe upon
-- verbal approval, directly below this block). An apply without the attestation
-- line MUST refuse.
--
-- THE RESIDUAL: SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001 (shipped, PR #6029)
-- scoped select_feedback_policy from an unconditional USING(true) leak to
-- USING (feedback_type LIKE 'user_%' AND venture_id IS NOT NULL) -- this closed
-- the critical cross-venture leak, but that fix's own migration comment
-- explicitly named the remaining gap: no per-venture CALLER binding. Any
-- authenticated user can still read any OTHER venture's user_% feedback rows
-- (title/description/metadata) -- just not ALL feedback unconditionally
-- anymore. That migration's comment: "The accepted residual (no per-venture
-- ownership binding) is tracked for a follow-up SD at apply time." This SD is
-- that follow-up.
--
-- THE FIX: add fn_user_has_venture_access(venture_id) as an additional
-- conjunct. This is the established local idiom (see product_requirements_v2,
-- sd_phase_handoffs) -- a SECURITY DEFINER helper that returns true
-- unconditionally for chairman/admin/owner roles (preserving cross-venture
-- oversight by design on this internal operating-company platform), and
-- otherwise resolves the venture's company_id and checks user_company_access.
-- Unlike the anon-role case (structurally inexpressible -- a shared
-- unauthenticated key can't carry per-caller identity), authenticated callers
-- DO carry a resolvable auth.uid(), so genuine scoping is expressible here --
-- this is a predicate addition, not a policy removal.
--
-- WHY STAGED, NOT APPLIED HERE: same risk class as the sibling anon-role
-- DROP (20260712_drop_venture_user_select_feedback_STAGED.sql) -- a live RLS
-- change on a shared production table. Grounding (SECURITY sub-agent,
-- 2026-07-12) found zero current authenticated consumers of cross-venture
-- feedback reads (all EHG_Engineer feedback reads use service_role, which
-- bypasses RLS; no src/client/app .from('feedback') call sites exist), and
-- only 3 rows are exposed under current auth population (3 accounts, all
-- internal). Low practical risk, but a chairman checkpoint on an irreversible
-- -in-spirit RLS DROP+CREATE stays the appropriately humble default for this
-- risk class, matching this repo's established precedent.
--
-- SCOPE ISOLATION: touches ONLY select_feedback_policy. Does not touch
-- venture_user_select_feedback (owned by the sibling anon-role SD's own
-- staged drop) or the service-role-only write policies.
--
-- Fail-closed: RLS stays enabled throughout; DROP+CREATE in one transaction
-- means no observable window, and any fault yields default-deny.
--
-- APPLY RUNBOOK (for whoever applies this):
--   1. Re-confirm (via pg_policies) the live predicate still matches the
--      SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001 post-fix state
--      (feedback_type LIKE 'user_%' AND venture_id IS NOT NULL) -- if it has
--      drifted, stop and re-ground before applying.
--   2. Re-confirm no new authenticated cross-venture consumer of feedback
--      SELECT has appeared since grounding (grep src/, client/, app/ in both
--      EHG_Engineer and the ehg repo for .from('feedback') calls using an
--      authenticated, not service_role, client).
--   3. Apply this file via the standard apply-migration.js --prod-deploy flow
--      (git-committed + token + @approved-by guards already satisfied by this
--      file's own header -- issue a fresh token; tokens are single-use/1h-TTL).
--   4. Re-verify: with a non-chairman authenticated JWT scoped to venture A's
--      company, GET /rest/v1/feedback?feedback_type=like.user_* returns only
--      venture A's rows; with a chairman-role JWT, all matching rows are
--      still visible (bypass preserved).

-- @approved-by: rickfelix2000@gmail.com
-- Chairman verbal approval 2026-07-16 (in-session, Adam scribe): "you have my approval
-- to run the migration". Re-grounded at apply time: fn_user_has_venture_access exists and
-- matches the documented shape; live select_feedback_policy predicate unchanged (no drift);
-- consumer landscape re-checked — the ehg Quality dashboard + feedbackDataAccess read feedback,
-- but the 2 privileged accounts (admin, owner) bypass via fn_is_chairman, and the only scoped
-- account is the roleless one this binding intends to restrict. Net: strictly-additive predicate,
-- low risk, conclusion unchanged from the chairman-approved premise.

BEGIN;

DROP POLICY IF EXISTS select_feedback_policy ON public.feedback;

CREATE POLICY select_feedback_policy ON public.feedback
  FOR SELECT TO authenticated
  USING (
    ((feedback_type)::text LIKE 'user_%')
    AND (venture_id IS NOT NULL)
    AND fn_user_has_venture_access(venture_id)
  );

COMMIT;
