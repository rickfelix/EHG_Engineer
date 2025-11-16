-- Fix Timestamp Anomalies
-- Generated: 2025-11-15T14:13:07.037Z

-- Fix future created_at dates
UPDATE strategic_directives_v2
SET created_at = NOW()
WHERE created_at > NOW();

UPDATE product_requirements_v2
SET created_at = NOW()
WHERE created_at > NOW();

-- Fix created_at > updated_at
UPDATE strategic_directives_v2
SET updated_at = created_at
WHERE created_at > updated_at;

UPDATE product_requirements_v2
SET updated_at = created_at
WHERE created_at > updated_at;