/**
 * SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001 — fail-closed allow-list tier classifier.
 *
 * The SECURITY suite: a false TIER-1 on a destructive migration would auto-apply it
 * past the chairman gate. This runs the FULL adversarial corpus (19 smuggle attempts
 * that MUST be TIER-2 + the provably-additive cases that MUST be TIER-1) against the
 * REAL classifyMigration (which uses the real splitPostgreSQLStatements + stripNonDdl —
 * so every case is an integration assertion, not a string-shape mock).
 */
import { describe, it, expect } from 'vitest';
import { classifyMigration } from '../../scripts/lib/migration-tier-classifier.mjs';

// ── Adversarial corpus: every one of these MUST classify TIER-2 (never auto-applied) ──
const TIER2_CORPUS = [
  ['DO-block hides a dynamic DROP', 'CREATE TABLE IF NOT EXISTS audit_log (id bigserial primary key);\nDO $$ BEGIN EXECUTE \'DROP TABLE users\'; END $$;'],
  ['DROP COLUMN after an additive create', 'CREATE TABLE IF NOT EXISTS staging (id int);\nALTER TABLE customers DROP COLUMN ssn;'],
  ['NOT NULL + volatile default now()', 'ALTER TABLE orders ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();'],
  ['nullable but volatile default gen_random_uuid()', 'ALTER TABLE orders ADD COLUMN uid uuid DEFAULT gen_random_uuid();'],
  ['subquery default', 'ALTER TABLE invoices ADD COLUMN rate numeric DEFAULT (SELECT rate FROM config LIMIT 1);'],
  ['function body mutates (DELETE FROM)', 'CREATE FUNCTION purge_stale() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM sessions WHERE ts < now(); END $$;'],
  ['named-tag function body hides DROP', 'CREATE FUNCTION reset() RETURNS void LANGUAGE plpgsql AS $reset$ BEGIN DROP TABLE temp_data; END $reset$;'],
  ['line-comment then a real ; DROP', 'CREATE TABLE IF NOT EXISTS t (id int); -- harmless\n; DROP TABLE t;'],
  ['block-comment-spanning ; then DROP', 'CREATE TABLE IF NOT EXISTS t (id int); /* note ; */ DROP TABLE t;'],
  ['CREATE OR REPLACE silent redefinition', 'CREATE OR REPLACE FUNCTION is_admin(uid uuid) RETURNS bool LANGUAGE sql AS $$ SELECT true $$;'],
  ['GRANT ALL privilege escalation', 'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;'],
  ['RENAME column', 'ALTER TABLE accounts RENAME COLUMN balance TO bal;'],
  ['ALTER COLUMN TYPE rewrite', 'ALTER TABLE metrics ALTER COLUMN value TYPE bigint;'],
  ['multi-action ALTER, one DROP', 'ALTER TABLE t ADD COLUMN note text, DROP COLUMN legacy;'],
  ['TRUNCATE obfuscated by case/whitespace', '   tRuNcAtE   TABLE   event_log   ;'],
  ['CREATE TRIGGER side-effect', 'CREATE TRIGGER trg_audit AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION log_insert();'],
  ['bare CREATE TABLE (no IF NOT EXISTS)', 'CREATE TABLE users (id uuid primary key);'],
  ['DISABLE ROW LEVEL SECURITY regression', 'ALTER TABLE secrets DISABLE ROW LEVEL SECURITY;'],
  ['under-split blob (two CREATEs, no semicolon)', 'CREATE TABLE IF NOT EXISTS a (id int) CREATE TABLE IF NOT EXISTS b (id int)'],
  // extra fail-closed cases beyond the corpus
  ['SECURITY DEFINER function', 'CREATE FUNCTION esc() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;'],
  ['unbalanced named dollar tag', 'CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN PERFORM 1; END;'],
  ['empty / comment-only', '-- just a comment\n'],
  ['non-string input', 12345],
  ['REFRESH MATERIALIZED VIEW (unrecognized)', 'REFRESH MATERIALIZED VIEW mv_stats;'],
  // ── Adversarial-review breaks (wf_db7f5a79-892): apply-time-executing CREATE forms,
  //    expression indexes, serial pseudo-types, and the SECURITY DEFINER comment-split.
  //    Each of these classified TIER-1 before the fix — they MUST be TIER-2. ──
  ['matview executes setval at apply (WITH DATA)', "CREATE MATERIALIZED VIEW mv AS SELECT setval('seq', 999999);"],
  ['matview kills sessions at apply', 'CREATE MATERIALIZED VIEW mv AS SELECT pg_terminate_backend(pid) FROM pg_stat_activity;'],
  ['matview pg_sleep apply-time DoS', 'CREATE MATERIALIZED VIEW mv AS SELECT pg_sleep(86400);'],
  ['matview invokes arbitrary fn at apply', 'CREATE MATERIALIZED VIEW mv AS SELECT nuke_tables();'],
  ['matview IF NOT EXISTS invokes drop_all', 'CREATE MATERIALIZED VIEW IF NOT EXISTS mv AS SELECT drop_all();'],
  ['matview even WITH NO DATA is TIER-2 (blanket)', 'CREATE MATERIALIZED VIEW mv AS SELECT id FROM users WITH NO DATA;'],
  ['plain VIEW with side-effecting fn body', 'CREATE VIEW v AS SELECT pg_terminate_backend(pid) FROM pg_stat_activity;'],
  ['CTAS exfiltrates auth.users at apply', 'CREATE TABLE IF NOT EXISTS leak AS SELECT * FROM auth.users;'],
  ['CTAS kills sessions at apply', 'CREATE TABLE IF NOT EXISTS kill AS SELECT pg_terminate_backend(pid) FROM pg_stat_activity;'],
  ['CTAS resets a sequence at apply', "CREATE TABLE IF NOT EXISTS seqdump AS SELECT setval('users_id_seq', 1, false);"],
  ['CTAS with column-alias list then AS SELECT', 'CREATE TABLE IF NOT EXISTS t (id int) AS SELECT 1;'],
  ['PARTITION OF couples to existing parent', 'CREATE TABLE IF NOT EXISTS p1 PARTITION OF master FOR VALUES FROM (1) TO (100);'],
  ['INHERITS couples to existing parent', 'CREATE TABLE IF NOT EXISTS c INHERITS (parent);'],
  ['LIKE copies from a template table', 'CREATE TABLE IF NOT EXISTS c (LIKE src INCLUDING ALL);'],
  ['expression index runs nextval per row', "CREATE INDEX idx ON big_table (nextval('seq'));"],
  ['partial-index WHERE runs advisory lock per row', 'CREATE INDEX idx ON foo (id) WHERE pg_advisory_lock(id) IS NOT NULL;'],
  ['unique partial-index WHERE calls a fn', 'CREATE UNIQUE INDEX idx ON public.users (id) WHERE public.side_effect();'],
  ['INCLUDE clause with a fn call', "CREATE INDEX idx ON t (a) INCLUDE (nextval('s'));"],
  ['USING method with a fn expression', 'CREATE INDEX idx ON t USING gin (side_effect(a));'],
  ['CONCURRENTLY expression index', 'CREATE INDEX CONCURRENTLY idx ON t (evil(a));'],
  ['immutable-fn expression index (conservative TIER-2)', 'CREATE INDEX idx_lower ON users (lower(email));'],
  ['serial pseudo-type ADD COLUMN', 'ALTER TABLE foo ADD COLUMN id serial;'],
  ['bigserial pseudo-type ADD COLUMN', 'ALTER TABLE foo ADD COLUMN id bigserial;'],
  ['smallserial pseudo-type ADD COLUMN', 'ALTER TABLE foo ADD COLUMN id smallserial;'],
  ['serial8 alias ADD COLUMN', 'ALTER TABLE foo ADD COLUMN id serial8;'],
  ['SECURITY DEFINER block-comment split (FC-15)', 'CREATE FUNCTION esc() RETURNS void LANGUAGE sql SECURITY/*c*/DEFINER AS $b$ SELECT 1 $b$;'],
  ['SECURITY DEFINER line-comment split (FC-15)', 'CREATE FUNCTION esc() RETURNS void LANGUAGE sql SECURITY --c\nDEFINER AS $b$ SELECT 1 $b$;'],
  ['EXTERNAL SECURITY DEFINER comment split (FC-15)', 'CREATE FUNCTION esc() RETURNS void LANGUAGE sql EXTERNAL SECURITY/*c*/DEFINER AS $b$ SELECT 1 $b$;'],
  ['weaponized SECURITY DEFINER auth.users exfil', 'CREATE FUNCTION all_secrets() RETURNS SETOF auth.users LANGUAGE sql SECURITY/*x*/DEFINER AS $b$ SELECT * FROM auth.users $b$;'],
  ['camouflage: additive ADD COLUMN + CTAS-kill', 'ALTER TABLE foo ADD COLUMN note text;\nCREATE TABLE IF NOT EXISTS k AS SELECT pg_terminate_backend(pid) FROM pg_stat_activity;'],
];

