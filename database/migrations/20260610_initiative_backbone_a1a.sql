-- @approved-by: codestreetlabs@gmail.com
-- Migration: Initiative backbone A1a — vision-spine FK substrate (additive, reversible)
-- SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001 (the Plan-Keeper program's A1a schema slot;
-- program child SD-LEO-ORCH-ADAM-PLAN-KEEPER-001-E declares a dependency on this SD)
--
-- WHAT (5 nullable FK columns + 3 key-resolved backfills + 1 naming fix; NOTHING dropped/repointed):
--   1. objectives.eva_vision_id          -> eva_vision_documents(id)   + backfill to the canonical L1
--   2. okr_generation_log.eva_vision_id  -> eva_vision_documents(id)   + backfill to the canonical L1
--   3. eva_vision_documents.mission_id   -> missions(id)               + backfill ONLY the active L1 doc
--   4. strategic_directives_v2.initiative_id -> objectives(id)         (no backfill; forward-looking)
--   5. roadmap_waves.initiative_id           -> objectives(id)         (no backfill; forward-looking)
--   6. companies naming-drift fix: 'Executive Holdings Global' -> 'ExecHoldings Global' (id-anchored)
--
-- SAFETY / BOUNDARIES:
--   * ADDITIVE ONLY. The legacy objectives.vision_id / okr_generation_log.vision_id columns and
--     their hard FKs to strategic_vision(id) are UNTOUCHED — they stay authoritative for old
--     readers until the program's A1b read-repoints (-001-E) and A1d soft-retire (-001-D).
--   * okr_generation_log.eva_vision_id exists precisely BECAUSE okr_generation_log.vision_id has a
--     hard FK to strategic_vision(id) (20260220_okr_monthly_system.sql L48): canonical
--     eva_vision_documents ids MUST be written to the NEW columns, never the legacy ones.
--   * Backfills resolve ids by STABLE KEYS at runtime (vision_key + status; venture_id IS NULL),
--     never hardcoded row ids; pre-flight asserts abort loudly if cardinality drifts.
--   * Idempotent: ADD COLUMN IF NOT EXISTS; backfills guard on IS NULL; the companies UPDATE is
--     id-anchored + name-guarded (cannot touch the separate 'EHG' record d73aac88).
--   * Reversible: column-explicit DOWN at database/migrations/20260610_initiative_backbone_a1a_DOWN.sql.
--   * apply-migration.js wraps this whole file in its own BEGIN/COMMIT (single query, advisory
--     locks); no SET TRANSACTION ISOLATION in-file by design.

SELECT pg_advisory_xact_lock(hashtext('initiative_backbone_a1a'));

-- 0) Pre-flight asserts: the stable keys must resolve to exactly one row each.
DO $a1a_pre$
DECLARE
  v_l1      int;
  v_mission int;
  v_legacy  int;
BEGIN
  SELECT count(*) INTO v_l1
    FROM eva_vision_documents
   WHERE vision_key = 'VISION-EHG-L1-001' AND status = 'active' AND chairman_approved = true;
  IF v_l1 <> 1 THEN
    RAISE EXCEPTION 'A1a aborted: expected exactly 1 active+approved VISION-EHG-L1-001, found %', v_l1;
  END IF;

  SELECT count(*) INTO v_mission FROM missions WHERE venture_id IS NULL;
  IF v_mission <> 1 THEN
    RAISE EXCEPTION 'A1a aborted: expected exactly 1 portfolio mission (venture_id IS NULL), found %', v_mission;
  END IF;

  -- strategic_vision is the legacy single-row root; >1 row means the world changed under us.
  SELECT count(*) INTO v_legacy FROM strategic_vision;
  IF v_legacy > 1 THEN
    RAISE EXCEPTION 'A1a aborted: strategic_vision has % rows (expected <=1) — re-verify backfill predicate', v_legacy;
  END IF;
END;
$a1a_pre$;

-- 1) Vision-spine FK substrate (the A1b consumer contract columns).
ALTER TABLE objectives
  ADD COLUMN IF NOT EXISTS eva_vision_id UUID REFERENCES eva_vision_documents(id);
ALTER TABLE okr_generation_log
  ADD COLUMN IF NOT EXISTS eva_vision_id UUID REFERENCES eva_vision_documents(id);

-- 2) Mission foundation: the vision spine CITES the mission (peer anchor, not a new apex).
ALTER TABLE eva_vision_documents
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES missions(id);

