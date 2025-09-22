-- 202509221325__eng_commit_pr_linkage.sql
-- Adds commit and PR linkage metadata for traceability views.

BEGIN;

ALTER TABLE product_requirements_v2
    ADD COLUMN IF NOT EXISTS commit_sha TEXT,
    ADD COLUMN IF NOT EXISTS pr_url TEXT;

-- Ensure normalized formatting.
UPDATE product_requirements_v2
   SET commit_sha = lower(commit_sha)
 WHERE commit_sha IS NOT NULL;

COMMIT;

/* DOWN */

BEGIN;

ALTER TABLE product_requirements_v2
    DROP COLUMN IF EXISTS pr_url,
    DROP COLUMN IF EXISTS commit_sha;

COMMIT;
