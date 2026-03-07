-- FR-003: v_orphan_visions view
-- SD-LEO-INFRA-BRAINSTORM-SD-PIPELINE-001
--
-- Surfaces vision/architecture documents created from brainstorms
-- that never resulted in an SD (brainstorm_sessions.created_sd_id IS NULL).

CREATE OR REPLACE VIEW v_orphan_visions AS
SELECT
  v.id              AS vision_id,
  v.vision_key,
  a.id              AS arch_id,
  a.plan_key,
  bs.id             AS brainstorm_id,
  bs.topic          AS brainstorm_topic,
  bs.domain         AS brainstorm_domain,
  bs.outcome_type,
  bs.created_sd_id,
  bs.created_at     AS brainstorm_created_at,
  v.created_at      AS vision_created_at,
  EXTRACT(DAY FROM NOW() - bs.created_at)::int AS age_days
FROM eva_vision_documents v
JOIN brainstorm_sessions bs
  ON bs.id = v.source_brainstorm_id
LEFT JOIN eva_architecture_plans a
  ON a.source_brainstorm_id = bs.id
WHERE bs.created_sd_id IS NULL
ORDER BY bs.created_at DESC;

COMMENT ON VIEW v_orphan_visions IS
  'Vision/architecture docs from brainstorms that never produced an SD. '
  'Used by scripts/detect-orphan-visions.js to surface stale brainstorm artifacts.';
