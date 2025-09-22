\set ON_ERROR_STOP on
\echo '== Loading governance owner map =='
CREATE TEMP TABLE _owner_map (
    sd_key TEXT PRIMARY KEY,
    owner TEXT,
    decision_log_ref TEXT,
    evidence_ref TEXT
);

\copy _owner_map FROM PROGRAM 'cat ops/backfill/eng_owner_map.csv' CSV HEADER;

\echo '== Applying owner/decision/evidence backfill =='
WITH updates AS (
    UPDATE strategic_directives_v2 sd
       SET owner = COALESCE(m.owner, sd.owner),
           decision_log_ref = COALESCE(m.decision_log_ref, sd.decision_log_ref),
           evidence_ref = COALESCE(m.evidence_ref, sd.evidence_ref)
      FROM _owner_map m
     WHERE m.sd_key = sd.sd_key
    RETURNING sd.sd_key,
              sd.owner IS DISTINCT FROM COALESCE(m.owner, sd.owner) AS owner_changed,
              sd.decision_log_ref IS DISTINCT FROM COALESCE(m.decision_log_ref, sd.decision_log_ref) AS decision_changed,
              sd.evidence_ref IS DISTINCT FROM COALESCE(m.evidence_ref, sd.evidence_ref) AS evidence_changed
)
SELECT
    COUNT(*) FILTER (WHERE owner_changed) AS owners_set,
    COUNT(*) FILTER (WHERE decision_changed) AS decisions_set,
    COUNT(*) FILTER (WHERE evidence_changed) AS evidence_set
FROM updates;

\echo '== Coverage snapshot =='
SELECT
    COUNT(*) AS total_sds,
    COUNT(*) FILTER (WHERE owner IS NOT NULL) AS owners_nonnull,
    ROUND(100.0 * COUNT(*) FILTER (WHERE owner IS NOT NULL) / NULLIF(COUNT(*),0), 2) AS owners_pct,
    COUNT(*) FILTER (WHERE decision_log_ref IS NOT NULL) AS decisions_nonnull,
    ROUND(100.0 * COUNT(*) FILTER (WHERE decision_log_ref IS NOT NULL) / NULLIF(COUNT(*),0), 2) AS decisions_pct,
    COUNT(*) FILTER (WHERE evidence_ref IS NOT NULL) AS evidence_nonnull,
    ROUND(100.0 * COUNT(*) FILTER (WHERE evidence_ref IS NOT NULL) / NULLIF(COUNT(*),0), 2) AS evidence_pct
FROM strategic_directives_v2;

DROP TABLE _owner_map;