// ── Provably-additive: every one of these MUST classify TIER-1 (auto-apply eligible) ──
const TIER1_CORPUS = [
  ['idempotent CREATE TABLE with in-table volatile default', 'CREATE TABLE IF NOT EXISTS feature_flags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, enabled boolean DEFAULT false);'],
  ['CREATE INDEX CONCURRENTLY IF NOT EXISTS', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created ON orders (created_at);'],
  ['nullable ADD COLUMN with constant default', 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname text DEFAULT \'anon\';'],
  ['ENABLE RLS + CREATE POLICY', 'ALTER TABLE notes ENABLE ROW LEVEL SECURITY;\nCREATE POLICY notes_owner ON notes FOR SELECT TO authenticated USING (user_id = auth.uid());'],
  ['read-only CREATE VIEW', 'CREATE VIEW active_users AS SELECT id, email FROM users WHERE deleted_at IS NULL;'],
  ['two nullable ADD COLUMNs in one ALTER', 'ALTER TABLE p ADD COLUMN a text, ADD COLUMN b int DEFAULT 0;'],
  // ── Non-regression guards: the adversarial-review fix must NOT over-reject these
  //    genuinely-additive forms (proves the fix is precise, not a blanket ban). ──
  ['bare CREATE FUNCTION (definition stored, not executed at apply)', 'CREATE FUNCTION add_two(a int, b int) RETURNS int LANGUAGE sql AS $$ SELECT a + b $$;'],
  ['CREATE TABLE IF NOT EXISTS with in-table volatile DEFAULT (fires on INSERT, not apply)', 'CREATE TABLE IF NOT EXISTS evt (id uuid DEFAULT gen_random_uuid(), at timestamptz DEFAULT now());'],
];

describe('classifyMigration — TIER-2 (must never auto-apply)', () => {
  for (const [name, sql] of TIER2_CORPUS) {
    it(`TIER-2: ${name}`, () => {
      const r = classifyMigration(sql);
      expect(r.tier, `expected TIER-2 (reason=${r.reason})`).toBe(2);
    });
  }
});

describe('classifyMigration — TIER-1 (provably additive)', () => {
  for (const [name, sql] of TIER1_CORPUS) {
    it(`TIER-1: ${name}`, () => {
      const r = classifyMigration(sql);
      expect(r.tier, `expected TIER-1 (reason=${r.reason})`).toBe(1);
      expect(Array.isArray(r.matched) && r.matched.length).toBeTruthy();
    });
  }
});

describe('classifyMigration — invariants', () => {
  it('NEVER throws and ALWAYS returns a {tier, reason, matched} shape', () => {
    for (const bad of [null, undefined, 0, {}, [], 'CREATE', '$$', 'DO $$', 'x'.repeat(300000)]) {
      const r = classifyMigration(bad);
      expect(r).toHaveProperty('tier');
      expect([1, 2]).toContain(r.tier);
      expect(typeof r.reason).toBe('string');
      expect(Array.isArray(r.matched)).toBe(true);
    }
  });

  it('default-DENY: anything not provably additive is TIER-2 (the activation invariant)', () => {
    // A representative destructive migration must NOT classify TIER-1 by default.
    expect(classifyMigration('DROP TABLE users;').tier).toBe(2);
    expect(classifyMigration('ALTER TABLE t ALTER COLUMN c TYPE bigint;').tier).toBe(2);
    // And the canonical safe case IS TIER-1 (the system is live, not stuck-all-TIER-2).
    expect(classifyMigration('CREATE TABLE IF NOT EXISTS ok (id int);').tier).toBe(1);
  });

  it('reuses the REAL splitter: a multi-statement additive migration is TIER-1 and reports per-statement matches', () => {
    const r = classifyMigration('CREATE TABLE IF NOT EXISTS a (id int);\nCREATE INDEX IF NOT EXISTS idx_a ON a (id);');
    expect(r.tier).toBe(1);
    expect(r.matched.length).toBe(2); // both statements independently matched an allow rule
  });
});
