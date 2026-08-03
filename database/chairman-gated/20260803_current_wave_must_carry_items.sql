-- SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-2) — a current approved wave must carry items.
--
-- ============================ STAGED. NOT APPLIED. ============================
-- CREATE FUNCTION ... SECURITY-sensitive + CREATE TRIGGER is TIER-2 under
-- scripts/lib/migration-tier-classifier.mjs. No @approved-by attestation is present and this
-- directory sits outside every auto-scanned migration path. The builder STAGES; the chairman applies.
--
-- ===================== IT CANNOT BE APPLIED TODAY, AND THAT IS THE POINT =====================
-- Measured live on the active roadmap: ONE wave violates this invariant right now —
--   seq=0  "Wave 0: Distillation — distill the estate + review the EHG application"
--          status=approved, time_horizon=now, items=0, progress_pct=71
-- Applying the trigger below does not retroactively reject existing rows, but the FIRST update to
-- Wave 0 would then fail, and any attempt to add the equivalent CHECK constraint would fail
-- immediately. So this migration has a HARD PREREQUISITE: Wave 0 must first either gain its items
-- or move off horizon='now'.
--
-- THAT IS A PLAN DECISION, NOT AN ENGINEERING ONE, which is why this SD stages the mechanism and
-- does not resolve the violation. Wave 0 reporting progress_pct=71 while holding zero items is
-- itself unexplained — a percentage computed over an empty denominator, the same class of
-- unreadable number this SD exists to remove. Whoever resolves Wave 0 should establish what that
-- 71% was measuring before deciding whether the wave needs items or a different horizon.
--
-- ===================== WHY horizon='now' AND NOT status='approved' ALONE =====================
-- The SD says a zero-item approved wave must become UNREACHABLE. Measured, THREE approved waves
-- hold zero items, and one is Wave 3 (GATED), which may legitimately hold none until it is ungated.
-- An unconditional rule would forbid a valid state and be reverted on first contact. "GATED" appears
-- ONLY in that wave's title text — there is NO structured gate key — so matching the title would be
-- fragile and would break silently on a rename. time_horizon IS structured, so the invariant is
-- scoped to waves that are CURRENT. Measured: that catches exactly Wave 0 and correctly leaves
-- Wave 3 and Wave 4 (both horizon='next') alone.
--
-- Detection already ships and is live without this trigger: lib/roadmap/plan-position-check.js
-- evaluates the same invariant and returns FAIL (and UNREADABLE on an empty population, so it can
-- never report a false clean). This migration is the ENFORCEMENT half — it makes the state
-- unreachable rather than merely visible, which is what FR-2 asks for.

CREATE OR REPLACE FUNCTION public.assert_current_wave_carries_items()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Only bites when a wave is BOTH approved and current. Waves at 'next'/'later' — including the
  -- GATED one — may legitimately hold no items yet.
  IF NEW.status = 'approved' AND NEW.time_horizon = 'now' THEN
    IF NOT EXISTS (SELECT 1 FROM public.roadmap_wave_items i WHERE i.wave_id = NEW.id) THEN
      RAISE EXCEPTION
        'wave % (seq=%) is approved and current (time_horizon=now) but holds zero items; '
        'an approved current wave with no items is the state that made plan position unreadable. '
        'Populate its items in the same transaction, or set time_horizon to next/later.',
        NEW.id, NEW.sequence_rank
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED: this is what makes FR-2's "in the same
-- transaction" achievable rather than impossible. A plain BEFORE trigger would fire before the
-- caller has had a chance to insert the items, so approving-and-populating atomically would ALWAYS
-- fail. Deferring to COMMIT lets a single transaction approve the wave and insert its items in
-- either order, and still rejects a transaction that approves without populating.
CREATE CONSTRAINT TRIGGER trg_current_wave_carries_items
  AFTER INSERT OR UPDATE OF status, time_horizon ON public.roadmap_waves
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_current_wave_carries_items();

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_current_wave_carries_items ON public.roadmap_waves;
--   DROP FUNCTION IF EXISTS public.assert_current_wave_carries_items();
