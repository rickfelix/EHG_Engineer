-- ============================================================================
-- Migration: door_routing_ledger — per-item tiered-orchestration economics
-- Date: 2026-07-05
-- SD: SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001 (FR-4 / DOOR-3)
--
-- APPLY AT THE TUESDAY CUTOVER alongside DOOR_ROUTING_ENABLED=true (the writer
-- lib/fleet/door-routing-ledger.cjs is flag-gated and fire-and-forget, so the
-- table's absence before cutover costs nothing). Additive table, no RLS surface
-- (harness telemetry, service-role writers only) — same class as
-- claude_sessions.last_tool_at. Column naming per the venture_token_ledger
-- precedent (model_id, cost_usd).
-- ============================================================================

CREATE TABLE IF NOT EXISTS door_routing_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_key TEXT NOT NULL,                -- SD key or QF id
  door TEXT NOT NULL CHECK (door IN ('one_way', 'two_way')),
  delegate_model TEXT,                   -- opus|sonnet (two_way only; pluggable tiers)
  tier_rank INTEGER,
  tokens_input BIGINT,
  tokens_output BIGINT,
  cost_usd NUMERIC(12, 6),
  model_id TEXT,
  coverage_note TEXT,
  routed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_door_routing_ledger_routed_at ON door_routing_ledger (routed_at);
CREATE INDEX IF NOT EXISTS idx_door_routing_ledger_work_key ON door_routing_ledger (work_key);

COMMENT ON TABLE door_routing_ledger IS
  'Per-item door-routing economics (SD-LEO-INFRA-TIERED-ORCHESTRATION-FABLE-001). '
  'Chairman rollup: SELECT date_trunc(''day'', routed_at) AS day, door, '
  'COALESCE(delegate_model, ''fable'') AS tier, count(*) AS items, '
  'sum(tokens_input) AS tin, sum(tokens_output) AS tout, sum(cost_usd) AS usd '
  'FROM door_routing_ledger GROUP BY 1,2,3 ORDER BY 1 DESC, 2, 3;  '
  'v1 measures the routing surface, not full delegate usage.';
