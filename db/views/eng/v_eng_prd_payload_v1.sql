CREATE OR REPLACE VIEW v_eng_prd_payload_v1 AS
SELECT
    prd.prd_uuid                 AS prd_id,
    prd.sd_id                    AS sd_id,
    prd.priority,
    prd.acceptance_criteria_json
FROM product_requirements_v2 prd;