-- 3) Initiative grain: OKR objectives ARE the Initiative (no new entity).
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS initiative_id UUID REFERENCES objectives(id);
ALTER TABLE roadmap_waves
  ADD COLUMN IF NOT EXISTS initiative_id UUID REFERENCES objectives(id);

-- 4) Backfills (key-resolved, IS NULL-guarded => idempotent).
UPDATE objectives o
   SET eva_vision_id = (SELECT id FROM eva_vision_documents
                         WHERE vision_key = 'VISION-EHG-L1-001' AND status = 'active')
 WHERE o.eva_vision_id IS NULL
   AND o.vision_id IN (SELECT id FROM strategic_vision);

UPDATE okr_generation_log g
   SET eva_vision_id = (SELECT id FROM eva_vision_documents
                         WHERE vision_key = 'VISION-EHG-L1-001' AND status = 'active')
 WHERE g.eva_vision_id IS NULL
   AND g.vision_id IN (SELECT id FROM strategic_vision);

UPDATE eva_vision_documents d
   SET mission_id = (SELECT id FROM missions WHERE venture_id IS NULL)
 WHERE d.vision_key = 'VISION-EHG-L1-001' AND d.status = 'active'
   AND d.mission_id IS NULL;

-- 5) Companies naming-drift fix (chairman-locked; id-anchored + name-guarded).
UPDATE companies
   SET name = 'ExecHoldings Global'
 WHERE id = 'b933ecb0-a9d4-47b0-a4cb-ec21a6031475'
   AND name = 'Executive Holdings Global';

-- 6) Post-asserts: backfills landed exactly where intended.
DO $a1a_post$
DECLARE
  v_obj_pending int;
  v_log_pending int;
  v_l1_mission  int;
  v_old_name    int;
BEGIN
  SELECT count(*) INTO v_obj_pending
    FROM objectives
   WHERE vision_id IN (SELECT id FROM strategic_vision) AND eva_vision_id IS NULL;
  IF v_obj_pending <> 0 THEN
    RAISE EXCEPTION 'A1a post-assert failed: % objectives on the legacy root still lack eva_vision_id', v_obj_pending;
  END IF;

  SELECT count(*) INTO v_log_pending
    FROM okr_generation_log
   WHERE vision_id IN (SELECT id FROM strategic_vision) AND eva_vision_id IS NULL;
  IF v_log_pending <> 0 THEN
    RAISE EXCEPTION 'A1a post-assert failed: % okr_generation_log rows on the legacy root still lack eva_vision_id', v_log_pending;
  END IF;

  SELECT count(*) INTO v_l1_mission
    FROM eva_vision_documents
   WHERE mission_id IS NOT NULL;
  IF v_l1_mission <> 1 THEN
    RAISE EXCEPTION 'A1a post-assert failed: expected exactly 1 mission-cited vision doc (the L1), found %', v_l1_mission;
  END IF;

  SELECT count(*) INTO v_old_name FROM companies WHERE name = 'Executive Holdings Global';
  IF v_old_name <> 0 THEN
    RAISE EXCEPTION 'A1a post-assert failed: % companies rows still carry the drifted name', v_old_name;
  END IF;
END;
$a1a_post$;

-- 7) Contract documentation on the columns themselves.
COMMENT ON COLUMN objectives.eva_vision_id IS
  'Canonical vision spine FK (eva_vision_documents). A1b/-001-E threads THIS column for canonical ids — never legacy vision_id (hard FK to strategic_vision). SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001.';
COMMENT ON COLUMN okr_generation_log.eva_vision_id IS
  'Canonical vision spine FK (eva_vision_documents). A1b/-001-E threads THIS column — legacy vision_id keeps its strategic_vision FK until A1d. SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001.';
COMMENT ON COLUMN eva_vision_documents.mission_id IS
  'Mission foundation up-FK (missions). Portfolio mission (venture_id NULL) <-> L1; per-venture mission <-> that venture''s L2; consumers COALESCE to portfolio. Only the L1 doc is backfilled. SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001.';
COMMENT ON COLUMN strategic_directives_v2.initiative_id IS
  'Initiative grain: the OKR objective this (orchestrator) SD advances. Nullable; forward-looking adoption. SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001.';
COMMENT ON COLUMN roadmap_waves.initiative_id IS
  'Initiative grain: the OKR objective this wave advances (single-FK complement to okr_objective_ids JSONB). Nullable; forward-looking adoption. SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001.';
