-- SD-LEO-INFRA-SOURCING-ENGINE-CHAIRMAN-QUEUE-001 (FR-1 / FR-2)
-- Sourcing engine child 4/10 — the chairman decision-queue lane.
--
-- A durable home for candidates the router lanes to 'chairman-gated' (needs an authority only the
-- chairman can grant: grant/rls/credential/operational/vision) or escalates as 'outcome-gated'. Without
-- it, gated items have nowhere to land and the engine can't run hands-off-except-at-input-points. The
-- escalator (lib/sourcing-engine/escalator.js) writes ONE row per (source_id, gate_type) — a tracked
-- decision row with an SLA + state, not a transient prose ask.
--
-- DORMANT: the fleet AUTHORS + TESTS this migration; workers CANNOT self-apply prod. Adam applies this
-- ADDITIVE CREATE TABLE via the database-agent under the chairman's additive-DDL delegation. A bare
-- CREATE TABLE is additive and NOT chairman-gated; the chairman is paged ONLY if an RLS policy is later
-- required (deferred — this table is fleet-internal queue state, read/written by the engine, not a
-- user-facing surface). Until applied, the escalator fail-softs (PGRST205/PGRST204 -> degraded, no throw).
--
-- Idempotent (IF NOT EXISTS) so a re-run is a no-op.

CREATE TABLE IF NOT EXISTS sourcing_chairman_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       text,                          -- the candidate's source ref (conversion_ledger / roadmap item)
  title           text,
  lane            text NOT NULL,                 -- the router lane that queued it: 'chairman-gated' | 'outcome-gated'
  gate_type       text NOT NULL,                 -- the gate kind (same axis as lane; part of the idempotency key)
  escalation_type text,                          -- chairman authority (grant|rls|credential|operational|vision) or 'outcome'
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- the routed payload: { rung, disposition, escalation, enablers }
  sla_hours       integer,                       -- the decision SLA window (hours)
  sla_due_at      timestamptz,                   -- created_at + sla_hours (when the decision is due)
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'decided', 'deferred_until', 'escalated')),
  deferred_until  timestamptz,                   -- set when state = 'deferred_until'
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,                   -- set when state leaves 'pending'
  -- Idempotency: one open queue row per (item, gate). The escalator upserts on this key, so a re-run of
  -- the router over the same candidate never duplicates the chairman ask.
  UNIQUE (source_id, gate_type)
);

-- Fast lookups for the pending decision queue (the chairman/Adam reader) and SLA breach scans.
CREATE INDEX IF NOT EXISTS idx_sourcing_chairman_queue_state ON sourcing_chairman_queue (state);
CREATE INDEX IF NOT EXISTS idx_sourcing_chairman_queue_sla   ON sourcing_chairman_queue (sla_due_at) WHERE state = 'pending';

COMMENT ON TABLE sourcing_chairman_queue IS 'Sourcing-engine chairman decision-queue lane (chairman-gated + outcome-gated candidates). Writer: lib/sourcing-engine/escalator.js. SD-LEO-INFRA-SOURCING-ENGINE-CHAIRMAN-QUEUE-001.';
