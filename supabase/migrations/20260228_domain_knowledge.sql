-- Domain Knowledge table for Domain Intelligence System
-- Stores accumulated industry/segment/problem knowledge with freshness tracking
-- Part of SD-LEO-INFRA-IMPLEMENT-DOMAIN-INTELLIGENCE-001

CREATE TABLE IF NOT EXISTS domain_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT NOT NULL,
  segment TEXT,
  problem_area TEXT,
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('market_data', 'competitor', 'pain_point', 'trend', 'regulation', 'technology')),
  title TEXT NOT NULL CHECK (char_length(title) <= 200),
  content TEXT NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  tags TEXT[] DEFAULT '{}',
  extraction_count INTEGER DEFAULT 1,
  source_session_id UUID REFERENCES brainstorm_sessions(id),
  source_venture_id UUID,
  last_verified_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dedup index: one entry per (industry, knowledge_type, title)
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_knowledge_dedup
  ON domain_knowledge (industry, knowledge_type, title);

-- Index for industry lookups
CREATE INDEX IF NOT EXISTS idx_domain_knowledge_industry
  ON domain_knowledge (industry);

-- Index for cross-venture tag searches
CREATE INDEX IF NOT EXISTS idx_domain_knowledge_tags
  ON domain_knowledge USING GIN (tags);

-- RLS policies
ALTER TABLE domain_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access on domain_knowledge"
  ON domain_knowledge FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_domain_knowledge_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_domain_knowledge_updated_at ON domain_knowledge;
CREATE TRIGGER trg_domain_knowledge_updated_at
  BEFORE UPDATE ON domain_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION update_domain_knowledge_updated_at();
