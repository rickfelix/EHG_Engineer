-- Constitutional Amendments: CONST-010 and CONST-011
-- SD: SD-LEO-INFRA-CONST-AMEND-001
-- Date: 2026-01-23
-- Purpose: Add two new constitutional rules based on Anthropic's Claude Constitution principles

-- CONST-010: Non-Manipulation Principle
-- Prevents AI-generated improvement proposals from using manipulative framing
INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES (
  'CONST-010',
  'AI-generated improvement proposals must not use manipulative framing, urgent language, certainty claims, or emotional appeals to influence human reviewers. Descriptions must present factual evidence and reasoning only.',
  'safety',
  'Implements Anthropic Claude Constitution principle of non-manipulative persuasion. Ensures AI recommendations are factual and neutral, preserving human agency in decision-making. Advisory severity (MEDIUM) - flags for review but does not block proposals.'
)
ON CONFLICT (rule_code) DO NOTHING;

-- CONST-011: Value Priority Hierarchy
-- Establishes explicit priority ordering when constitutional rules conflict
INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES (
  'CONST-011',
  'When constitutional rules conflict, prioritize in this order: (1) Human Safety [CONST-001, CONST-002, CONST-009], (2) System Integrity [CONST-004, CONST-007], (3) Audit Compliance [CONST-003, CONST-008], (4) Operational Efficiency [CONST-005, CONST-006, CONST-010]. Higher priorities override lower priorities.',
  'governance',
  'Provides explicit value hierarchy for conflict resolution based on Anthropic Claude Constitution value ordering (Safe > Ethical > Compliant > Helpful). Advisory guidance - helps human reviewers make decisions when multiple rules apply.'
)
ON CONFLICT (rule_code) DO NOTHING;

-- Verify the insertions
DO $$
DECLARE
  rule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO rule_count
  FROM protocol_constitution
  WHERE rule_code IN ('CONST-010', 'CONST-011');

  IF rule_count < 2 THEN
    RAISE WARNING 'Expected 2 new rules but found %. Some rules may already exist.', rule_count;
  ELSE
    RAISE NOTICE 'Successfully added CONST-010 and CONST-011. Total constitution rules: %',
      (SELECT COUNT(*) FROM protocol_constitution);
  END IF;
END $$;
