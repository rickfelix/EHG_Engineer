#!/usr/bin/env node
/**
 * FR-2: generate the staged (never applied) chairman-gated REVOKE TRUNCATE ... FROM anon migration
 * from the FR-1 enumeration artifact, as ONE file (corrected at PLAN phase -- see PRD FR-2 for the
 * full reversal rationale: REVOKE takes no lock on target relations, so batching was unnecessary and
 * introduced a partial-completion hazard the single file does not have).
 *
 * SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001, FR-2.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATED_DIR = join(__dirname, '..', '..', 'database', 'chairman-gated');
const ARTIFACT_PATH = join(GATED_DIR, 'anon-truncate-sweep-enumeration.json');
const DATE_STAMP = '20260819';
const UP_PATH = join(GATED_DIR, `${DATE_STAMP}_anon_truncate_sweep.sql`);
const DOWN_PATH = join(GATED_DIR, `${DATE_STAMP}_anon_truncate_sweep_DOWN.sql`);

const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
const relations = artifact.relations;
if (!Array.isArray(relations) || relations.length === 0) {
  throw new Error('EMPTY_ARTIFACT: refusing to generate a migration from an empty or missing enumeration artifact');
}

const arrayLiteral = relations.map((r) => `'${r}'`).join(',\n    ');
const revokeStatements = relations.map((r) => `REVOKE TRUNCATE ON ${r} FROM anon;`).join('\n');
const grantStatements = relations.map((r) => `GRANT TRUNCATE ON ${r} TO anon;`).join('\n');

const upSql = `-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-2)
-- @approved-by: <chairman fills in before apply -- ceremony ref QF-20260803-856>
--
-- WHAT: revokes anon's TRUNCATE grant on ${relations.length} ordinary tables (relkind='r', owned by
-- postgres) where anon currently holds it -- a Supabase default GRANT ALL artifact. RLS cannot gate
-- TRUNCATE at all, so this is the only mechanism that closes it. Live-enumerated
-- ${artifact.generated_at} via pg_catalog aclexplode() (NOT information_schema.role_table_grants,
-- which is role-filtered and returns different results under different connecting identities -- see
-- PRD FR-1 for the full measured rationale). Views (170, TRUNCATE structurally inapplicable) and 3
-- storage.* tables (owned by supabase_storage_admin -- a REVOKE from this session would report
-- success and silently change nothing) are excluded BY MECHANISM (owner check), not by this list
-- happening to omit them.
--
-- THIS IS A SINGLE FILE BY DESIGN (reversed from an earlier <=50-relations-per-file batching plan).
-- "REVOKE takes AccessExclusiveLock" did not reproduce under live pg_locks measurement -- REVOKE only
-- takes RowExclusiveLock on pg_class (catalog-only; RangeVarGetRelid with NoLock). The codebase's own
-- precedent already stages far larger single files (302 statements in
-- 20260317_rls_tighten_phase1.sql; 155 in 20260317_security_definer_audit.sql) with no batching.
--
-- NEVER APPLIED BY THE BUILDER. The chairman applies by hand per the QF-20260803-856 ceremony
-- checklist (path fence -> @approved-by matching git user.email -> git-committed ->
-- MIGRATION_APPLY_TOKEN -> post-conditions). SET LOCAL lock_timeout is kept as house convention
-- (protects against contention on the shared pg_class catalog relation during this transaction, not
-- against a lock on the 760 target relations, which REVOKE does not take).
--
-- Rollback: ${DATE_STAMP}_anon_truncate_sweep_DOWN.sql (grant-precise -- re-grants exactly TRUNCATE,
-- never a broader GRANT ALL).
--
-- Enumeration artifact: anon-truncate-sweep-enumeration.json (committed alongside this file).

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Baseline capture, BEFORE any REVOKE runs. The anon TRUNCATE-holding population is heterogeneous
-- (2 distinct ACL signatures measured at PLAN phase) -- NOT every relation holds the same set of
-- other privileges (EXEC-phase discovery: an early draft of this post-condition assumed a uniform
-- 7-privilege baseline and 9 relations genuinely failed that assumption, a false positive). The
-- correct check is a per-relation BEFORE/AFTER diff of the actual privilege set, not an assumed
-- fixed set -- this temp table is that "before" snapshot.
CREATE TEMP TABLE _sweep_baseline AS
SELECT rel::text AS rel_text, rel,
       (SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
        FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = rel), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = rel)))) a
        JOIN pg_roles r ON r.oid = a.grantee
        WHERE r.rolname = 'anon') AS anon_privs
FROM unnest(ARRAY[
  ${arrayLiteral}
]::regclass[]) AS rel;

${revokeStatements}

-- Post-condition: per-relation diff against _sweep_baseline. Uses regclass array elements (via the
-- baseline table, captured from the same unnest(ARRAY[...]::regclass[]) source) rather than a
-- hardcoded text-name list -- a relation dropped/renamed between staging and apply would have
-- already raised 42P01 at the baseline-capture step above, converting a vacuous pass into a hard
-- failure at the earliest possible point. Asserts (a) TRUNCATE is gone from the current privilege
-- set, and (b) the current set equals baseline MINUS TRUNCATE exactly -- not an assumed fixed set of
-- "should be true" privileges, which a heterogeneous population (2 measured signatures) would falsely
-- fail. Never information_schema.role_table_grants (role-filtered -- see FR-1/FR-2 in the PRD).
DO $$
DECLARE
  b RECORD;
  current_privs text[];
  expected_privs text[];
  bad_truncate_count integer := 0;
  bad_diff_count integer := 0;
  checked_count integer := 0;
BEGIN
  FOR b IN SELECT rel_text, rel, anon_privs FROM _sweep_baseline
  LOOP
    checked_count := checked_count + 1;

    SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
    INTO current_privs
    FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid = b.rel), acldefault('r', (SELECT relowner FROM pg_class WHERE oid = b.rel)))) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE r.rolname = 'anon';

    IF has_table_privilege('anon', b.rel, 'TRUNCATE') OR 'TRUNCATE' = ANY(coalesce(current_privs, ARRAY[]::text[])) THEN
      bad_truncate_count := bad_truncate_count + 1;
      RAISE WARNING 'POST_CONDITION: anon still has TRUNCATE on %', b.rel_text;
    END IF;

    SELECT array_agg(p ORDER BY p) INTO expected_privs
    FROM unnest(coalesce(b.anon_privs, ARRAY[]::text[])) p
    WHERE p != 'TRUNCATE';

    IF coalesce(current_privs, ARRAY[]::text[]) IS DISTINCT FROM coalesce(expected_privs, ARRAY[]::text[]) THEN
      bad_diff_count := bad_diff_count + 1;
      RAISE WARNING 'POST_CONDITION: anon privilege set changed beyond TRUNCATE on % -- before(minus truncate)=%, after=%', b.rel_text, expected_privs, current_privs;
    END IF;
  END LOOP;

  IF checked_count != ${relations.length} THEN
    RAISE EXCEPTION 'POST_CONDITION_COUNT_MISMATCH: expected % relations, checked %', ${relations.length}, checked_count;
  END IF;
  IF bad_truncate_count > 0 THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: % relation(s) still show anon TRUNCATE after REVOKE', bad_truncate_count;
  END IF;
  IF bad_diff_count > 0 THEN
    RAISE EXCEPTION 'POST_CONDITION_FAILED: % relation(s) changed anon privileges beyond TRUNCATE -- REVOKE was over-broad or under-broad', bad_diff_count;
  END IF;

  RAISE NOTICE 'POST_CONDITION_PASSED: % relations verified via per-relation before/after diff -- anon TRUNCATE revoked, every other privilege exactly unchanged', checked_count;
END $$;

DROP TABLE _sweep_baseline;

COMMIT;
`;

const downSql = `-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-2) -- ROLLBACK companion
-- @approved-by: <chairman fills in before apply>
--
-- Re-grants EXACTLY TRUNCATE to anon on the same ${relations.length} relations this SD's UP file
-- revoked it from -- never a broader privilege set. A DOWN that restores more than TRUNCATE would be
-- a privilege escalation on rollback -- see PRD FR-2 AC-10 (UP->DOWN round-trip test, plus a source
-- lint on this file forbidding any statement broader than a single named privilege).

BEGIN;

SET LOCAL lock_timeout = '5s';

${grantStatements}

COMMIT;
`;

writeFileSync(UP_PATH, upSql);
writeFileSync(DOWN_PATH, downSql);
console.log(`Written: ${UP_PATH} (${(upSql.length / 1024).toFixed(1)}KB)`);
console.log(`Written: ${DOWN_PATH} (${(downSql.length / 1024).toFixed(1)}KB)`);
console.log(`Relations covered: ${relations.length}`);
