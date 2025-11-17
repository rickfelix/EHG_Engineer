-- Add Compliance Rubric Columns to quick_fixes Table
-- Created: 2025-11-17
-- Purpose: Store compliance rubric results (100-point scale self-scoring system)

BEGIN;

-- Add compliance scoring columns
ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS compliance_score INTEGER CHECK (compliance_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS compliance_verdict TEXT CHECK (compliance_verdict IN ('PASS', 'WARN', 'FAIL')),
ADD COLUMN IF NOT EXISTS compliance_details JSONB;

-- Add index for querying by compliance verdict
CREATE INDEX IF NOT EXISTS idx_quick_fixes_compliance_verdict
ON quick_fixes(compliance_verdict)
WHERE compliance_verdict IS NOT NULL;

-- Add index for querying by compliance score
CREATE INDEX IF NOT EXISTS idx_quick_fixes_compliance_score
ON quick_fixes(compliance_score)
WHERE compliance_score IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN quick_fixes.compliance_score IS 'Self-scoring rubric result (0-100 scale). PASS: ≥90, WARN: 70-89, FAIL: <70';
COMMENT ON COLUMN quick_fixes.compliance_verdict IS 'Rubric verdict: PASS (can complete), WARN (user review), FAIL (must refine/escalate)';
COMMENT ON COLUMN quick_fixes.compliance_details IS 'Full rubric results including category scores, criteria results, and evidence';

COMMIT;
