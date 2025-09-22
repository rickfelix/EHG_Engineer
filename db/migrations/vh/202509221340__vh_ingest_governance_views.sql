-- 202509221340__vh_ingest_governance_views.sql
-- Establishes read-only bridge views so the venture app consumes governance exports.

BEGIN;

CREATE SCHEMA IF NOT EXISTS vh_ingest;

CREATE OR REPLACE VIEW vh_ingest.eng_prd_payload_v1 AS
    SELECT * FROM v_eng_prd_payload_v1;

CREATE OR REPLACE VIEW vh_ingest.eng_trace AS
    SELECT * FROM v_eng_trace;

COMMIT;

/* DOWN */

BEGIN;

DROP VIEW IF EXISTS vh_ingest.eng_trace;
DROP VIEW IF EXISTS vh_ingest.eng_prd_payload_v1;
DROP SCHEMA IF EXISTS vh_ingest;

COMMIT;
