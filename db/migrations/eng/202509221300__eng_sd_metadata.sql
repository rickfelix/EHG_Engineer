-- 202509221300__eng_sd_metadata.sql
-- Adds governance metadata, slug-based keys, and deterministic UUIDs to strategic directives.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE strategic_directives_v2
    ADD COLUMN IF NOT EXISTS owner TEXT,
    ADD COLUMN IF NOT EXISTS decision_log_ref TEXT,
    ADD COLUMN IF NOT EXISTS evidence_ref TEXT,
    ADD COLUMN IF NOT EXISTS sd_slug TEXT;

-- Generated identifiers derived from slug and approval/create date.
ALTER TABLE strategic_directives_v2
    ADD COLUMN IF NOT EXISTS sd_key TEXT GENERATED ALWAYS AS (
        'SD-' || to_char(COALESCE(approved_at, created_at)::date, 'YYYY-MM-DD') || '-' ||
        regexp_replace(lower(COALESCE(sd_slug, title, 'directive')),'[^a-z0-9]+','-','g')
    ) STORED,
    ADD COLUMN IF NOT EXISTS sd_uuid UUID GENERATED ALWAYS AS (
        uuid_generate_v5('00000000-0000-0000-0000-000000000001'::uuid, sd_key)
    ) STORED,
    ADD CONSTRAINT eng_sd_v2_sd_key_format_chk CHECK (
        sd_key ~ '^SD-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$'
    );

-- Ensure uniqueness for generated identifiers.
ALTER TABLE strategic_directives_v2
    ADD CONSTRAINT eng_sd_v2_sd_key_unique UNIQUE (sd_key);
ALTER TABLE strategic_directives_v2
    ADD CONSTRAINT eng_sd_v2_sd_uuid_unique UNIQUE (sd_uuid);

-- Backfill owner/slug metadata deterministically.
UPDATE strategic_directives_v2
   SET owner = COALESCE(owner, created_by, 'unassigned');

UPDATE strategic_directives_v2
   SET decision_log_ref = COALESCE(decision_log_ref, metadata->>'decision_log_ref');

UPDATE strategic_directives_v2
   SET evidence_ref = COALESCE(evidence_ref, metadata->>'evidence_ref');

UPDATE strategic_directives_v2
   SET sd_slug = regexp_replace(lower(COALESCE(metadata->>'slug', title, id, 'directive')),'[^a-z0-9]+','-','g');

-- Finalize NOT NULL requirement for owner.
ALTER TABLE strategic_directives_v2
    ALTER COLUMN owner SET NOT NULL;

COMMIT;

/* DOWN */

BEGIN;

ALTER TABLE strategic_directives_v2
    ALTER COLUMN owner DROP NOT NULL;

ALTER TABLE strategic_directives_v2
    DROP CONSTRAINT IF EXISTS eng_sd_v2_sd_uuid_unique;
ALTER TABLE strategic_directives_v2
    DROP CONSTRAINT IF EXISTS eng_sd_v2_sd_key_unique;
ALTER TABLE strategic_directives_v2
    DROP CONSTRAINT IF EXISTS eng_sd_v2_sd_key_format_chk;

ALTER TABLE strategic_directives_v2
    DROP COLUMN IF EXISTS sd_uuid,
    DROP COLUMN IF EXISTS sd_key,
    DROP COLUMN IF EXISTS sd_slug,
    DROP COLUMN IF EXISTS evidence_ref,
    DROP COLUMN IF EXISTS decision_log_ref,
    DROP COLUMN IF EXISTS owner;

COMMIT;
