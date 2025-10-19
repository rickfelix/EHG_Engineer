-- 202509221315__eng_archive_legacy.sql
-- Archives legacy strategic_directives table while preserving history.

BEGIN;

-- Drop trigger prior to archival rename.
DROP TRIGGER IF EXISTS update_strategic_directives_updated_at ON strategic_directives;
DROP FUNCTION IF EXISTS update_sd_updated_at();

ALTER TABLE IF EXISTS strategic_directives
    RENAME TO strategic_directives_legacy;

COMMENT ON TABLE strategic_directives_legacy IS 'Legacy Directive Lab storage (archived 2025-09-22)';

COMMIT;

/* DOWN */

BEGIN;

COMMENT ON TABLE strategic_directives_legacy IS NULL;

ALTER TABLE IF EXISTS strategic_directives_legacy
    RENAME TO strategic_directives;

-- Re-create trigger function if needed.
CREATE OR REPLACE FUNCTION update_sd_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_strategic_directives_updated_at
    BEFORE UPDATE ON strategic_directives
    FOR EACH ROW
    EXECUTE FUNCTION update_sd_updated_at();

COMMIT;
