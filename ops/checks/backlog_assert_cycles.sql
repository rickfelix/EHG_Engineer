\set ON_ERROR_STOP on

-- Fail CI if we detect A↔B two-cycles across common dependency columns.
-- Threshold is provided by psql var :DEP_CYCLES_MAX (default 0 in workflow).
DO $$
DECLARE
  v_cycles  integer := 0;
  v_count   integer := 0;
  dep_col   text;
BEGIN
  FOR dep_col IN
    SELECT unnest(ARRAY['parent_id','depends_on','blocked_by','predecessor_id'])
  LOOP
    -- Skip columns that don't exist on sd_backlog_map
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sd_backlog_map' AND column_name=dep_col
    ) THEN
      EXECUTE format($f$
        SELECT COUNT(*)
        FROM sd_backlog_map a
        JOIN sd_backlog_map b ON b.backlog_id = a.%I
        WHERE a.%I IS NOT NULL
          AND b.%I IS NOT NULL
          AND b.%I = a.backlog_id
          AND a.backlog_id < b.backlog_id
      $f$, dep_col, dep_col, dep_col, dep_col)
      INTO v_count;

      v_cycles := v_cycles + COALESCE(v_count, 0);
    END IF;
  END LOOP;

  IF v_cycles > :DEP_CYCLES_MAX THEN
    RAISE EXCEPTION 'Dependency two-cycles detected (%% > %%)', v_cycles, :DEP_CYCLES_MAX;
  END IF;
END $$;