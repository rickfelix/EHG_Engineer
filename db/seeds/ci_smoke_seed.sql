-- CI Smoke Seed Data
-- Run AFTER migrations & BEFORE verification. Temporarily disable RLS for inserts.
BEGIN;

-- Create schemas if not exists
CREATE SCHEMA IF NOT EXISTS eng;
CREATE SCHEMA IF NOT EXISTS vh;

-- Create tables if not exists (minimal structure for CI)
CREATE TABLE IF NOT EXISTS eng.strategic_directives_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_key TEXT UNIQUE,
    title TEXT NOT NULL,
    owner TEXT,
    decision_log_ref TEXT,
    evidence_ref TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eng.product_requirements_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID REFERENCES eng.strategic_directives_v2(id),
    completeness_score INTEGER,
    risk_rating TEXT,
    acceptance_criteria_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eng.eng_backlog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id UUID REFERENCES eng.product_requirements_v2(id),
    type TEXT,
    state TEXT,
    priority TEXT,
    qa_gate_min INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vh.vh_ventures (
    venture_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vh.vh_stage_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID REFERENCES vh.vh_ventures(venture_id),
    stage TEXT,
    qa_score INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Governance (EHG_Engineering)
-- Disable RLS temporarily for seeding (CI runs as DB owner)
ALTER TABLE eng.strategic_directives_v2 DISABLE ROW LEVEL SECURITY;
ALTER TABLE eng.product_requirements_v2 DISABLE ROW LEVEL SECURITY;
ALTER TABLE eng.eng_backlog DISABLE ROW LEVEL SECURITY;

-- SD
WITH s AS (
  INSERT INTO eng.strategic_directives_v2 (id, sd_key, title, owner, decision_log_ref, evidence_ref, approved_at)
  VALUES (
    gen_random_uuid(),
    'SD-2025-09-01-ci-smoke',
    'CI Smoke SD',
    'EHG Bot',
    'docs/decisions/SD-2025-09-01-ci-smoke.md',
    'docs/evidence/SD-2025-09-01-ci-smoke.md',
    now()
  )
  ON CONFLICT (sd_key) DO UPDATE SET updated_at = NOW()
  RETURNING id
)
-- PRD
, p AS (
  INSERT INTO eng.product_requirements_v2 (id, sd_id, completeness_score, risk_rating, acceptance_criteria_json)
  SELECT gen_random_uuid(), s.id, 90, 'low', '[]'::jsonb FROM s
  RETURNING id, sd_id
)
-- Backlog x2
INSERT INTO eng.eng_backlog (id, prd_id, type, state, priority, qa_gate_min)
SELECT gen_random_uuid(), p.id, 'feature', 'todo', 'P1', 70 FROM p
UNION ALL
SELECT gen_random_uuid(), p.id, 'doc', 'doing', 'P2', 60 FROM p;

-- Re-enable RLS
ALTER TABLE eng.eng_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE eng.product_requirements_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE eng.strategic_directives_v2 ENABLE ROW LEVEL SECURITY;

-- Venture (EHG)
ALTER TABLE vh.vh_ventures DISABLE ROW LEVEL SECURITY;
ALTER TABLE vh.vh_stage_states DISABLE ROW LEVEL SECURITY;

-- Minimal venture rows (unlinked initially; hydration job will fill ids)
INSERT INTO vh.vh_ventures (venture_id, name)
VALUES (gen_random_uuid(), 'CI Smoke Venture')
ON CONFLICT DO NOTHING;

-- Stage row referencing gate thresholds via SD/PRD once hydrated
INSERT INTO vh.vh_stage_states (id, venture_id, stage, qa_score)
SELECT gen_random_uuid(), v.venture_id, 'stage_01', 75
FROM vh.vh_ventures v
WHERE v.name = 'CI Smoke Venture'
ON CONFLICT DO NOTHING;

ALTER TABLE vh.vh_stage_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE vh.vh_ventures ENABLE ROW LEVEL SECURITY;

-- Create views if not exists
CREATE OR REPLACE VIEW views.v_vh_governance_snapshot AS
SELECT
    sd.id as sd_id,
    sd.title as sd_title,
    pr.id as prd_id,
    pr.completeness_score,
    COUNT(DISTINCT eb.id) as backlog_count
FROM eng.strategic_directives_v2 sd
LEFT JOIN eng.product_requirements_v2 pr ON pr.sd_id = sd.id
LEFT JOIN eng.eng_backlog eb ON eb.prd_id = pr.id
GROUP BY sd.id, sd.title, pr.id, pr.completeness_score;

CREATE OR REPLACE VIEW views.v_vh_stage_progress AS
SELECT
    v.venture_id,
    v.name as venture_name,
    ss.stage,
    ss.qa_score,
    COUNT(DISTINCT sd.id) as linked_sds
FROM vh.vh_ventures v
LEFT JOIN vh.vh_stage_states ss ON ss.venture_id = v.venture_id
LEFT JOIN eng.strategic_directives_v2 sd ON sd.title LIKE '%' || v.name || '%'
GROUP BY v.venture_id, v.name, ss.stage, ss.qa_score;

COMMIT;

-- Log seed completion
SELECT 'CI Smoke Seed Complete' as status, NOW() as timestamp;