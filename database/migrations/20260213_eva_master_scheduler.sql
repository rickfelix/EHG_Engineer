-- EVA Master Scheduler: Priority Queue + Cadence Management
-- SD: SD-EVA-FEAT-SCHEDULER-001
--
-- Creates:
--   1. eva_scheduler_queue - persistent priority queue for venture scheduling
--   2. eva_scheduler_metrics - observability metrics for scheduler events
--   3. Indexes for priority ordering and concurrent access
--   4. Auto-enqueue trigger on venture creation

-- ════════════════════════════════════════════════════════════
-- 1. eva_scheduler_queue
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eva_scheduler_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES eva_ventures(id) ON DELETE CASCADE,
  -- Ordering fields
  last_blocking_decision_at TIMESTAMPTZ,           -- NULL = never blocked
  blocking_decision_age_seconds NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN last_blocking_decision_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - last_blocking_decision_at))
      ELSE 0
    END
  ) STORED,
  fifo_key TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- insertion order for tie-breaking
  -- Scheduling state
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatching', 'blocked', 'paused', 'completed')),
  max_stages_per_cycle INTEGER NOT NULL DEFAULT 5,
  -- Metadata
  last_dispatched_at TIMESTAMPTZ,
  last_dispatch_outcome TEXT,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one queue entry per venture
CREATE UNIQUE INDEX IF NOT EXISTS idx_esq_venture_id
  ON eva_scheduler_queue (venture_id);

-- Priority ordering index for the selection query
-- ORDER BY: blocking_decision_age DESC, priority_score DESC, fifo_key ASC
CREATE INDEX IF NOT EXISTS idx_esq_scheduling_order
  ON eva_scheduler_queue (status, blocking_decision_age_seconds DESC NULLS LAST, fifo_key ASC)
  WHERE status = 'pending';

-- For heartbeat/status queries
CREATE INDEX IF NOT EXISTS idx_esq_status
  ON eva_scheduler_queue (status);

-- ════════════════════════════════════════════════════════════
-- 2. eva_scheduler_metrics
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eva_scheduler_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'scheduler_poll',
      'scheduler_dispatch',
      'scheduler_cadence_limited',
      'scheduler_circuit_breaker_pause',
      'scheduler_error'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduler_instance_id TEXT,
  -- Venture context (nullable for poll events)
  venture_id UUID REFERENCES eva_ventures(id),
  stage_name TEXT,
  -- Outcome fields
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'skipped', NULL)),
  failure_reason TEXT,
  duration_ms INTEGER,
  -- Poll-specific
  queue_depth INTEGER,
  dispatched_count INTEGER,
  paused BOOLEAN DEFAULT FALSE,
  pause_reason TEXT,
  -- Cadence-specific
  stages_dispatched INTEGER,
  stages_remaining INTEGER,
  max_stages_per_cycle INTEGER,
  -- JSON metadata for extensibility
  metadata JSONB DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series index for recent events
CREATE INDEX IF NOT EXISTS idx_esm_event_type_time
  ON eva_scheduler_metrics (event_type, occurred_at DESC);

-- Venture-scoped queries
CREATE INDEX IF NOT EXISTS idx_esm_venture_time
  ON eva_scheduler_metrics (venture_id, occurred_at DESC)
  WHERE venture_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════
-- 3. Scheduler heartbeat table (singleton)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eva_scheduler_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  instance_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_poll_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  poll_count INTEGER NOT NULL DEFAULT 0,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  circuit_breaker_state TEXT DEFAULT 'CLOSED',
  paused_reason TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'stopping', 'stopped')),
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- 4. Atomic venture selection RPC (FOR UPDATE SKIP LOCKED)
-- ════════════════════════════════════════════════════════════

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
      v.orchestrator_state
    FROM eva_scheduler_queue q
    JOIN eva_ventures v ON v.id = q.venture_id
    WHERE q.status = 'pending'
      AND v.orchestrator_state NOT IN ('blocked', 'failed')
    ORDER BY q.blocking_decision_age_seconds DESC NULLS LAST,
             q.fifo_key ASC
    LIMIT p_batch_size
    FOR UPDATE OF q SKIP LOCKED
  )
  SELECT
    l.queue_id,
    l.venture_id,
    l.blocking_decision_age_seconds,
    0::NUMERIC AS priority_score,  -- placeholder until per-venture scoring
    l.fifo_key,
    l.max_stages_per_cycle
  FROM lockable l
  -- Exclude ventures with pending chairman decisions
  WHERE NOT EXISTS (
    SELECT 1 FROM eva_decisions d
    WHERE d.venture_id = l.venture_id
      AND d.status = 'pending'
  );
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════
-- 5. Auto-enqueue trigger
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_auto_enqueue_venture()
RETURNS TRIGGER AS $$
BEGIN
  -- Idempotent upsert: insert queue entry if not exists
  INSERT INTO eva_scheduler_queue (venture_id, fifo_key)
  VALUES (NEW.id, NOW())
  ON CONFLICT (venture_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on venture creation
DROP TRIGGER IF EXISTS trg_auto_enqueue_venture ON eva_ventures;
CREATE TRIGGER trg_auto_enqueue_venture
  AFTER INSERT ON eva_ventures
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_enqueue_venture();

-- ════════════════════════════════════════════════════════════
-- 6. Enqueue existing ventures (backfill)
-- ════════════════════════════════════════════════════════════

INSERT INTO eva_scheduler_queue (venture_id, fifo_key)
SELECT id, COALESCE(created_at, NOW())
FROM eva_ventures
WHERE id NOT IN (SELECT venture_id FROM eva_scheduler_queue)
ON CONFLICT (venture_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 7. Updated_at trigger
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_esq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_esq_updated_at ON eva_scheduler_queue;
CREATE TRIGGER trg_esq_updated_at
  BEFORE UPDATE ON eva_scheduler_queue
  FOR EACH ROW
  EXECUTE FUNCTION fn_esq_updated_at();

-- ════════════════════════════════════════════════════════════
-- 8. RLS Policies (service role access)
-- ════════════════════════════════════════════════════════════

ALTER TABLE eva_scheduler_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_scheduler_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_scheduler_heartbeat ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_esq" ON eva_scheduler_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_esm" ON eva_scheduler_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_esh" ON eva_scheduler_heartbeat
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated read access for status queries
CREATE POLICY "authenticated_read_esq" ON eva_scheduler_queue
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_esm" ON eva_scheduler_metrics
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_esh" ON eva_scheduler_heartbeat
  FOR SELECT USING (auth.role() = 'authenticated');
