-- SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — MODE 1 rollback for
-- 20260825_ventures_canonical_writer_choke.sql.
--
-- SCOPE: the DB guard objects ONLY (3 triggers + 3 functions, incl. the INSERT-time reset added to
-- close the insert-then-coast bypass). Deliberately RETAINS ventures.stage_write_token and every
-- RPC/JS self-stamp — every stamping writer keeps working with no code revert; it just writes an
-- ordinary, now-unvalidated column.
--
-- ⚠️ Re-applying the UP file after this DOWN is NOT a plain re-run: stamps accumulate at rest for
-- the whole rollback window (zzz_, the only thing that NULLs at rest, is gone here). The UP file's
-- own $reset_at_rest$ block clears them and hard-fails if any survive — it is a genuine no-op only on
-- a first apply.
--
-- POST-ROLLBACK VERIFICATION: run one real registered writer's UPDATE against the reverted schema
-- and confirm it succeeds with the guard gone.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_ventures_canonical_writer_choke_DOWN.sql" \
--     --prod-deploy --allow-any-path

DROP TRIGGER IF EXISTS aaa_enforce_canonical_stage_write ON public.ventures;
DROP TRIGGER IF EXISTS zzz_enforce_canonical_stage_write_final ON public.ventures;
DROP TRIGGER IF EXISTS aaa_reset_canonical_stage_write_token_insert ON public.ventures;
DROP FUNCTION IF EXISTS public.enforce_canonical_stage_write();
DROP FUNCTION IF EXISTS public.reset_stage_write_token_on_insert();
DROP FUNCTION IF EXISTS public.ventures_canonical_writer_policy(text);
