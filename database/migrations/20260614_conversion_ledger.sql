-- Migration: 20260614_conversion_ledger.sql
-- SD: SD-LEO-INFRA-UNIFY-INTAKE-POOLS-001 (FR-1)
-- Purpose: ONE conversion ledger normalizing the 3 disconnected intake pools
--          (eva_consultant_recommendations, sd_proposals, .prd-payloads/PROPOSAL-*.json)
--          so every signal reaches a terminal disposition. Backlog depth =
--          a single query (disposition IS NULL). Source rows are NEVER deleted —
--          the drain only STATUS-UPDATES them.
-- Idempotency: UNIQUE(source_pool, source_id).

CREATE TABLE IF NOT EXISTS conversion_ledger (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pool            TEXT NOT NULL CHECK (source_pool IN ('eva_consultant_rec','sd_proposal','prd_payload_file')),
  source_id              TEXT NOT NULL,                  -- uuid (DB pools) or filename (file pool)
  source_external_id     TEXT,                           -- e.g. trend_id / proposed_sd_key
  title                  TEXT NOT NULL,
  description            TEXT,
  normalized_priority    TEXT CHECK (normalized_priority IN ('critical','high','medium','low')),
  intake_status          TEXT NOT NULL DEFAULT 'registered' CHECK (intake_status IN ('registered','triaged')),
  disposition            TEXT CHECK (disposition IN ('converted','dismissed','merged_duplicate','deferred')), -- NULL = still in backlog
  triage_verdict         TEXT,
  dedup_match_sd_key     TEXT,
  dedup_score            NUMERIC(4,3),
  dismiss_reason         TEXT,
  linked_sd_key          TEXT,                           -- the SD this converted into
  promoted_proposal_path TEXT,                           -- .prd-payloads/PROPOSAL-*.json written on promote
  triaged_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_pool, source_id)
);

-- Backlog depth + drain-source lookups
CREATE INDEX IF NOT EXISTS idx_conversion_ledger_backlog     ON conversion_ledger (created_at) WHERE disposition IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversion_ledger_disposition ON conversion_ledger (disposition);
CREATE INDEX IF NOT EXISTS idx_conversion_ledger_source_pool ON conversion_ledger (source_pool);

-- RLS: intake metadata (no PII). Service-role writes (drain); authenticated reads
-- (backlog visibility). No anon/authenticated writes.
ALTER TABLE conversion_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversion_ledger' AND policyname='conversion_ledger_select') THEN
    CREATE POLICY conversion_ledger_select ON conversion_ledger FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversion_ledger' AND policyname='conversion_ledger_service') THEN
    CREATE POLICY conversion_ledger_service ON conversion_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE conversion_ledger IS 'Unified intake conversion ledger (SD-LEO-INFRA-UNIFY-INTAKE-POOLS-001). Normalizes 3 pools; backlog = disposition IS NULL; source rows never deleted.';

-- ============================================================================
-- ROLLBACK (manual):  DROP TABLE IF EXISTS conversion_ledger;
-- ============================================================================
