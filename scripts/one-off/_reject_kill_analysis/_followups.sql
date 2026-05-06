-- Read-only follow-up: trigger function bodies + venture_status_enum + role-check helpers
SELECT n.nspname AS schema, p.proname, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'prevent_tier0_stage_progression',
  'create_postmortem_on_venture_failure',
  'sync_ventures_to_eva_ventures_update',
  'sync_ventures_to_eva_ventures_insert',
  'fn_is_chairman',
  'fn_validate_stage_column',
  'fn_sync_stage_work_on_advance',
  'auto_populate_venture_company_id',
  'trg_enforce_stage0_origin'
)
ORDER BY p.proname;
