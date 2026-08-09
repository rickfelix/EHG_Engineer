-- SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 — FR-4.
--
-- ORDERING IS STRICT: this file REFERENCES public.venture_demand_verdicts and must be applied
-- AFTER 20260809_venture_demand_verdicts.sql. Applied first, every autonomy write would fail on a
-- missing relation.
--
-- WHAT THIS CLOSES, and why a JS precondition alone is not enough. lib/marketing/autonomy-gate.js
-- is the only autonomous write in tracked source, so guarding line 236-238 looks sufficient. It is
-- not, and the reason is the whole point of this file:
--
--   1. THE REAL WRITER RUNS AS SERVICE_ROLE, AND SERVICE_ROLE BYPASSES RLS ENTIRELY. No policy —
--      in either direction, however permissive or restrictive — constrains it. The ONLY database
--      mechanism that binds service_role is a TRIGGER or CHECK. This is why the trigger below,
--      not the REVOKE, is the load-bearing half. 20260803_drive_reports.sql names service_role as
--      its own threat model for exactly this reason.
--
--   2. anon and authenticated hold TABLE-LEVEL INSERT/UPDATE GRANTS on venture_channel_autonomy,
--      blocked today only by RLS default-deny — that is, by the ABSENCE OF A WRITE POLICY rather
--      than the absence of a grant. That is safety-by-coincidence: it holds until someone adds a
--      write policy, and the edit that would do it reads as ordinary house style.
--
-- A NOTE ON WHAT THIS FILE DELIBERATELY DOES NOT DO: it does NOT widen vca_venture_access from
-- FOR SELECT to FOR ALL. That widening was proposed and is BACKWARDS — measured at
-- 20260710_venture_channel_autonomy_ledger.sql:250, that policy is FOR SELECT TO authenticated,
-- so widening it would GRANT every authenticated user in the venture's company a direct write to
-- autonomy_state, which is the exact hole this file exists to close. The same migration uses
-- FOR ALL three times as house style, which is precisely what makes the one-word widening a
-- plausible future mistake — so the verify block PINS the policy's command and roles.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE BINDING HALF: a trigger that constrains every writer, service_role included.
--
-- Fires on any write that would LEAVE the row autonomous, not merely on the transition into it.
-- Rationale: the invariant is "a row may only BE autonomous while a PASS verdict backs it", not
-- "may only BECOME autonomous". Checking only the transition would let an autonomous row survive
-- indefinitely through later updates. This is safe to enforce broadly because verdicts are
-- append-only — a PASS, once recorded, never disappears — so a legitimately-graduated channel is
-- never subsequently locked out by its own bookkeeping updates.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.venture_channel_autonomy_requires_verdict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $requires_verdict$
BEGIN
  IF NEW.autonomy_state = 'autonomous'
     AND NOT EXISTS (
       SELECT 1 FROM public.venture_demand_verdicts v
       WHERE v.venture_id = NEW.venture_id
         AND v.verdict = 'PASS'
     )
  THEN
    RAISE EXCEPTION
      'venture % channel % may not be autonomous: no PASS row exists in venture_demand_verdicts. Graduation is gated on MEASURED DEMAND, not on a clean-streak counter alone. A NO_DATA or BLOCKED verdict does NOT satisfy this — only PASS does, so an absent or unmeasurable verdict fails CLOSED.',
      NEW.venture_id, NEW.channel_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$requires_verdict$;

DROP TRIGGER IF EXISTS venture_channel_autonomy_requires_verdict_trg ON public.venture_channel_autonomy;
CREATE TRIGGER venture_channel_autonomy_requires_verdict_trg
  BEFORE INSERT OR UPDATE ON public.venture_channel_autonomy
  FOR EACH ROW EXECUTE FUNCTION public.venture_channel_autonomy_requires_verdict();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE INDEPENDENT BELT: remove the grants, so the anon/authenticated write path is blocked by the
-- ABSENCE OF A GRANT rather than by the absence of a policy. SELECT is deliberately untouched —
-- vca_venture_access exists to let a company read its own venture's autonomy state, and this file
-- is about writes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.venture_channel_autonomy FROM anon, authenticated;

DO $verify$
DECLARE
  offending  text;
  polcmd_now "char";
  orphan_cnt integer;
BEGIN
  -- 1. The trigger is the load-bearing half. Without it the REVOKE below constrains nobody who
  --    can currently reach this table, because every real writer is service_role.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.venture_channel_autonomy'::regclass
      AND tgname = 'venture_channel_autonomy_requires_verdict_trg'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FR-4: the demand-verdict trigger did not land — service_role can still write autonomy_state=autonomous unchecked, which is the entire hole this migration exists to close';
  END IF;

  -- 2. The belt actually landed.
  FOR offending IN
    SELECT DISTINCT grantee FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'venture_channel_autonomy'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  LOOP
    RAISE EXCEPTION 'FR-4: % still holds a write grant on venture_channel_autonomy — the REVOKE did not land, leaving the write blocked only by RLS default-deny (safety-by-coincidence)', offending;
  END LOOP;

  -- 3. PIN THE POLICY SHAPE. A name-only check would pass just as happily against a policy that
  --    had been widened to FOR ALL. 'r' is SELECT in pg_policy.polcmd.
  SELECT polcmd INTO polcmd_now FROM pg_policy
  WHERE polrelid = 'public.venture_channel_autonomy'::regclass AND polname = 'vca_venture_access';

  IF polcmd_now IS NULL THEN
    RAISE EXCEPTION 'FR-4: policy vca_venture_access is missing — expected it to still exist, unchanged, as FOR SELECT';
  END IF;
  IF polcmd_now <> 'r' THEN
    RAISE EXCEPTION 'FR-4: policy vca_venture_access is no longer FOR SELECT (polcmd=%). Widening it to FOR ALL grants authenticated users a direct write to autonomy_state — that is the hazard this migration closes, not the fix.', polcmd_now;
  END IF;

  -- 4. HONEST-BY-CONSTRUCTION ON EXISTING DATA. Declaring an invariant for future writes while
  --    leaving rows that already violate it would make the gate a claim rather than a fact. The
  --    measured count of autonomous rows at authoring time was ZERO fleet-wide, so this should
  --    never fire — and if it does, the assumption was wrong and the deploy must stop.
  SELECT count(*) INTO orphan_cnt
  FROM public.venture_channel_autonomy a
  WHERE a.autonomy_state = 'autonomous'
    AND NOT EXISTS (
      SELECT 1 FROM public.venture_demand_verdicts v
      WHERE v.venture_id = a.venture_id AND v.verdict = 'PASS'
    );
  IF orphan_cnt > 0 THEN
    RAISE EXCEPTION 'FR-4: % existing autonomous row(s) have no PASS demand verdict. The invariant this migration declares is already violated by live data — resolve those rows before enforcing, rather than shipping a gate that only binds future writes.', orphan_cnt;
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.venture_channel_autonomy_requires_verdict() IS
  'SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-4: refuses autonomy_state=autonomous unless a PASS row exists in venture_demand_verdicts. Binds SERVICE_ROLE, which bypasses RLS and is what every real writer runs as — a policy edit cannot do this job. Raises check_violation (NOT 42501): service_role is denied by the RULE, not by permission.';
