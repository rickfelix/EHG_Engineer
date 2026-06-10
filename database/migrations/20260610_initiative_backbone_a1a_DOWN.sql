-- @approved-by: codestreetlabs@gmail.com
-- DOWN migration for SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001 (Initiative backbone A1a)
--
-- Column-explicit revert of the additive A1a substrate: drops exactly the 5 new nullable FK
-- columns and restores the companies name. Backfilled values live only in the dropped columns,
-- so no separate data restore is needed. Apply via:
--   node scripts/apply-migration.js database/migrations/20260610_initiative_backbone_a1a_DOWN.sql
--
-- WARNING: only run BEFORE program child -001-E (A1b) starts writing eva_vision_id — after that,
-- dropping the columns discards A1b's writes (coordinate with the Plan-Keeper program first).

SELECT pg_advisory_xact_lock(hashtext('initiative_backbone_a1a'));

ALTER TABLE objectives              DROP COLUMN IF EXISTS eva_vision_id;
ALTER TABLE okr_generation_log      DROP COLUMN IF EXISTS eva_vision_id;
ALTER TABLE eva_vision_documents    DROP COLUMN IF EXISTS mission_id;
ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS initiative_id;
ALTER TABLE roadmap_waves           DROP COLUMN IF EXISTS initiative_id;

UPDATE companies
   SET name = 'Executive Holdings Global'
 WHERE id = 'b933ecb0-a9d4-47b0-a4cb-ec21a6031475'
   AND name = 'ExecHoldings Global';

-- Post-restore asserts: columns gone, name restored.
DO $a1a_down_post$
DECLARE
  v_cols int;
  v_name int;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE (table_name = 'objectives'              AND column_name = 'eva_vision_id')
      OR (table_name = 'okr_generation_log'      AND column_name = 'eva_vision_id')
      OR (table_name = 'eva_vision_documents'    AND column_name = 'mission_id')
      OR (table_name = 'strategic_directives_v2' AND column_name = 'initiative_id')
      OR (table_name = 'roadmap_waves'           AND column_name = 'initiative_id');
  IF v_cols <> 0 THEN
    RAISE EXCEPTION 'A1a DOWN post-assert failed: % A1a columns still present', v_cols;
  END IF;

  SELECT count(*) INTO v_name
    FROM companies
   WHERE id = 'b933ecb0-a9d4-47b0-a4cb-ec21a6031475' AND name = 'Executive Holdings Global';
  IF v_name <> 1 THEN
    RAISE EXCEPTION 'A1a DOWN post-assert failed: companies name not restored (found % matching rows)', v_name;
  END IF;
END;
$a1a_down_post$;
