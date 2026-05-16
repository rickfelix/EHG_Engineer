-- Sibling D FR-D-1: contract_chain_links table (D-schema week 3 cohort, ADDITIVE-ONLY)
-- Ordinal 20260516150000 strictly > Sibling B 20260516140001 (in main via PR #3789).

CREATE TABLE IF NOT EXISTS contract_chain_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_contract_type TEXT NOT NULL,
  parent_contract_id UUID NOT NULL,
  child_contract_type TEXT NOT NULL,
  child_contract_id UUID NOT NULL,
  link_type TEXT NOT NULL,
  link_status TEXT NOT NULL DEFAULT 'active',
  correlation_id UUID DEFAULT gen_random_uuid(),
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  vocabulary_version TEXT NOT NULL DEFAULT '1.0.0',
  smoke_test_passed_at TIMESTAMPTZ,
  runtime_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_chain_links_parent_type_check') THEN
    ALTER TABLE contract_chain_links ADD CONSTRAINT contract_chain_links_parent_type_check
      CHECK (parent_contract_type IN ('sd','prd','handoff','user_story'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_chain_links_child_type_check') THEN
    ALTER TABLE contract_chain_links ADD CONSTRAINT contract_chain_links_child_type_check
      CHECK (child_contract_type IN ('sd','prd','handoff','user_story','sub_agent_result','retro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_chain_links_link_type_check') THEN
    ALTER TABLE contract_chain_links ADD CONSTRAINT contract_chain_links_link_type_check
      CHECK (link_type IN ('produces','consumes','validates','blocks'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_chain_links_link_status_check') THEN
    ALTER TABLE contract_chain_links ADD CONSTRAINT contract_chain_links_link_status_check
      CHECK (link_status IN ('active','superseded','broken'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contract_chain_links_parent ON contract_chain_links (parent_contract_type, parent_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_chain_links_child ON contract_chain_links (child_contract_type, child_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_chain_links_status ON contract_chain_links (link_status);
CREATE INDEX IF NOT EXISTS idx_contract_chain_links_correlation ON contract_chain_links (correlation_id);

ALTER TABLE contract_chain_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_chain_links_insert_only ON contract_chain_links;
CREATE POLICY contract_chain_links_insert_only ON contract_chain_links
  FOR INSERT TO PUBLIC WITH CHECK (true);

DROP POLICY IF EXISTS contract_chain_links_read_all ON contract_chain_links;
CREATE POLICY contract_chain_links_read_all ON contract_chain_links
  FOR SELECT TO PUBLIC USING (true);

COMMENT ON TABLE contract_chain_links IS 'Sibling D (SD-WRITERCONSUMER-...-001-D) — INSERT-only ledger of contract chain links (parent_contract → child_contract). D-schema week 3 cohort. lib/contract-chain/walker.mjs reads this for chain traversal. Soft FK pattern (no DB-level constraint) to avoid migration coupling.';
