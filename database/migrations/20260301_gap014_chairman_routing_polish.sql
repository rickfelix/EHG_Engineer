-- Migration: Chairman Gatekeeping & Work Routing Polish
-- SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-014
-- Purpose: SLA-urgency sort, computed priority scores, blocking column formalization
--
-- Changes:
--   1. v_chairman_pending_decisions: SLA-remaining sort (A07)
--   2. select_schedulable_ventures: computed priority_score (A04)
--   3. chairman_decisions.blocking: explicit column with DEFAULT false (A07)

-- ============================================================
-- Change 1: Formalize blocking column on chairman_decisions
-- ============================================================
-- The column is already used by chairman-sla-enforcer.js and
-- dfe-gate-escalation-router.js but was never explicitly added
-- via migration. This makes it explicit and idempotent.

ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS blocking BOOLEAN DEFAULT false;

-- decision_type is referenced by chairman-sla-enforcer.js but was never
-- explicitly added via migration. This makes it explicit.
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS decision_type TEXT;

COMMENT ON COLUMN chairman_decisions.blocking IS
  'When true, this decision blocks downstream SD progression. '
  'Set by chairman-sla-enforcer.js when SLA is violated with blockOnViolation=true. '
  'Read by enforceDecisionSLAs() to skip further escalation on already-blocking decisions. '
  'SD-MAN-GEN-CORRECTIVE-VISION-GAP-014';

-- Index for blocking queries (SLA enforcer filters on pending + blocking)
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_blocking
  ON chairman_decisions (blocking)
  WHERE status = 'pending';

-- ============================================================
-- Change 2: v_chairman_pending_decisions with SLA-remaining sort
-- ============================================================
-- Replaces created_at DESC sort with SLA-remaining ascending.
-- Uses decision_type to look up SLA hours, then computes deadline
-- and remaining time. Most urgent decisions sort first.

-- DROP existing view first because column order/names change
DROP VIEW IF EXISTS v_chairman_pending_decisions;

CREATE OR REPLACE VIEW v_chairman_pending_decisions AS
WITH sla_config AS (
  -- SLA hours per decision_type (mirrors DEFAULT_SLA_MATRIX in chairman-sla-enforcer.js)
  SELECT * FROM (VALUES
    ('gate_decision',        4),
    ('guardrail_override',   8),
    ('cascade_override',     8),
    ('advisory',            24),
    ('override',            12),
    ('budget_review',        2),
    ('stakeholder_response', 2)
  ) AS t(decision_type, sla_hours)
)
SELECT
  cd.id,
  cd.venture_id,
  v.name AS venture_name,
  cd.lifecycle_stage,
  lsc.stage_name,
  cd.health_score,
  cd.recommendation,
  cd.decision,
  cd.status,
  cd.summary,
  cd.brief_data,
  cd.override_reason,
  cd.risks_acknowledged,
  cd.quick_fixes_applied,
  cd.created_at,
  cd.updated_at,
  cd.decided_by,
  cd.rationale,
  cd.blocking,
  -- SLA deadline: created_at + SLA hours (default 24h if type unknown)
  cd.created_at + make_interval(hours => COALESCE(sc.sla_hours, 24)) AS sla_deadline_at,
  -- SLA remaining in seconds (negative = overdue)
  EXTRACT(EPOCH FROM (
    cd.created_at + make_interval(hours => COALESCE(sc.sla_hours, 24)) - NOW()
  )) AS sla_remaining_seconds,
  -- Stale-context indicator
  CASE
    WHEN v.updated_at > cd.created_at THEN true
    ELSE false
  END AS is_stale_context,
  v.updated_at AS venture_updated_at
FROM chairman_decisions cd
JOIN ventures v ON v.id = cd.venture_id
LEFT JOIN lifecycle_stage_config lsc ON lsc.stage_number = cd.lifecycle_stage
LEFT JOIN sla_config sc ON sc.decision_type = cd.decision_type
ORDER BY
  -- Pending decisions first
  CASE cd.status WHEN 'pending' THEN 0 ELSE 1 END,
  -- Then by SLA remaining ascending (most urgent / overdue first)
  EXTRACT(EPOCH FROM (
    cd.created_at + make_interval(hours => COALESCE(sc.sla_hours, 24)) - NOW()
  )) ASC NULLS LAST;


-- ============================================================
-- Change 3: select_schedulable_ventures with computed priority_score
-- ============================================================
-- Replaces placeholder 0::NUMERIC with a weighted formula:
--   priority_score = (0.4 * blocking_age_factor) + (0.3 * health_factor) + (0.3 * fifo_factor)
--
-- blocking_age_factor: normalized 0-100, higher = older blocking decision
-- health_factor: inverse of health_score (lower health = higher priority)
-- fifo_factor: normalized 0-100 based on queue position age

CREATE OR REPLACE FUNCTION select_schedulable_ventures(p_batch_size INTEGER DEFAULT 20)
RETURNS TABLE (
  queue_id UUID,
  venture_id UUID,
  blocking_decision_age_seconds NUMERIC,
  priority_score NUMERIC,
  fifo_key TIMESTAMPTZ,
  max_stages_per_cycle INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH lockable AS (
    SELECT
      q.id AS queue_id,
      q.venture_id,
      q.blocking_decision_age_seconds,
      q.fifo_key,
      q.max_stages_per_cycle,
      v.orchestrator_state,
      v.health_status
    FROM eva_scheduler_queue q
    JOIN eva_ventures v ON v.id = q.venture_id
    WHERE q.status = 'pending'
      AND v.orchestrator_state NOT IN ('blocked', 'failed')
    ORDER BY q.blocking_decision_age_seconds DESC NULLS LAST,
             q.fifo_key ASC
    LIMIT p_batch_size
    FOR UPDATE OF q SKIP LOCKED
  ),
  scored AS (
    SELECT
      l.*,
      -- Blocking age factor (0-100): older blocking = higher score
      -- Normalize: cap at 86400 seconds (24h), scale to 0-100
      LEAST(COALESCE(l.blocking_decision_age_seconds, 0) / 864.0, 100) AS blocking_age_factor,
      -- Health factor (0-100): lower health = higher priority
      -- health_status is text (healthy/warning/critical); map to numeric score
      (100.0 - CASE l.health_status
        WHEN 'healthy' THEN 80
        WHEN 'warning' THEN 50
        WHEN 'critical' THEN 20
        ELSE 50
      END) AS health_factor,
      -- FIFO factor (0-100): older queue entry = higher priority
      -- Normalize based on age in seconds, cap at 3600 (1 hour)
      LEAST(EXTRACT(EPOCH FROM (NOW() - l.fifo_key)) / 36.0, 100) AS fifo_factor
    FROM lockable l
  )
  SELECT
    s.queue_id,
    s.venture_id,
    s.blocking_decision_age_seconds,
    -- Weighted composite: blocking_age(40%) + health(30%) + fifo(30%)
    ROUND((0.4 * s.blocking_age_factor) + (0.3 * s.health_factor) + (0.3 * s.fifo_factor), 2) AS priority_score,
    s.fifo_key,
    s.max_stages_per_cycle
  FROM scored s
  -- Exclude ventures with pending chairman decisions
  WHERE NOT EXISTS (
    SELECT 1 FROM eva_decisions d
    WHERE d.eva_venture_id = s.venture_id
      AND d.status = 'pending'
  )
  ORDER BY
    -- Primary: computed priority score descending (highest priority first)
    ROUND((0.4 * s.blocking_age_factor) + (0.3 * s.health_factor) + (0.3 * s.fifo_factor), 2) DESC;
END;
$$ LANGUAGE plpgsql;
