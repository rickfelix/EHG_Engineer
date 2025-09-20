-- LEO Protocol Validation Rules Seed Data
-- Weights sum to exactly 1.000 per gate
-- Rule names map 1:1 to gate check functions

BEGIN;

-- Clear existing rules (idempotent)
DELETE FROM leo_validation_rules WHERE gate IN ('2A', '2B', '2C', '2D', '3');

-- ============================================
-- Gate 2A: Architecture / Interfaces / Tech Design
-- Total weight: 1.000
-- ============================================

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active) VALUES
  ('2A', 'hasADR',         0.35, '{"min": 1, "description": "At least one Architecture Decision Record must exist"}', true, true),
  ('2A', 'hasInterfaces',  0.35, '{"kinds": ["openapi", "typescript"], "lint": "openapi", "description": "API contracts must be defined and valid"}', true, true),
  ('2A', 'hasTechDesign',  0.30, '{"artifact_type": "tech_design", "description": "Technical design document must exist"}', true, true);

-- ============================================
-- Gate 2B: Design & DB Interfaces  
-- Total weight: 1.000
-- ============================================

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active) VALUES
  ('2B', 'designArtifacts',  0.50, '{"a11y": "WCAG2.1-AA", "wireframes": true, "description": "Design must include wireframes and meet WCAG2.1-AA"}', true, true),
  ('2B', 'dbSchemaReady',    0.50, '{"migrations": true, "snapshots": true, "description": "Database schema with migrations and snapshots"}', true, true);

-- ============================================
-- Gate 2C: Security & Risk
-- Total weight: 1.000
-- ============================================

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active) VALUES
  ('2C', 'securityScanClean',  0.60, '{"owasp": "clean", "csp": "configured", "description": "Security scans must pass with CSP configured"}', true, true),
  ('2C', 'riskSpikesClosed',   0.40, '{"min_closed": 1, "description": "At least one risk spike must be completed"}', true, true);

-- ============================================
-- Gate 2D: NFR & Test Plan
-- Total weight: 1.000
-- ============================================

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active) VALUES
  ('2D', 'nfrBudgetsPresent',  0.30, '{"perf_p95_ms": {"max": 3000}, "bundle_kb": {"max": 500}, "description": "Performance and bundle size budgets must be defined"}', true, true),
  ('2D', 'coverageTargetSet',  0.30, '{"coverage_pct": {"min": 80}, "description": "Test coverage target must be at least 80%"}', true, true),
  ('2D', 'testPlanMatrices',   0.40, '{"matrices": ["unit", "integration", "e2e", "a11y", "perf"], "description": "All test types must be covered"}', true, true);

-- ============================================
-- Gate 3: Supervisor Final Verification
-- Total weight: 1.000
-- ============================================

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active) VALUES
  ('3', 'supervisorChecklistPass', 1.00, '{"dor_pass": true, "subagents_pass": true, "gates_2a_2d_pass": true, "description": "All gates and sub-agents must pass"}', true, true);

-- ============================================
-- Validation: Ensure weights sum to 1.000
-- ============================================

DO $$
DECLARE
  v_gate TEXT;
  v_total NUMERIC;
BEGIN
  FOR v_gate IN SELECT DISTINCT gate FROM leo_validation_rules WHERE active = true
  LOOP
    SELECT SUM(weight) INTO v_total
    FROM leo_validation_rules
    WHERE gate = v_gate AND active = true;
    
    IF ABS(v_total - 1.000) > 0.001 THEN
      RAISE EXCEPTION 'Gate % weights sum to %, expected 1.000', v_gate, v_total;
    END IF;
    
    RAISE NOTICE '✅ Gate % weights valid (sum = %)', v_gate, v_total;
  END LOOP;
END $$;

-- ============================================
-- Summary
-- ============================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM leo_validation_rules WHERE active = true;
  
  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'LEO Validation Rules Seed Complete';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'Total active rules: %', v_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Gate 2A: Architecture (3 rules, weight = 1.000)';
  RAISE NOTICE 'Gate 2B: Design (2 rules, weight = 1.000)';
  RAISE NOTICE 'Gate 2C: Security (2 rules, weight = 1.000)';
  RAISE NOTICE 'Gate 2D: NFR/Testing (3 rules, weight = 1.000)';
  RAISE NOTICE 'Gate 3: Final Verification (1 rule, weight = 1.000)';
  RAISE NOTICE '════════════════════════════════════════════';
END $$;

COMMIT;