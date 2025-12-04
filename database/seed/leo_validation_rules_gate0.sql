-- LEO Protocol Validation Rules - Gate 0 Seed Data
-- SD-VERIFY-LADDER-001
-- Weights sum to exactly 1.000
-- Rule names map 1:1 to gate check functions

BEGIN;

-- Clear existing Gate 0 rules (idempotent)
DELETE FROM leo_validation_rules WHERE gate = '0';

-- ============================================
-- Gate 0: Static Analysis Verification
-- Total weight: 1.000
-- ============================================

INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active) VALUES
  (
    '0',
    'hasESLintPass',
    0.40,
    '{
      "description": "ESLint validation with zero errors",
      "command": "npx eslint .",
      "timeout_ms": 30000,
      "success_condition": "exit_code_0",
      "error_pattern": "(\\\\d+)\\\\s+error"
    }',
    true,
    true
  ),
  (
    '0',
    'hasTypeScriptPass',
    0.40,
    '{
      "description": "TypeScript compilation with zero type errors",
      "command": "npx tsc --noEmit",
      "timeout_ms": 30000,
      "success_condition": "exit_code_0",
      "error_pattern": "Found (\\\\d+) error"
    }',
    true,
    true
  ),
  (
    '0',
    'hasImportsPass',
    0.20,
    '{
      "description": "All imports resolve successfully (non-blocking)",
      "command": "node tools/gates/lib/check-imports.js",
      "timeout_ms": 10000,
      "success_condition": "exit_code_0",
      "blocking": false
    }',
    false,
    true
  );

-- ============================================
-- Validation: Ensure weights sum to 1.000
-- ============================================

DO $$
DECLARE
  v_total NUMERIC;
BEGIN
  SELECT SUM(weight) INTO v_total
  FROM leo_validation_rules
  WHERE gate = '0' AND active = true;

  IF ABS(v_total - 1.000) > 0.001 THEN
    RAISE EXCEPTION 'Gate 0 weights sum to %, expected 1.000', v_total;
  END IF;

  RAISE NOTICE '✅ Gate 0 weights valid (sum = %)', v_total;
END $$;

-- ============================================
-- Summary
-- ============================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM leo_validation_rules WHERE gate = '0' AND active = true;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'Gate 0 Validation Rules Seed Complete';
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE 'Total active rules: %', v_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Gate 0: Static Analysis (3 rules, weight = 1.000)';
  RAISE NOTICE '  • hasESLintPass: 40%% (required)';
  RAISE NOTICE '  • hasTypeScriptPass: 40%% (required)';
  RAISE NOTICE '  • hasImportsPass: 20%% (non-blocking)';
  RAISE NOTICE '';
  RAISE NOTICE 'Pass threshold: ≥85%%';
  RAISE NOTICE 'Minimum to pass: ESLint + TypeScript (80%%)';
  RAISE NOTICE '                 Note: Falls short of 85%% threshold';
  RAISE NOTICE '                 All 3 checks needed for ≥85%%';
  RAISE NOTICE '════════════════════════════════════════════';
END $$;

COMMIT;
