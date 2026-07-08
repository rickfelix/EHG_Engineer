-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-EHG-WIKI-DURABLE-001: durable, structured, DB-backed knowledge base
-- (Karpathy "Wiki vs. Open Brain" framing — curated addressable knowledge, not in-context recall).
-- Modeled on the leo_protocol_sections pattern that already generates CLAUDE.md from the DB.
-- Phase 1 scope: identity, ventures, factory. personas/governance are schema-ready but unseeded
-- (deferred to a Phase 2 child SD).

CREATE TABLE IF NOT EXISTS ehg_wiki_sections (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('identity', 'ventures', 'factory', 'personas', 'governance')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  citation_id TEXT GENERATED ALWAYS AS ('ehg_wiki_sections id=' || id) STORED,
  chairman_ratified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (domain, slug)
);

CREATE INDEX IF NOT EXISTS idx_ehg_wiki_sections_domain ON ehg_wiki_sections (domain);

ALTER TABLE ehg_wiki_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ehg_wiki_sections_service_role_all ON ehg_wiki_sections;
CREATE POLICY ehg_wiki_sections_service_role_all ON ehg_wiki_sections
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS ehg_wiki_sections_authenticated_read ON ehg_wiki_sections;
CREATE POLICY ehg_wiki_sections_authenticated_read ON ehg_wiki_sections
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'anon'));
