CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

-- Temporarily relax RLS for seed (ephemeral DB only)
-- Tables are in eng schema in CI
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'eng' AND tablename = 'strategic_directives_v2') THEN
        ALTER TABLE eng.strategic_directives_v2 DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'eng' AND tablename = 'product_requirements_v2') THEN
        ALTER TABLE eng.product_requirements_v2 DISABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'eng' AND tablename = 'eng_backlog') THEN
        ALTER TABLE eng.eng_backlog DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 1) SD with missing governance metadata (triggers gap_sd_metadata.csv)
INSERT INTO eng.strategic_directives_v2 (id, title, owner, decision_log_ref, evidence_ref, approved_at, created_at)
VALUES (gen_random_uuid(), 'CI Gap SD', NULL, NULL, NULL, '2099-01-01'::timestamp, '2099-01-01'::timestamp);

-- 2) PRD with structural issues (triggers gap_prd_contract.csv)
--    a) PRD linked to the SD above but with bad fields
WITH s AS (
  SELECT id FROM eng.strategic_directives_v2 WHERE title = 'CI Gap SD' LIMIT 1
)
INSERT INTO eng.product_requirements_v2 (id, sd_id, completeness_score, risk_rating, acceptance_criteria_json)
SELECT gen_random_uuid(), s.id, -5, 'unknown', NULL FROM s;

-- 3) Backlog issues (triggers gap_backlog_shape.csv)
--    a) Orphan backlog item (no PRD link)
INSERT INTO eng.eng_backlog (id, prd_id, type, state, priority, qa_gate_min)
VALUES (gen_random_uuid(), NULL, 'feature', 'todo', 'P1', 70);

--    b) Invalid enum + missing qa_floor
WITH p AS (
  SELECT id FROM eng.product_requirements_v2 WHERE sd_id IN (SELECT id FROM eng.strategic_directives_v2 WHERE title='CI Gap SD') LIMIT 1
)
INSERT INTO eng.eng_backlog (id, prd_id, type, state, priority, qa_gate_min)
SELECT gen_random_uuid(), p.id, 'feature', 'doing', 'P9', NULL FROM p;

-- Re-enable RLS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'eng' AND tablename = 'strategic_directives_v2') THEN
        ALTER TABLE eng.strategic_directives_v2 ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'eng' AND tablename = 'product_requirements_v2') THEN
        ALTER TABLE eng.product_requirements_v2 ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'eng' AND tablename = 'eng_backlog') THEN
        ALTER TABLE eng.eng_backlog ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

COMMIT;