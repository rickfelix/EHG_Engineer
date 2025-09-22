\echo '== Applying EHG_Engineering migrations =='
\set ON_ERROR_STOP on
BEGIN;
\i db/migrations/eng/202509221300__eng_sd_metadata.sql
\i db/migrations/eng/202509221305__eng_prd_contract.sql
\i db/migrations/eng/202509221310__eng_backlog_contract.sql
\i db/migrations/eng/202509221315__eng_archive_legacy.sql
\i db/migrations/eng/202509221320__eng_fix_prd_storage_fk.sql
\i db/migrations/eng/202509221325__eng_commit_pr_linkage.sql
COMMIT;

\echo '== Applying EHG Venture migrations =='
BEGIN;
\i db/migrations/vh/202509221330__vh_namespace_core.sql
\i db/migrations/vh/202509221335__vh_trace_columns.sql
\i db/migrations/vh/202509221340__vh_ingest_governance_views.sql
COMMIT;

\echo '== Migration batches complete =='
