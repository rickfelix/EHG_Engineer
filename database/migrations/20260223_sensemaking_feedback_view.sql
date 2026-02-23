-- Migration: Create v_feedback_with_sensemaking VIEW
-- SD: SD-LEO-FEAT-CONNECT-ASSIST-ENGINE-001
-- FR-001: Sensemaking-Aware Feedback Query
--
-- LEFT JOINs feedback with sensemaking_analyses on correlation_id.
-- Leverages existing idx_sensemaking_analyses_correlation index.
-- Service role bypasses RLS — no new policies needed.

CREATE OR REPLACE VIEW v_feedback_with_sensemaking AS
SELECT
  f.*,
  sa.id AS sensemaking_analysis_id,
  sa.disposition AS sensemaking_disposition,
  sa.disposition_at AS sensemaking_disposition_at,
  sa.overall_confidence AS sensemaking_confidence,
  sa.status AS sensemaking_status
FROM feedback f
LEFT JOIN sensemaking_analyses sa
  ON f.metadata ->> 'sensemaking_correlation_id' = sa.correlation_id;

COMMENT ON VIEW v_feedback_with_sensemaking IS
  'Feedback enriched with sensemaking disposition data. Used by assist-engine loadInboxItems(). SD-LEO-FEAT-CONNECT-ASSIST-ENGINE-001 FR-001.';
