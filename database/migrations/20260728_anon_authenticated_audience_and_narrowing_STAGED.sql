-- SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 — recorded audience + the third narrowing.
--
-- *** TIER-2. CHAIRMAN-GATED APPLY. DO NOT AUTO-APPLY. ***
-- Contains DROP POLICY (a TIER-2 forbidden top-level verb per scripts/lib/migration-tier-classifier.mjs)
-- and COMMENT ON TABLE (also TIER-2 — only COMMENT ON COLUMN is TIER-1-eligible). Both require the
-- 3-factor chairman ceremony:
--     node scripts/apply-migration.js <this-file> --prod-deploy
-- after --issue-token, with an `-- @approved-by: <email>` attestation line appended by the ceremony.
-- Do NOT route through scripts/run-sql-migration.js — that would execute it while bypassing the gate
-- for an access-control change. isDelegatableForApply() refuses this file at code level regardless.
--
-- ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
-- Three tables carry a SELECT policy admitting a principal broader than service_role with no
-- row-level predicate narrowing it to an intended audience. Two of them (switchon_auto_actions,
-- switchon_decision_audit) are already handled by a SEPARATE, EARLIER staged file —
--     database/migrations/20260718_switchon_rls_narrow_authenticated_read_STAGED.sql
-- which narrows both to fn_is_chairman(). THIS FILE DOES NOT DUPLICATE IT. Verified at PLAN and
-- again at EXEC: that file's DROP targets are still present live and still qual=true, so it will
-- bite rather than silently no-op when applied.
--
-- What remains here is the THIRD instance plus the recorded-audience requirement for all three.
--
-- ── THE CRITERION, so this is decidable by whoever reads it next ──────────────────────────────
-- Does the policy admit a principal broader than service_role WITHOUT a row-level predicate that
-- narrows it to an intended audience?
--   fn_is_chairman()                    -> narrows. A real predicate about the caller.
--   auth.role() = 'authenticated'       -> DOES NOT narrow. It re-states the role the policy
--                                          already grants to, which is a tautology wearing the
--                                          shape of a check.
--
-- ── WHY research_intelligence_reference IS NOT SIMPLY REVOKED ─────────────────────────────────
-- Its authenticated read is INTENTIONAL. It is a standing landscape reference — the versioned data
-- product RESEARCH_INTELLIGENCE_OPERATOR maintains, whose entry_type discriminates rows consumed by
-- Child B/C/D. Revoking authenticated read would break deliberate consumers. Narrowing it to
-- fn_is_chairman(), as its two siblings get, would break them just as thoroughly.
--
-- So the fix is NOT to narrow the PRINCIPAL — for this table the broad principal is correct — but to
--   (a) narrow the ROWS to the ones the audience actually needs, and
--   (b) RECORD that the broad principal is intentional, so the next auditor does not have to infer
--       it from the word "reference" in the table's name. Inferring audience from a name is the
--       exact move that produced a wrong classification on this finding and was withdrawn.
--
-- ROW NARROWING CHOSEN: is_current = true. The table is versioned (version, is_current,
-- superseded_by); consumers read the CURRENT landscape. Superseded revisions are history and have no
-- audience beyond service_role. If a consumer is later found to need superseded rows, the audience
-- statement below is where that decision gets recorded and this predicate revisited — that is the
-- point of recording it rather than leaving it implicit.
--
-- *** HONEST SCOPE OF WHAT THIS NARROWING BUYS (corrected after SECURITY review f3cdce33). ***
-- This is DEFENCE IN DEPTH, not the closing of an active leak, and it should not be claimed as one:
--   • Both real consumers ALREADY self-filter is_current=true at the application layer regardless
--     of RLS — lib/eva/stage-zero/data-feed.js:79 and lib/eva/stage-zero/modeling.js:104.
--   • The "Child D reads superseded rows" consumer described in the earlier draft of this comment
--     DOES NOT EXIST IN CODE. lib/eva/cross-venture-learning.js:698-760 grades forecasts against
--     actuals and never queries this table. I inferred that consumer rather than verifying it,
--     which is the same move — reasoning about intent instead of measuring it — that this SD was
--     written to stop. Removed rather than left standing.
-- So the value here is that the boundary now holds in the DATABASE rather than only by the good
-- behaviour of two callers. That is worth having; it is not an incident being closed.

BEGIN;

-- ── 1. The third instance: replace the role-restatement with a real row predicate ─────────────
-- Old: USING (auth.role() = 'authenticated' OR auth.role() = 'service_role') on roles={public}.
-- That admits every authenticated principal to every row INCLUDING superseded revisions, and its
-- qual answers a question it already knew the answer to.
DROP POLICY IF EXISTS research_intel_ref_read ON public.research_intelligence_reference;
CREATE POLICY research_intel_ref_read ON public.research_intelligence_reference
  FOR SELECT TO authenticated, service_role
  USING (is_current = true OR auth.role() = 'service_role');

-- ── 2. Recorded intended audience (FR-1) ──────────────────────────────────────────────────────
-- Structured "Audience:" line appended to the existing prose. The convention: one line beginning
-- `Audience:` naming WHO may read and WHY, so the audit is decidable without reading the policy or
-- guessing from the table name. Machine-readable by the FR-4 verification query.
COMMENT ON TABLE public.research_intelligence_reference IS
  'Standing landscape reference (SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-A): the versioned '
  'data product the RESEARCH_INTELLIGENCE_OPERATOR maintains. entry_type discriminates tech/model-'
  'landscape rows (Child B) from the rows consumed by Children C and D. '
  'Audience: all authenticated fleet principals, CURRENT revisions only — this is a shared reference '
  'data product and the broad read is INTENTIONAL, not an omitted REVOKE. Superseded revisions are '
  'history and are service_role-only. Recorded per SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 FR-1 '
  'so this exemption is stated rather than inferred from the word "reference" in the table name.';

COMMENT ON TABLE public.switchon_auto_actions IS
  'PC-5 rate/soak log for op-co switch-on auto-proceeds (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C). '
  'One row per auto-proceed decision; read by checkRateSoak() to enforce a per-component rate cap and '
  'minimum soak spacing. '
  'Audience: chairman only. Internal governance/automation history with no tenant or customer data and '
  'no consumer outside the service role and chairman review. Narrowed to fn_is_chairman() by '
  'database/migrations/20260718_switchon_rls_narrow_authenticated_read_STAGED.sql. Recorded per '
  'SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 FR-1.';

COMMENT ON TABLE public.switchon_decision_audit IS
  'CONST-003 audit stamp for every op-co switch-on decision (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C, '
  'PC-7): actor, policy_version (chairman_switchon_policy state at decision time), and a full '
  'evidence_snapshot. '
  'Audience: chairman only. An audit trail of governance decisions; broad read would expose the '
  'decision history of every component to any logged-in principal. Narrowed to fn_is_chairman() by '
  'database/migrations/20260718_switchon_rls_narrow_authenticated_read_STAGED.sql. Recorded per '
  'SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 FR-1.';

COMMIT;

-- ── VERIFICATION, to be run AFTER the chairman applies this ───────────────────────────────────
--   node scripts/audit/broad-policy-audience-audit.mjs
-- Before apply it reports three tables lacking a narrowing predicate; after, zero. That query is the
-- only way this SD's outcome becomes checkable, since the SD itself is forbidden from applying
-- anything — see SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 TR-1.
