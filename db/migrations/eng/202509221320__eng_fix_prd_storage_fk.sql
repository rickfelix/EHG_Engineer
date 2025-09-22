-- 202509221320__eng_fix_prd_storage_fk.sql
-- Links PRD storage table to canonical PRDs and enforces QA gate minimums.

BEGIN;

ALTER TABLE product_requirements_v3
    ADD COLUMN IF NOT EXISTS prd_id UUID,
    ADD COLUMN IF NOT EXISTS qa_gate_min NUMERIC CHECK (qa_gate_min >= 0 AND qa_gate_min <= 100);

UPDATE product_requirements_v3 pr3
   SET prd_id = pr2.prd_uuid
  FROM strategic_directives_v2 sd
  JOIN product_requirements_v2 pr2
    ON pr2.sd_id = sd.sd_uuid
 WHERE pr3.sd_id = sd.id OR pr3.sd_id = sd.legacy_id OR pr3.sd_id = sd.sd_key;

UPDATE product_requirements_v3
   SET qa_gate_min = COALESCE(qa_gate_min, 0);

ALTER TABLE product_requirements_v3
    ALTER COLUMN qa_gate_min SET DEFAULT 0,
    ALTER COLUMN qa_gate_min SET NOT NULL;

ALTER TABLE product_requirements_v3
    ADD CONSTRAINT product_requirements_v3_prd_id_fkey
        FOREIGN KEY (prd_id) REFERENCES product_requirements_v2(prd_uuid) ON DELETE SET NULL;

COMMIT;

/* DOWN */

BEGIN;

ALTER TABLE product_requirements_v3
    DROP CONSTRAINT IF EXISTS product_requirements_v3_prd_id_fkey;

ALTER TABLE product_requirements_v3
    ALTER COLUMN qa_gate_min DROP NOT NULL,
    ALTER COLUMN qa_gate_min DROP DEFAULT;

ALTER TABLE product_requirements_v3
    DROP COLUMN IF EXISTS qa_gate_min,
    DROP COLUMN IF EXISTS prd_id;

COMMIT;
