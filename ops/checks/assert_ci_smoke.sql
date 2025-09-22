-- CI Smoke Assertions
-- Fail the job if smoke expectations aren't met
DO $$
DECLARE
  v_sd_count int;
  v_prd_count int;
  v_bl_count int;
  v_venture_count int;
  v_stage_count int;
  v_snap_count int;
  v_stage_progress int;
BEGIN
  -- Check core engineering tables
  SELECT count(*) INTO v_sd_count FROM eng.strategic_directives_v2;
  IF v_sd_count < 1 THEN
    RAISE EXCEPTION 'CI smoke: expected >=1 SD, got %', v_sd_count;
  END IF;
  RAISE NOTICE 'Strategic Directives: % ✓', v_sd_count;

  SELECT count(*) INTO v_prd_count FROM eng.product_requirements_v2;
  IF v_prd_count < 1 THEN
    RAISE EXCEPTION 'CI smoke: expected >=1 PRD, got %', v_prd_count;
  END IF;
  RAISE NOTICE 'Product Requirements: % ✓', v_prd_count;

  SELECT count(*) INTO v_bl_count FROM eng.eng_backlog;
  IF v_bl_count < 2 THEN
    RAISE EXCEPTION 'CI smoke: expected >=2 backlog items, got %', v_bl_count;
  END IF;
  RAISE NOTICE 'Backlog Items: % ✓', v_bl_count;

  -- Check venture hub tables
  SELECT count(*) INTO v_venture_count FROM vh.vh_ventures;
  IF v_venture_count < 1 THEN
    RAISE EXCEPTION 'CI smoke: expected >=1 venture, got %', v_venture_count;
  END IF;
  RAISE NOTICE 'Ventures: % ✓', v_venture_count;

  SELECT count(*) INTO v_stage_count FROM vh.vh_stage_states;
  IF v_stage_count < 1 THEN
    RAISE EXCEPTION 'CI smoke: expected >=1 stage state, got %', v_stage_count;
  END IF;
  RAISE NOTICE 'Stage States: % ✓', v_stage_count;

  -- Views must produce rows after hydration + ingest dry-run prep
  SELECT count(*) INTO v_snap_count FROM views.v_vh_governance_snapshot;
  IF v_snap_count < 1 THEN
    RAISE EXCEPTION 'CI smoke: expected >=1 governance snapshot row, got %', v_snap_count;
  END IF;
  RAISE NOTICE 'Governance Snapshot View: % rows ✓', v_snap_count;

  SELECT count(*) INTO v_stage_progress FROM views.v_vh_stage_progress;
  IF v_stage_progress < 1 THEN
    RAISE EXCEPTION 'CI smoke: expected >=1 stage progress row, got %', v_stage_progress;
  END IF;
  RAISE NOTICE 'Stage Progress View: % rows ✓', v_stage_progress;

  -- Verify specific CI smoke data
  PERFORM 1 FROM eng.strategic_directives_v2 WHERE sd_key = 'SD-2025-09-01-ci-smoke';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CI smoke: specific SD-2025-09-01-ci-smoke not found';
  END IF;
  RAISE NOTICE 'CI Smoke SD found ✓';

  PERFORM 1 FROM vh.vh_ventures WHERE name = 'CI Smoke Venture';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CI smoke: specific CI Smoke Venture not found';
  END IF;
  RAISE NOTICE 'CI Smoke Venture found ✓';

  -- Check cross-boundary isolation (no direct FKs between eng and vh)
  PERFORM 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'vh'
      AND ccu.table_schema = 'eng';
  IF FOUND THEN
    RAISE EXCEPTION 'CI smoke: VIOLATION - Direct FK found between vh and eng schemas';
  END IF;
  RAISE NOTICE 'Cross-boundary isolation verified ✓';

  RAISE NOTICE '';
  RAISE NOTICE '=== CI SMOKE TESTS PASSED ===';
  RAISE NOTICE 'All assertions successful:';
  RAISE NOTICE '  - Engineering tables seeded: SD(%), PRD(%), Backlog(%)', v_sd_count, v_prd_count, v_bl_count;
  RAISE NOTICE '  - Venture tables seeded: Ventures(%), Stages(%)', v_venture_count, v_stage_count;
  RAISE NOTICE '  - Views functioning: Snapshot(%), Progress(%)', v_snap_count, v_stage_progress;
  RAISE NOTICE '  - Boundary enforcement: No cross-schema FKs';
END $$;

SELECT 'CI Smoke Assertions PASSED' as result, NOW() as verified_at;