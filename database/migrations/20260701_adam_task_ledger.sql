-- adam_task_ledger — durable HIERARCHICAL task board backing Adam's project-management discipline.
-- SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A (Child A / FR-1 — the FOUNDATION).
--
-- A single task TREE: chairman-visible PARENT nodes (milestone / decision / blocker) and Adam-
-- operational CHILD subtasks, related by parent_id (self-FK) with status + blocker ROLLUP child->parent.
-- The harness TaskCreate list is session-ephemeral; this backs the board in the DB so a restarted /
-- compacted Adam reconstructs its open items. UNIQUE(source_kind, source_ref) makes rehydrateBoard a
-- safe idempotent upsert.
--
-- Additive (new table) — no change to any existing table. Mirrors the adam_adherence_ledger +
-- solomon_advice_outcome_ledger RLS pattern (service_role write / authenticated+service_role read)
-- and the solomon updated_at trigger.
--
-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- Chairman-gated apply (requires_chairman_apply). Do NOT self-apply — this stages for chairman apply
-- (check-migration-readiness downgrades to PASS_CHAIRMAN_GATED_PENDING; it does not hard-block).

CREATE TABLE IF NOT EXISTS adam_task_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid REFERENCES adam_task_ledger(id) ON DELETE CASCADE,   -- self-FK: the task TREE
  tier         text NOT NULL CHECK (tier IN ('parent','child')),         -- parent=chairman-visible, child=Adam-operational
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','blocked','done','cancelled')),
  title        text NOT NULL,
  source_kind  text NOT NULL
                 CHECK (source_kind IN ('advisory_thread','sourced_sd','awaited_reply','manual')),
  source_ref   text NOT NULL,                     -- idempotent rehydrate key (with source_kind)
  blocker      text,                              -- materialized blocker/issue that bubbles child->parent
  benefit      text,                              -- one-line what-it-delivers (chairman-parent)
  risk         text,                              -- risks + mitigation note
  token_cost   numeric,                           -- coarse per-parent rollup (light; NOT per-subtask accounting)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_ref)                -- idempotent rehydrate-upsert key
);

CREATE INDEX IF NOT EXISTS idx_adam_task_ledger_parent ON adam_task_ledger (parent_id);
CREATE INDEX IF NOT EXISTS idx_adam_task_ledger_status ON adam_task_ledger (status);
CREATE INDEX IF NOT EXISTS idx_adam_task_ledger_source ON adam_task_ledger (source_kind, source_ref);

-- RLS: authenticated read; service_role full write (mirrors the governance-table convention).
ALTER TABLE adam_task_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adam_task_ledger_read ON adam_task_ledger;
CREATE POLICY adam_task_ledger_read ON adam_task_ledger
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS adam_task_ledger_service_write ON adam_task_ledger;
CREATE POLICY adam_task_ledger_service_write ON adam_task_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at trigger (mirrors the solomon_advice_outcome_ledger template).
CREATE OR REPLACE FUNCTION trg_adam_task_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adam_task_ledger_updated ON adam_task_ledger;
CREATE TRIGGER trg_adam_task_ledger_updated BEFORE UPDATE ON adam_task_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_adam_task_ledger_updated_at();

COMMENT ON TABLE adam_task_ledger IS 'Durable HIERARCHICAL task board for Adam project-management discipline (SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A / Child A). One task TREE via parent_id (self-FK): chairman-visible PARENT nodes + Adam-operational CHILD subtasks, with status + blocker rollup child->parent. Survives compaction/role-handoff; rehydrated idempotently from live sources via UNIQUE(source_kind, source_ref).';
COMMENT ON COLUMN adam_task_ledger.parent_id IS 'Self-FK to the parent node (NULL for a root/parent-tier node). ON DELETE CASCADE removes the subtree.';
COMMENT ON COLUMN adam_task_ledger.tier IS 'parent = chairman-visible milestone/decision/blocker; child = Adam-operational subtask.';
COMMENT ON COLUMN adam_task_ledger.source_kind IS 'Rehydrate provenance: advisory_thread | sourced_sd | awaited_reply | manual. With source_ref forms the idempotent rehydrate key.';
COMMENT ON COLUMN adam_task_ledger.source_ref IS 'Stable natural key for the source (correlation_id / sd_key / …). UNIQUE with source_kind so rehydrateBoard is an upsert, not a duplicate.';
COMMENT ON COLUMN adam_task_ledger.blocker IS 'Materialized blocker/issue text; bubbleBlockers() surfaces a child blocker onto its parent for the chairman-curated view.';
COMMENT ON COLUMN adam_task_ledger.token_cost IS 'Coarse per-parent token rollup (light; a simple sum — NOT per-subtask accounting).';
