-- Taste Gate Tables Migration
-- SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-A
-- Creates: taste_profiles, taste_interaction_logs, trust_promotions
-- RLS: chairman-write/board-read, agent-append-only, chairman-only

-- ═══════════════════════════════════════════════════════════
-- 1. taste_profiles — Chairman taste preferences (layered)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chairman_id TEXT NOT NULL DEFAULT 'default',
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  gate_type TEXT NOT NULL CHECK (gate_type IN ('design', 'scope', 'architecture')),
  preferences JSONB NOT NULL DEFAULT '{}',
  trust_level TEXT NOT NULL DEFAULT 'manual' CHECK (trust_level IN ('manual', 'recommend', 'auto')),
  confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chairman_id, venture_id, gate_type)
);

COMMENT ON TABLE taste_profiles IS 'Chairman taste preferences with layered resolution (global defaults + per-venture overrides). CONFIDENTIAL.';
COMMENT ON COLUMN taste_profiles.venture_id IS 'NULL = global default profile. Non-null = venture-specific override.';
COMMENT ON COLUMN taste_profiles.trust_level IS 'manual = always block. recommend = show recommendation. auto = auto-proceed when confident.';

-- ═══════════════════════════════════════════════════════════
-- 2. taste_interaction_logs — Decision audit trail
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS taste_interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  gate_type TEXT NOT NULL CHECK (gate_type IN ('design', 'scope', 'architecture')),
  stage_number INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'conditional', 'escalate')),
  dimension_scores JSONB,
  context_tags TEXT[] DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('active', 'timeout', 'system')),
  chairman_notes TEXT,
  confidence_at_decision NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE taste_interaction_logs IS 'Append-only log of every taste gate decision. Source tag distinguishes active chairman decisions from timeout auto-proceeds.';

CREATE INDEX idx_taste_logs_venture_gate ON taste_interaction_logs (venture_id, gate_type, created_at DESC);
CREATE INDEX idx_taste_logs_confidence ON taste_interaction_logs (gate_type, source, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 3. trust_promotions — Immutable audit trail
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trust_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chairman_id TEXT NOT NULL DEFAULT 'default',
  gate_type TEXT NOT NULL CHECK (gate_type IN ('design', 'scope', 'architecture')),
  old_level TEXT NOT NULL CHECK (old_level IN ('manual', 'recommend', 'auto')),
  new_level TEXT NOT NULL CHECK (new_level IN ('manual', 'recommend', 'auto')),
  confidence_at_promotion NUMERIC(4,3),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE trust_promotions IS 'Immutable audit trail of trust level changes. Chairman-only writes.';

-- ═══════════════════════════════════════════════════════════
-- 4. RLS Policies
-- ═══════════════════════════════════════════════════════════

ALTER TABLE taste_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_promotions ENABLE ROW LEVEL SECURITY;

-- taste_profiles: service role has full access (chairman writes via backend)
CREATE POLICY taste_profiles_service_all ON taste_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- taste_interaction_logs: service role has full access (agent appends via worker)
CREATE POLICY taste_logs_service_all ON taste_interaction_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- trust_promotions: service role has full access (chairman writes via backend)
CREATE POLICY trust_promotions_service_all ON trust_promotions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 5. Add taste_gate_config to chairman_dashboard_config
-- ═══════════════════════════════════════════════════════════

UPDATE chairman_dashboard_config
SET taste_gate_config = '{"s10_enabled": false, "s13_enabled": false, "s16_enabled": false, "timeout_hours": 72, "confidence_floor": 0.70, "override_demote_threshold": 0.20}'::jsonb
WHERE config_key = 'default'
  AND (taste_gate_config IS NULL);
