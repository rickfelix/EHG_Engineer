\set ON_ERROR_STOP on
\echo '== Hydrating venture linkage columns =='

DO $$
DECLARE
    updated_count bigint := 0;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vh_ventures' AND column_name = 'metadata'
    ) THEN
        UPDATE vh_ventures v
           SET sd_id = COALESCE(v.sd_id, sd.sd_uuid)
          FROM strategic_directives_v2 sd
         WHERE v.sd_id IS NULL
           AND (
                (v.metadata->>'sd_key') = sd.sd_key OR
                (v.metadata->>'sd_id') = sd.sd_uuid::text OR
                (v.metadata->>'sd_legacy_id') = sd.legacy_id
           );
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Hydrated sd_id from metadata: % ventures', updated_count;

        UPDATE vh_ventures v
           SET prd_id = COALESCE(v.prd_id, prd.prd_uuid)
          FROM product_requirements_v2 prd
         WHERE v.prd_id IS NULL
           AND (
                (v.metadata->>'prd_id') = prd.id OR
                (v.metadata->>'prd_uuid') = prd.prd_uuid::text
           );
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Hydrated prd_id from metadata: % ventures', updated_count;

        UPDATE vh_ventures v
           SET backlog_id = COALESCE(v.backlog_id, bl.id)
          FROM eng_backlog bl
         WHERE v.backlog_id IS NULL
           AND (
                (v.metadata->>'backlog_id') = bl.legacy_backlog_id OR
                (v.metadata->>'eng_backlog_id') = bl.id::text
           );
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Hydrated backlog_id from metadata: % ventures', updated_count;
    END IF;

    -- Fallback: match on venture name to SD title (best-effort)
    UPDATE vh_ventures v
       SET sd_id = COALESCE(v.sd_id, sd.sd_uuid)
      FROM strategic_directives_v2 sd
     WHERE v.sd_id IS NULL
       AND LOWER(v.name) = LOWER(sd.title)
       AND sd.sd_uuid IS NOT NULL;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Hydrated sd_id by title match: % ventures', updated_count;

    UPDATE vh_ventures v
       SET prd_id = COALESCE(v.prd_id, prd.prd_uuid)
      FROM product_requirements_v2 prd
     WHERE v.prd_id IS NULL
       AND v.sd_id = prd.sd_id;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Hydrated prd_id via sd_id match: % ventures', updated_count;

    UPDATE vh_ventures v
       SET gate_status = COALESCE(trace.gate_status, v.gate_status)
      FROM v_eng_trace trace
     WHERE (v.prd_id IS NOT NULL AND trace.prd_id = v.prd_id)
        OR (v.sd_id IS NOT NULL AND trace.sd_id = v.sd_id);
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated gate_status from v_eng_trace: % ventures', updated_count;
END;
$$;

\echo '== Coverage summary =='
SELECT
    COUNT(*) AS ventures_total,
    COUNT(*) FILTER (WHERE sd_id IS NOT NULL) AS ventures_sd_linked,
    COUNT(*) FILTER (WHERE prd_id IS NOT NULL) AS ventures_prd_linked,
    COUNT(*) FILTER (WHERE backlog_id IS NOT NULL) AS ventures_backlog_linked
FROM vh_ventures;

\echo '== Exporting remaining gaps to temp view =='
DROP TABLE IF EXISTS vh_linkage_gaps;
CREATE TEMP TABLE vh_linkage_gaps AS
SELECT id AS venture_id, name, sd_id, prd_id, backlog_id
  FROM vh_ventures
 WHERE sd_id IS NULL OR prd_id IS NULL OR backlog_id IS NULL;

SELECT COUNT(*) AS ventures_with_gaps FROM vh_linkage_gaps;
\copy (SELECT * FROM vh_linkage_gaps ORDER BY venture_id) TO 'ops/jobs/out/ventures_missing_linkage.csv' CSV HEADER;
