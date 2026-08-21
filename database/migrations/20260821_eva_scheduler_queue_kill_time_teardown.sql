-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-4, step 2 of 2) — kill-time scheduler-queue teardown.
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE. TIER-2 (`CREATE OR REPLACE` + `SECURITY DEFINER`) needs the 3-factor
--   chairman gate. The builder holds none of those factors and must not forge the attestation.
--   APPLY IS NOT MINE.
--
-- ⚠⚠ APPLY 20260821_eva_scheduler_queue_status_add_cancelled.sql FIRST.
--    This function writes eva_scheduler_queue.status='cancelled'. The live CHECK constraint
--    (eva_scheduler_queue_status_check) does NOT permit that value yet, so applying this file first
--    turns EVERY venture cancellation into a 23514 failure — `UPDATE ventures SET status='cancelled'`
--    would start throwing application-wide. Constraint first, function second.
--
-- ⚠ DO NOT run with --split-statements (named dollar-quoted function body).
-- ⚠ NO EXPLICIT BEGIN/COMMIT — apply-migration.js owns the transaction.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS FUNCTION IS THE RIGHT CHOKEPOINT (measured, not assumed).
--
-- trg_ventures_update_sync_eva fires sync_ventures_to_eva_ventures_update() on EVERY update to
-- ventures.status, for EVERY writer — the kill_venture() RPC, a direct
-- `UPDATE ventures SET status='cancelled'`, an admin console edit, a migration, anything. That makes
-- it comprehensive in a way no single RPC is:
--   * kill_venture(), delete_venture() and reject_chairman_decision()'s kill-gate branch never touch
--     eva_scheduler_queue at all. Confirmed live 2026-08-21: exactly three functions in the public
--     schema reference eva_scheduler_queue — fn_auto_enqueue_venture, master_reset_portfolio and
--     select_schedulable_ventures. None of the kill paths is among them.
--   * Only 21 of the 45 currently-killed-venture queue rows carry kill_venture()'s signature; 16 have
--     killed_at IS NULL, meaning kill_venture() never ran for them. Hooking kill_venture() would
--     therefore miss ~53% of the real population. The trigger misses none of it.
--
-- WHAT IS ADDED, AND WHAT IS PRESERVED.
-- The body below is the LIVE 2026-08-21 definition read back with pg_get_functiondef(), VERBATIM,
-- plus ONE new block. Everything else — the SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F is_demo guard, the
-- lifecycle-stage sync, the full status CASE map, the name sync, SECURITY DEFINER, and
-- `SET search_path TO 'public'` — is byte-identical to live.
--
-- ⚠ The live body is NOT the one in database/migrations/20260315_fix_eva_ventures_status_sync.sql.
--   20260610_purge_parity_fixture_ventures.sql later added the is_demo early-return. Reconstructing
--   this function from the 20260315 file would SILENTLY REVERT that guard and let demo/test fixtures
--   back into the EVA pipeline. The live catalog is the only safe source for a CREATE OR REPLACE.
--
-- THE NEW BLOCK: when the status map resolves to 'killed', every eva_scheduler_queue row for that
-- venture that is still 'pending' moves to 'cancelled'.
--   * ONLY 'pending'. 'dispatching' is in-flight work a dispatcher may be holding; 'blocked',
--     'paused' and 'completed' are already non-schedulable and carry information this must not erase.
--     The WHERE clause is the whole safety story, so it is narrow on purpose.
--   * THE JOIN IS TWO HOPS, AND THIS IS THE EASIEST THING IN THE FILE TO GET WRONG.
--     eva_scheduler_queue.venture_id REFERENCES eva_ventures(id) — NOT ventures(id). NEW.id here is
--     a ventures.id. Writing `WHERE venture_id = NEW.id` would compile, run, and match ZERO rows
--     forever: a teardown that reads as wired and is dead by construction. The subquery hops
--     ventures.id -> eva_ventures.venture_id -> eva_ventures.id.
--   * updated_at is set EXPLICITLY even though trg_esq_updated_at (BEFORE UPDATE) would also set it.
--     The redundancy costs nothing and keeps the teardown honest if that trigger is ever dropped.
--
-- INTERACTION WITH select_schedulable_ventures(): it filters `q.status = 'pending'`, so moving the
-- row to 'cancelled' removes it from dispatch selection with NO change to the selector.
--
-- KNOWN RESIDUAL GAP, DECLARED RATHER THAN SILENTLY LEFT (out of FR-4's scope, needs its own SD):
--   fn_auto_enqueue_venture() runs AFTER INSERT ON eva_ventures and enqueues UNCONDITIONALLY:
--       INSERT INTO eva_scheduler_queue (venture_id, fifo_key) VALUES (NEW.id, NOW())
--       ON CONFLICT (venture_id) DO NOTHING;
--   It never inspects NEW.status. A venture that is created ALREADY cancelled therefore syncs to
--   eva_ventures.status='killed' via sync_ventures_to_eva_ventures_insert() and is then auto-enqueued
--   'pending' — reproducing exactly the state this SD purges. That is the INSERT path; this file
--   closes the UPDATE path, which is where all 45 observed rows came from.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_ventures_to_eva_ventures_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapped_status TEXT;
BEGIN
  -- SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F: demo/test fixtures never enter the EVA pipeline
  -- (symmetric with the insert guard; updates to demo ventures have no eva_ventures row to touch).
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  IF OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage THEN
    UPDATE eva_ventures
      SET current_lifecycle_stage = NEW.current_lifecycle_stage,
          updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Map venture_status_enum values to eva_ventures status values
    v_mapped_status := CASE NEW.status::text
      WHEN 'active'    THEN 'active'
      WHEN 'paused'    THEN 'paused'
      WHEN 'cancelled' THEN 'killed'
      WHEN 'completed' THEN 'graduated'
      WHEN 'archived'  THEN 'paused'
      ELSE 'active'  -- safe default for any unexpected value
    END;

    UPDATE eva_ventures
      SET status = v_mapped_status, updated_at = NOW()
      WHERE venture_id = NEW.id;

    -- ── SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-4): KILL-TIME SCHEDULER TEARDOWN ──────────
    -- A killed venture must stop being schedulable in the SAME transaction that kills it.
    -- select_schedulable_ventures() filters only on q.status='pending' and v.orchestrator_state,
    -- never on eva_ventures.status — so without this block a dead venture's pending queue row stays
    -- LIVE-SCHEDULABLE and the scheduler hands a dead venture to a dispatcher.
    --
    -- Keyed off v_mapped_status (the mapped value actually written above), NOT off NEW.status, so
    -- this can never disagree with what eva_ventures was just set to.
    --
    -- ONLY 'pending' rows. 'dispatching' is in-flight; 'blocked'/'paused'/'completed' are already
    -- unschedulable and carry state this must not overwrite.
    --
    -- TWO-HOP JOIN: eva_scheduler_queue.venture_id references eva_ventures(id), while NEW.id is a
    -- ventures.id. `WHERE venture_id = NEW.id` would silently match nothing, forever.
    IF v_mapped_status = 'killed' THEN
      UPDATE eva_scheduler_queue
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE status = 'pending'
          AND venture_id IN (
            SELECT ev.id FROM eva_ventures ev WHERE ev.venture_id = NEW.id
          );
    END IF;
    -- ─────────────────────────────────────────────────────────────────────────────────────────
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE eva_ventures
      SET name = NEW.name, updated_at = NOW()
      WHERE venture_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Self-verify: the replacement is live, still carries the preserved behaviours, and the constraint
