-- SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-3/FR-4)
-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- (approval chain: coordinator classification on read 2026-08-10 seat 56f09320 under the standing
--  delegated framework — pure additive CHECK-widening, no RLS/GRANT, no stored value invalidated;
--  chairman full-speed directive 22:47Z applies)
--
-- WIDEN plan_critiques.overall_severity TO ACCEPT 'could_not_check'.
--
-- MEASURED, not inferred. Live constraint read over the pooler (2026-08-10):
--   CHECK ((overall_severity = ANY (ARRAY['block','warn','note','pass'])))
-- and a reversible insert probe with overall_severity='could_not_check' was refused with
-- 23514 plan_critiques_overall_severity_check.
--
-- WHY THE VALUE IS NEEDED: critiquePlanProposal had five could-not-run paths (missing
-- OPENAI_API_KEY, adapter init failure, LLM timeout, LLM call failure, malformed JSON)
-- that returned overall_severity='pass', and the gate's skip/fail paths returned BEFORE
-- persisting. Consequence: plan_critiques cannot distinguish "checked and found nothing"
-- from "could not check" — the guard-observability property FR-4's catch-rate monitor
-- exists to report. Mapping could_not_check onto an existing value was REJECTED: every
-- allowed value asserts something the run never measured, and a column that misreports
-- what it holds is the defect class this SD exists to remove (same reasoning that rejected
-- mapping SQL 'table'/'view' onto 'module' in the 20260809 entity_type migration).
--
-- SAFETY: widening a CHECK is additive; every stored value stays valid.
--
-- APPLY IS NOT MINE. Chairman-gated DDL; the coordinator sequences it. Until applied, the
-- gate attempts the honest insert, is refused with 23514, and reports loudly that the
-- outcome was NOT persisted (pre-plan-critique.js persistCritique) — a KNOWN, DECLARED gap.

BEGIN;

ALTER TABLE public.plan_critiques
  DROP CONSTRAINT IF EXISTS plan_critiques_overall_severity_check;

ALTER TABLE public.plan_critiques
  ADD CONSTRAINT plan_critiques_overall_severity_check
  CHECK (overall_severity IN ('block', 'warn', 'note', 'pass', 'could_not_check'));

COMMIT;

-- VERIFY (run after apply; the file's existence is a lead, never proof it ran):
--
--   -- 1. the constraint accepts the new value
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'plan_critiques_overall_severity_check';
--   -- expect the definition to contain 'could_not_check'
--
--   -- 2. nothing was invalidated (must return 0)
--   SELECT count(*) FROM public.plan_critiques
--    WHERE overall_severity NOT IN ('block','warn','note','pass','could_not_check');
--
--   -- 3. after the next could-not-run critique, the honest row lands (may be 0 until one occurs)
--   SELECT count(*) FROM public.plan_critiques WHERE overall_severity = 'could_not_check';
