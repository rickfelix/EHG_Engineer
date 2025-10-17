-- 202509221335__vh_trace_columns.sql
-- Adds governance trace columns to venture entities.

BEGIN;

ALTER TABLE vh_ventures
    ADD COLUMN IF NOT EXISTS sd_id UUID,
    ADD COLUMN IF NOT EXISTS prd_id UUID,
    ADD COLUMN IF NOT EXISTS backlog_id UUID,
    ADD COLUMN IF NOT EXISTS gate_status TEXT;

CREATE INDEX IF NOT EXISTS idx_vh_ventures_sd_id ON vh_ventures(sd_id);
CREATE INDEX IF NOT EXISTS idx_vh_ventures_prd_id ON vh_ventures(prd_id);

COMMIT;

/* DOWN */

BEGIN;

DROP INDEX IF EXISTS idx_vh_ventures_prd_id;
DROP INDEX IF EXISTS idx_vh_ventures_sd_id;

ALTER TABLE vh_ventures
    DROP COLUMN IF EXISTS gate_status,
    DROP COLUMN IF EXISTS backlog_id,
    DROP COLUMN IF EXISTS prd_id,
    DROP COLUMN IF EXISTS sd_id;

COMMIT;
