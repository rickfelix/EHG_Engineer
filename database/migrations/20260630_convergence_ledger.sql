-- Migration: convergence ledger (runs + per-stage rows)
-- SD: SD-LEO-INFRA-CONVERGENCE-LEDGER-001 (FR-1, FR-2)
-- @approved-by: codestreetlabs@gmail.com
--
-- The durable SSOT for every S19->S26 convergence-walk run and its per-stage progression. The 4
-- convergence circuit-breakers (SD-LEO-INFRA-CONVERGENCE-CIRCUIT-BREAKERS-001) read their thresholds
-- from here: the per-stage churn cap reads convergence_ledger_stages.fix_cycle_count; the total/daily
-- fix-SD budget reads the aggregate; the issues-per-run trend (churn-abort) reads issues_found per run.
-- Additive (two new tables) — no change to existing tables. Chairman-gated apply (requires_chairman_apply).

-- ============================================================================
-- Table: convergence_ledger_runs — one row per walk run
-- ============================================================================
CREATE TABLE IF NOT EXISTS convergence_ledger_runs (
    run_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_venture_id  UUID,
    -- the walk subject: a non-clone dummy (the convergence harness) or a clone build-tree.
    dummy_kind          TEXT CHECK (dummy_kind IS NULL OR dummy_kind IN ('non_clone', 'clone')),
    sandbox_repo        TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'paused', 'aborted', 'clean')),
    -- FR-5: run-end DUAL-PURPOSE harvest — both factory defects AND process lessons.
    harvest             JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clr_status ON convergence_ledger_runs(status);
CREATE INDEX IF NOT EXISTS idx_clr_subject_venture ON convergence_ledger_runs(subject_venture_id) WHERE subject_venture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clr_started_at ON convergence_ledger_runs(started_at DESC);

COMMENT ON TABLE convergence_ledger_runs IS 'Convergence-walk run ledger (SD-LEO-INFRA-CONVERGENCE-LEDGER-001): one row per S19->S26 walk run. The SSOT the convergence circuit-breakers + dashboards read.';

-- ============================================================================
-- Table: convergence_ledger_stages — one row per (run, stage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS convergence_ledger_stages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              UUID NOT NULL REFERENCES convergence_ledger_runs(run_id) ON DELETE CASCADE,
    stage               INTEGER NOT NULL CHECK (stage >= 0 AND stage <= 26),
    entered_at          TIMESTAMPTZ,
    -- the per-stage churn cap (breaker #2) reads fix_cycle_count; the total/daily fix-SD budget the aggregate.
    fix_cycle_count     INTEGER NOT NULL DEFAULT 0,
    issues_found        INTEGER NOT NULL DEFAULT 0,
    issues_resolved     INTEGER NOT NULL DEFAULT 0,
    stage_status        TEXT CHECK (stage_status IS NULL OR stage_status IN ('clean', 'churning', 'escalated')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- one row per stage per run, so the churn cap reads exactly one row and upserts are deterministic.
    UNIQUE (run_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_cls_run ON convergence_ledger_stages(run_id);

COMMENT ON TABLE convergence_ledger_stages IS 'Per-stage convergence-walk progression (SD-LEO-INFRA-CONVERGENCE-LEDGER-001): UNIQUE(run_id, stage 0..26). fix_cycle_count feeds the per-stage churn cap breaker.';

-- ============================================================================
-- RLS (mirrors venture_provisioning_state): service_role manage, authenticated select
-- ============================================================================
ALTER TABLE convergence_ledger_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manage_convergence_ledger_runs ON convergence_ledger_runs;
CREATE POLICY manage_convergence_ledger_runs ON convergence_ledger_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS select_convergence_ledger_runs ON convergence_ledger_runs;
CREATE POLICY select_convergence_ledger_runs ON convergence_ledger_runs FOR SELECT TO authenticated USING (true);

ALTER TABLE convergence_ledger_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manage_convergence_ledger_stages ON convergence_ledger_stages;
CREATE POLICY manage_convergence_ledger_stages ON convergence_ledger_stages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS select_convergence_ledger_stages ON convergence_ledger_stages;
CREATE POLICY select_convergence_ledger_stages ON convergence_ledger_stages FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_convergence_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clr_updated ON convergence_ledger_runs;
CREATE TRIGGER trg_clr_updated BEFORE UPDATE ON convergence_ledger_runs FOR EACH ROW EXECUTE FUNCTION trg_convergence_ledger_updated_at();

DROP TRIGGER IF EXISTS trg_cls_updated ON convergence_ledger_stages;
CREATE TRIGGER trg_cls_updated BEFORE UPDATE ON convergence_ledger_stages FOR EACH ROW EXECUTE FUNCTION trg_convergence_ledger_updated_at();
