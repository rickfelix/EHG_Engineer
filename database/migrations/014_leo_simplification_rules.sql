-- Migration: 014_leo_simplification_rules.sql
-- Part of: SD-LEO-001 - /simplify Command for Automated Code Simplification
-- User Story: US-003 - Simplification rules stored in database
--
-- Creates the leo_simplification_rules table for database-driven code simplification rules.
-- Rules can be enabled/disabled without code changes.

-- ============================================================================
-- TABLE: leo_simplification_rules
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_simplification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule identification
  rule_code VARCHAR(50) UNIQUE NOT NULL,
  rule_name VARCHAR(100) NOT NULL,

  -- Rule classification
  rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('logic', 'style', 'cleanup')),
  language VARCHAR(20) DEFAULT 'javascript',

  -- Pattern matching
  pattern TEXT NOT NULL,
  replacement TEXT,

  -- Rule behavior
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,  -- Lower = higher priority
  confidence NUMERIC(3,2) DEFAULT 0.80 CHECK (confidence >= 0 AND confidence <= 1),

  -- Documentation
  description TEXT,
  example_before TEXT,
  example_after TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_simplification_rules_enabled
  ON leo_simplification_rules(enabled, priority);

CREATE INDEX IF NOT EXISTS idx_simplification_rules_type
  ON leo_simplification_rules(rule_type);

CREATE INDEX IF NOT EXISTS idx_simplification_rules_language
  ON leo_simplification_rules(language);

-- Comment for documentation
COMMENT ON TABLE leo_simplification_rules IS
  'Database-driven rules for /simplify command. Rules are regex patterns that match code and provide replacements.';

-- ============================================================================
-- SEED DATA: Default simplification rules
-- Using dollar-quoting to avoid semicolon parsing issues
-- Separate INSERT statements for migration runner compatibility
-- ============================================================================

-- Rule 1: Double Bang to Boolean
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'double-bang-to-boolean',
  'Double Bang to Boolean',
  'cleanup',
  'javascript',
  '!!\s*(\w+)',
  'Boolean($1)',
  10,
  0.95,
  'Convert double negation to explicit Boolean() call for clarity',
  $$const isValid = !!value;$$,
  $$const isValid = Boolean(value);$$
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 2: Strict Equality
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'strict-equality',
  'Strict Equality',
  'cleanup',
  'javascript',
  '(\w+)\s*==\s*(?!null|undefined)(\w+)',
  '$1 === $2',
  20,
  0.90,
  'Use strict equality (===) instead of loose equality (==)',
  'if (x == y)',
  'if (x === y)'
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 3: Strict Inequality
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'strict-inequality',
  'Strict Inequality',
  'cleanup',
  'javascript',
  '(\w+)\s*!=\s*(?!null|undefined)(\w+)',
  '$1 !== $2',
  21,
  0.90,
  'Use strict inequality (!==) instead of loose inequality (!=)',
  'if (x != y)',
  'if (x !== y)'
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 4: Template Literals
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'template-literals',
  'Template Literals',
  'style',
  'javascript',
  $$'([^']*)''\s*\+\s*(\w+)\s*\+\s*''([^']*)''$$,
  '`$1${$2}$3`',
  30,
  0.85,
  'Use template literals for string concatenation',
  $$const msg = 'Hello ' + name + '!';$$,
  $$const msg = `Hello ${name}!`;$$
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 5: Const Over Let
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'const-over-let',
  'Const Over Let',
  'style',
  'javascript',
  $$let\s+(\w+)\s*=\s*([^;]+);(?![\s\S]*\1\s*=)$$,
  $$const $1 = $2;$$,
  40,
  0.75,
  'Use const for variables that are never reassigned',
  $$let count = 0;$$,
  $$const count = 0;$$
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 6: Early Return
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'early-return',
  'Early Return',
  'logic',
  'javascript',
  $$if\s*\(([^)]+)\)\s*\{\s*return\s+([^;]+);\s*\}\s*else\s*\{\s*return\s+([^;]+);\s*\}$$,
  'return $1 ? $2 : $3;',
  50,
  0.70,
  'Simplify if/else return to ternary (when appropriate)',
  $$if (x) { return a; } else { return b; }$$,
  'return x ? a : b;'
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 7: Nullish Coalescing
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'nullish-coalescing',
  'Nullish Coalescing',
  'logic',
  'javascript',
  $$(\w+)\s*(?:===?\s*null\s*\|\|\s*\1\s*===?\s*undefined|\?\s*\1\s*:\s*)$$,
  '$1 ?? ',
  60,
  0.80,
  'Use nullish coalescing (??) for null/undefined checks',
  $$const val = x === null || x === undefined ? default : x;$$,
  'const val = x ?? default;'
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- Rule 8: Optional Chaining
INSERT INTO leo_simplification_rules (rule_code, rule_name, rule_type, language, pattern, replacement, priority, confidence, description, example_before, example_after)
VALUES (
  'optional-chaining',
  'Optional Chaining',
  'logic',
  'javascript',
  $$(\w+)\s*&&\s*\1\.(\w+)$$,
  '$1?.$2',
  61,
  0.85,
  'Use optional chaining (?.) for safe property access',
  $$const name = user && user.name;$$,
  'const name = user?.name;'
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  pattern = EXCLUDED.pattern,
  replacement = EXCLUDED.replacement,
  description = EXCLUDED.description,
  example_before = EXCLUDED.example_before,
  example_after = EXCLUDED.example_after,
  updated_at = NOW();

-- ============================================================================
-- RLS POLICIES (if RLS is enabled on this table)
-- ============================================================================

-- Allow all authenticated users to read rules
-- (Rules are configuration, not user data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leo_simplification_rules'
  ) THEN
    DROP POLICY IF EXISTS "Allow read access to simplification rules" ON leo_simplification_rules;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- Enable RLS but allow public read (rules are not sensitive)
ALTER TABLE leo_simplification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to simplification rules"
  ON leo_simplification_rules
  FOR SELECT
  USING (true);

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  rule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rule_count FROM leo_simplification_rules WHERE enabled = true;
  RAISE NOTICE 'Migration complete: % enabled simplification rules', rule_count;
END $$;
