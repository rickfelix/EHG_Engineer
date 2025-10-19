-- 202509221305__eng_prd_contract.sql
-- Aligns PRD contract to governance schema with UUID linkage and compliance fields.

BEGIN;

-- Remove legacy foreign key/index prior to column refactor.
ALTER TABLE product_requirements_v2
    DROP CONSTRAINT IF EXISTS product_requirements_v2_directive_id_fkey;
DROP INDEX IF EXISTS idx_prd_directive;

-- Preserve legacy ID for reference while introducing canonical UUID linkage.
ALTER TABLE product_requirements_v2
    RENAME COLUMN directive_id TO sd_legacy_id;

ALTER TABLE product_requirements_v2
    ADD COLUMN IF NOT EXISTS sd_id UUID,
    ADD COLUMN IF NOT EXISTS completeness_score NUMERIC,
    ADD COLUMN IF NOT EXISTS risk_rating TEXT,
    ADD COLUMN IF NOT EXISTS acceptance_criteria_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS prd_uuid UUID GENERATED ALWAYS AS (
        uuid_generate_v5('00000000-0000-0000-0000-000000000002'::uuid,
            COALESCE(sd_id::text,'') || ':' || COALESCE(id,'') || ':' || COALESCE(version,''))
    ) STORED;

-- Populate UUID linkage using existing legacy identifiers.
UPDATE product_requirements_v2 prd
   SET sd_id = sd.sd_uuid
  FROM strategic_directives_v2 sd
 WHERE (prd.sd_legacy_id IS NOT NULL)
   AND (prd.sd_legacy_id = sd.id
        OR prd.sd_legacy_id = sd.legacy_id
        OR prd.sd_legacy_id = sd.sd_key);

-- Guarantee defaults for new contract columns.
UPDATE product_requirements_v2
   SET completeness_score = COALESCE(completeness_score, 0);

UPDATE product_requirements_v2
   SET risk_rating = COALESCE(risk_rating, 'medium');

UPDATE product_requirements_v2
   SET acceptance_criteria_json = COALESCE(acceptance_criteria::jsonb, acceptance_criteria_json);

-- Apply constraints and non-null requirements.
ALTER TABLE product_requirements_v2
    ALTER COLUMN sd_id SET NOT NULL,
    ALTER COLUMN completeness_score SET DEFAULT 0,
    ALTER COLUMN completeness_score SET NOT NULL,
    ALTER COLUMN risk_rating SET DEFAULT 'medium',
    ALTER COLUMN risk_rating SET NOT NULL;

ALTER TABLE product_requirements_v2
    ADD CONSTRAINT eng_prd_completeness_chk CHECK (completeness_score >= 0 AND completeness_score <= 100);
ALTER TABLE product_requirements_v2
    ADD CONSTRAINT eng_prd_risk_rating_chk CHECK (risk_rating IN ('low','medium','high'));
ALTER TABLE product_requirements_v2
    ADD CONSTRAINT eng_prd_uuid_unique UNIQUE (prd_uuid);

-- Recreate index and FK against canonical UUIDs.
CREATE INDEX idx_prd_sd_id ON product_requirements_v2(sd_id);

ALTER TABLE product_requirements_v2
    ADD CONSTRAINT product_requirements_v2_sd_id_fkey
        FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(sd_uuid) ON DELETE CASCADE;

COMMIT;

/* DOWN */

BEGIN;

ALTER TABLE product_requirements_v2
    DROP CONSTRAINT IF EXISTS product_requirements_v2_sd_id_fkey;
DROP INDEX IF EXISTS idx_prd_sd_id;

ALTER TABLE product_requirements_v2
    DROP CONSTRAINT IF EXISTS eng_prd_uuid_unique;
ALTER TABLE product_requirements_v2
    DROP CONSTRAINT IF EXISTS eng_prd_risk_rating_chk;
ALTER TABLE product_requirements_v2
    DROP CONSTRAINT IF EXISTS eng_prd_completeness_chk;

ALTER TABLE product_requirements_v2
    ALTER COLUMN risk_rating DROP NOT NULL,
    ALTER COLUMN risk_rating DROP DEFAULT,
    ALTER COLUMN completeness_score DROP NOT NULL,
    ALTER COLUMN completeness_score DROP DEFAULT,
    ALTER COLUMN sd_id DROP NOT NULL;

ALTER TABLE product_requirements_v2
    DROP COLUMN IF EXISTS prd_uuid,
    DROP COLUMN IF EXISTS acceptance_criteria_json,
    DROP COLUMN IF EXISTS risk_rating,
    DROP COLUMN IF EXISTS completeness_score,
    DROP COLUMN IF EXISTS sd_id;

ALTER TABLE product_requirements_v2
    RENAME COLUMN sd_legacy_id TO directive_id;

-- Restore legacy index and foreign key.
CREATE INDEX idx_prd_directive ON product_requirements_v2(directive_id);

ALTER TABLE product_requirements_v2
    ADD CONSTRAINT product_requirements_v2_directive_id_fkey
        FOREIGN KEY (directive_id) REFERENCES strategic_directives_v2(id) ON DELETE CASCADE;

COMMIT;
