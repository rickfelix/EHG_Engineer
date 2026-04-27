-- Vision-fidelity coverage trend (SD-LEO-INFRA-VISION-FIDELITY-GATE-001 FR-6).
--
-- Joins sub_agent_execution_results rows written by the vision-fidelity
-- sub-agent against strategic_directives_v2 to surface vision_coverage_pct
-- by week, sd_type, and verdict.
--
-- Run via:  psql ... -f scripts/queries/vision-coverage-trend.sql
-- or:       \i scripts/queries/vision-coverage-trend.sql

SELECT
    date_trunc('week', sar.created_at)            AS week,
    sd.sd_type,
    sar.verdict,
    COUNT(*)                                       AS gate_run_count,
    ROUND(AVG((sar.metadata->>'vision_coverage_pct')::numeric), 3) AS avg_coverage_pct,
    ROUND(AVG((sar.metadata->>'delivered_count')::numeric), 1)     AS avg_delivered,
    ROUND(AVG((sar.metadata->>'partial_count')::numeric), 1)       AS avg_partial,
    ROUND(AVG((sar.metadata->>'missing_count')::numeric), 1)       AS avg_missing,
    ROUND(AVG((sar.metadata->>'scope_creep_count')::numeric), 1)   AS avg_scope_creep,
    SUM(CASE WHEN sar.verdict = 'FAIL' THEN 1 ELSE 0 END)          AS fail_runs,
    SUM(CASE WHEN sar.verdict = 'WARNING' THEN 1 ELSE 0 END)       AS warn_runs,
    SUM(CASE WHEN sar.verdict = 'PASS' THEN 1 ELSE 0 END)          AS pass_runs
FROM sub_agent_execution_results sar
JOIN strategic_directives_v2 sd ON sd.id = sar.sd_id
WHERE sar.sub_agent_code = 'VISION_FIDELITY'
  AND sar.created_at >= NOW() - INTERVAL '90 days'
  AND (sar.metadata->>'vision_coverage_pct') IS NOT NULL
GROUP BY date_trunc('week', sar.created_at), sd.sd_type, sar.verdict
ORDER BY week DESC, sd.sd_type, sar.verdict;
