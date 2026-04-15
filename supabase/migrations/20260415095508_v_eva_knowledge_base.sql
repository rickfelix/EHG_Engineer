-- Migration: v_eva_knowledge_base VIEW
-- SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-D
--
-- Creates a unified VIEW over four LEO Protocol intelligence tables:
--   learning_decisions, issue_patterns, protocol_improvement_queue, retrospectives
--
-- Columns: source_type, item_key, title, status, created_at, resolution_notes, score
--
-- UP

CREATE OR REPLACE VIEW v_eva_knowledge_base AS

  SELECT
    'learning_decision'::TEXT            AS source_type,
    id::TEXT                             AS item_key,
    COALESCE(sd_id::TEXT, id::TEXT)      AS title,
    status::TEXT                         AS status,
    created_at                           AS created_at,
    NULL::TEXT                           AS resolution_notes,
    COALESCE(confidence_score, NULL)     AS score
  FROM learning_decisions

  UNION ALL

  SELECT
    'issue_pattern'::TEXT                AS source_type,
    COALESCE(pattern_id, id::TEXT)       AS item_key,
    COALESCE(issue_summary, id::TEXT)    AS title,
    status::TEXT                         AS status,
    created_at                           AS created_at,
    resolution_notes::TEXT               AS resolution_notes,
    COALESCE(success_rate, NULL)         AS score
  FROM issue_patterns

  UNION ALL

  SELECT
    'protocol_improvement'::TEXT         AS source_type,
    id::TEXT                             AS item_key,
    COALESCE(description, id::TEXT)      AS title,
    status::TEXT                         AS status,
    created_at                           AS created_at,
    NULL::TEXT                           AS resolution_notes,
    COALESCE(effectiveness_score, NULL)  AS score
  FROM protocol_improvement_queue

  UNION ALL

  SELECT
    'retrospective'::TEXT                AS source_type,
    id::TEXT                             AS item_key,
    COALESCE(title, id::TEXT)            AS title,
    status::TEXT                         AS status,
    created_at                           AS created_at,
    NULL::TEXT                           AS resolution_notes,
    COALESCE(quality_score::NUMERIC, NULL) AS score
  FROM retrospectives;

-- DOWN
-- DROP VIEW IF EXISTS v_eva_knowledge_base;
