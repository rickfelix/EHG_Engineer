-- Rollback for 20260824_leo_protocol_sections_history.sql
-- SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001 (FR-1)
--
-- Drops the three history triggers on leo_protocol_sections FIRST, then the append-only guards
-- on the history table (necessary before the table itself can be dropped -- the no-delete/
-- no-truncate triggers would otherwise reject the cleanup below), then the table and functions.
--
-- Safe at any time after apply: this migration never blocked a write, so rolling it back removes
-- only observability, never data written through the normal application paths.

BEGIN;

DROP TRIGGER IF EXISTS trg_leo_protocol_sections_history_insert ON public.leo_protocol_sections;
DROP TRIGGER IF EXISTS trg_leo_protocol_sections_history_update ON public.leo_protocol_sections;
DROP TRIGGER IF EXISTS trg_leo_protocol_sections_history_delete ON public.leo_protocol_sections;
DROP FUNCTION IF EXISTS public.log_leo_protocol_sections_history();

DROP TRIGGER IF EXISTS leo_protocol_sections_history_no_update_trg ON public.leo_protocol_sections_history;
DROP TRIGGER IF EXISTS leo_protocol_sections_history_no_delete_trg ON public.leo_protocol_sections_history;
DROP TRIGGER IF EXISTS leo_protocol_sections_history_no_truncate_trg ON public.leo_protocol_sections_history;
DROP FUNCTION IF EXISTS public.leo_protocol_sections_history_no_update();
DROP FUNCTION IF EXISTS public.leo_protocol_sections_history_no_delete();
DROP FUNCTION IF EXISTS public.leo_protocol_sections_history_no_truncate();

DROP TABLE IF EXISTS public.leo_protocol_sections_history;

COMMIT;

-- APPLY (chairman ceremony, same token/path convention as the UP migration):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260824_leo_protocol_sections_history_DOWN.sql" \
--     --prod-deploy --allow-any-path
