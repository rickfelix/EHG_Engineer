-- SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-5, layer 3)
-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- (approval chain: chairman resume-brief pre-authorization "apply Bravo's entity_type widening
--  migration POST-MERGE" 2026-08-09 + coordinator classification on read 2026-08-10 seat 56f09320:
--  pure additive CHECK-widening, no RLS/GRANT, no stored value invalidated)
--
-- WIDEN codebase_semantic_index.entity_type TO ACCEPT THE SQL ENTITIES THE PARSER ALREADY EMITS.
--
-- MEASURED, not inferred. On the first successful run of scripts/semantic-indexer.js (which had
-- never been runnable before this SD — see commit 473697bb8e4), four batches were rejected with:
--   new row for relation "codebase_semantic_index" violates check constraint
--   "codebase_semantic_index_entity_type_check"
--
-- WHICH SIDE IS WRONG: the CONSTRAINT, not the parser. scripts/modules/language-parsers.js exports
-- parseSQL and emits entityType 'table' (:167) and 'view' (:184). The original constraint
-- (database/migrations/20251019_create_codebase_semantic_index.sql:21) allows only
--   'function','class','component','interface','type','utility','module'
-- i.e. a JS/TS-shaped vocabulary. The indexer deliberately scans .sql files, so SQL tables and
-- views are legitimate members of a semantic CODE index — the vocabulary simply never caught up
-- with the parser. Mapping 'table'/'view' onto 'module' in the writer was the alternative and was
-- REJECTED: it would make the stored entity_type a lie, and a column that misreports what it holds
-- is precisely the defect class this SD exists to remove.
--
-- SAFETY: widening a CHECK is additive. Every value currently stored remains valid, so this cannot
-- invalidate an existing row. Verified below rather than asserted.
--
-- APPLY IS NOT MINE. This is chairman-gated DDL; the coordinator sequences it. Until it is applied,
-- SQL entities keep being rejected and the index is silently partial for .sql files — that is a
-- KNOWN, DECLARED gap, not a clean index.

BEGIN;

ALTER TABLE public.codebase_semantic_index
  DROP CONSTRAINT IF EXISTS codebase_semantic_index_entity_type_check;

ALTER TABLE public.codebase_semantic_index
  ADD CONSTRAINT codebase_semantic_index_entity_type_check
  CHECK (entity_type IN (
    'function', 'class', 'component', 'interface', 'type', 'utility', 'module',
    -- SQL entities emitted by parseSQL (language-parsers.js:167, :184)
    'table', 'view'
  ));

COMMIT;

-- VERIFY (run after apply; do NOT treat this file's existence as proof it ran —
-- a migration file is a lead, never proof of a live database object):
--
--   -- 1. the constraint accepts the new values
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'codebase_semantic_index_entity_type_check';
--   -- expect the definition to contain both 'table' and 'view'
--
--   -- 2. nothing was invalidated (must return 0)
--   SELECT count(*) FROM public.codebase_semantic_index
--    WHERE entity_type NOT IN ('function','class','component','interface','type',
--                              'utility','module','table','view');
--
--   -- 3. re-run the indexer and confirm SQL entities now land (must be > 0)
--   SELECT count(*) FROM public.codebase_semantic_index
--    WHERE entity_type IN ('table','view');
