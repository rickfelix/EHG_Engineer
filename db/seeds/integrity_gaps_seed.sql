CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

-- Temporarily relax RLS for seed (ephemeral DB only)
-- Tables may not exist yet in CI, so check first
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'strategic_directives_v2') THEN
        ALTER TABLE strategic_directives_v2 DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'product_requirements_v2') THEN
        ALTER TABLE product_requirements_v2 DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'eng_backlog') THEN
        ALTER TABLE eng_backlog DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 1) SD with missing governance metadata (triggers gap_sd_metadata.csv)
INSERT INTO strategic_directives_v2 (id, title, sd_slug, owner, decision_log_ref, evidence_ref, approved_at, created_at)
VALUES (gen_random_uuid(), 'CI Gap SD', 'ci-gap', NULL, NULL, NULL, '2099-01-01'::timestamp, '2099-01-01'::timestamp);

-- 2) PRD with structural issues (triggers gap_prd_contract.csv)
--    a) PRD linked to the SD above but with bad fields
WITH s AS (
  SELECT id FROM strategic_directives_v2 WHERE sd_slug = 'ci-gap' LIMIT 1
)
INSERT INTO product_requirements_v2 (id, sd_id, completeness_score, risk_rating, acceptance_criteria_json)
SELECT gen_random_uuid(), s.id, -5, 'unknown', NULL FROM s;

-- 3) Backlog issues (triggers gap_backlog_shape.csv)
--    a) Orphan backlog item (no PRD link)
INSERT INTO eng_backlog (id, prd_id, type, state, priority, qa_gate_min)
VALUES (gen_random_uuid(), NULL, 'feature', 'todo', 'P1', 70);

--    b) Invalid enum + missing qa_floor
WITH p AS (
  SELECT id FROM product_requirements_v2 WHERE sd_id IN (SELECT id FROM strategic_directives_v2 WHERE sd_slug='ci-gap') LIMIT 1
)
INSERT INTO eng_backlog (id, prd_id, type, state, priority, qa_gate_min)
SELECT gen_random_uuid(), p.id, 'feature', 'doing', 'P9', NULL FROM p;

-- Re-enable RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'strategic_directives_v2') THEN
        ALTER TABLE strategic_directives_v2 ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'product_requirements_v2') THEN
        ALTER TABLE product_requirements_v2 ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'eng_backlog') THEN
        ALTER TABLE eng_backlog ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

COMMIT;