-- this function now depends on is present. Fails the whole apply if any of that is untrue.
DO $esqt_post$
DECLARE
  v_src text;
  v_con text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sync_ventures_to_eva_ventures_update';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'post-assert failed: sync_ventures_to_eva_ventures_update() is missing after replace';
  END IF;

  -- The addition landed.
  IF position('eva_scheduler_queue' in v_src) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: the kill-time teardown block is not present in the live body';
  END IF;

  -- PRESERVED BEHAVIOUR — a CREATE OR REPLACE reconstructed from a stale migration file would drop
  -- these silently, so they are asserted rather than trusted.
  IF position('NEW.is_demo' in v_src) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: the SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-F is_demo guard was lost';
  END IF;
  IF position('current_lifecycle_stage' in v_src) = 0
     OR position('graduated' in v_src) = 0
     OR position('OLD.name IS DISTINCT FROM NEW.name' in v_src) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: a pre-existing sync behaviour (stage / status map / name) was lost';
  END IF;

  -- The dependency this function now has on FR-4 step 1. If the constraint was not widened first,
  -- every cancellation from here on would raise 23514 — abort now, loudly, rather than at 2am.
  SELECT pg_get_constraintdef(oid) INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.eva_scheduler_queue'::regclass
    AND conname  = 'eva_scheduler_queue_status_check';
  IF v_con IS NULL OR position('cancelled' in v_con) = 0 THEN
    RAISE EXCEPTION 'post-assert failed: eva_scheduler_queue_status_check does not permit cancelled — apply 20260821_eva_scheduler_queue_status_add_cancelled.sql FIRST (def: %)', COALESCE(v_con, '<missing>');
  END IF;

  RAISE NOTICE 'kill-time teardown installed; is_demo guard + stage/status/name sync preserved; cancelled is a legal queue status';
END
$esqt_post$;

-- VERIFY (run after apply; this file's existence is a lead, never proof a live object changed):
--
--   -- 1. the live body carries the teardown
--   SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='sync_ventures_to_eva_ventures_update';
--
--   -- 2. end-to-end, inside a transaction you ROLL BACK:
--   --   BEGIN;
--   --   UPDATE ventures SET status='cancelled' WHERE id='<a live, non-demo venture id>';
--   --   SELECT q.status FROM eva_scheduler_queue q JOIN eva_ventures v ON v.id=q.venture_id
--   --    WHERE v.venture_id='<same id>';        -- expect 'cancelled'
--   --   ROLLBACK;
--
--   -- 3. steady state: no killed venture may hold a pending queue row (must be 0)
--   SELECT count(*) FROM eva_scheduler_queue q JOIN eva_ventures v ON v.id=q.venture_id
--    WHERE v.status='killed' AND q.status='pending';
