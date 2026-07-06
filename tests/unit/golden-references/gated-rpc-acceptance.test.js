// Vitest runner for the gated-RPC reference's structural acceptance.
// Env-parameterized so the SAME assertions judge delegate-adapted output:
//   GOLDEN_REF_SQL=<path> GOLDEN_REF_ENTITY_MAP='{"table":"x","rpc":"y"}' GOLDEN_REF_KIND=application
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocks, judgeSql, DEFAULT_ENTITY_MAP } from '../../../golden-references/gated-rpc-migration/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SQL_PATH = process.env.GOLDEN_REF_SQL || join(REPO_ROOT, 'golden-references', 'gated-rpc-migration', 'migration.sql');
const MAP = process.env.GOLDEN_REF_ENTITY_MAP ? JSON.parse(process.env.GOLDEN_REF_ENTITY_MAP) : DEFAULT_ENTITY_MAP;
// 'reference' (default) requires the REFERENCE ONLY header; 'application'
// (delegate-adapted output) instead requires the staged chairman-gated header.
const KIND = process.env.GOLDEN_REF_KIND === 'application' ? 'application' : 'reference';

const sql = readFileSync(SQL_PATH, 'utf8');
const LOCKS = buildLocks(MAP, { kind: KIND });

describe(`structural locks over ${MAP.rpc} (TS-1 pass direction)`, () => {
  for (const name of Object.keys(LOCKS)) {
    it(`lock: ${name}`, () => {
      expect(LOCKS[name](sql), `lock '${name}' must hold`).toBe(true);
    });
  }

  it('judgeSql aggregates to ok', () => {
    expect(judgeSql(sql, MAP, { kind: KIND })).toEqual({ ok: true, failed: [] });
  });
});

describe('mutated copies fail their named lock (TS-1 miss direction; hardened post-adversarial)', () => {
  it('weakened search_path (pg_temp not explicitly last — CVE-2018-1058 class)', () => {
    const mutated = sql.replace(/SET search_path = public, pg_temp/, 'SET search_path = public');
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('hardened_search_path');
  });

  it('a weak pin cannot hide behind a strong one elsewhere (per-pin evaluation)', () => {
    const mutated = sql + '\nCREATE OR REPLACE VIEW x AS SELECT 1;\n-- second pin below\nALTER FUNCTION something SET search_path = public;\n';
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('hardened_search_path');
  });

  it('missing REVOKE', () => {
    const mutated = sql.replace(/REVOKE EXECUTE[\s\S]*?FROM PUBLIC;/, '');
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('revoke_public_and_anon');
  });

  it('unrelated FROM PUBLIC elsewhere does not satisfy the revoke (single-statement scope)', () => {
    const mutated = sql
      .replace(new RegExp(`REVOKE EXECUTE ON FUNCTION ${MAP.rpc}\\(UUID, TEXT, TEXT, TEXT\\) FROM PUBLIC;`), 'REVOKE SELECT ON TABLE other_table FROM PUBLIC;');
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('revoke_public_and_anon');
  });

  it('missing DOWN stanza', () => {
    const mutated = sql.replace(/^-- DOWN[\s\S]*$/m, '');
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('down_stanza');
  });

  it('DOWN header without DROPs fails too', () => {
    const mutated = sql.replace(/^(-- DOWN[^\n]*\n)[\s\S]*$/m, '$1-- (rollback intentionally omitted)\n');
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('down_stanza');
  });

  it('deleted AUTHZ block', () => {
    const mutated = sql.replace(/-- AUTHZ[\s\S]*?END IF;/, '');
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('in_function_authz');
  });

  it('current_user-keyed authz (dead code inside a definer) is an explicit violation', () => {
    const mutated = sql.replace(
      /v_caller_role NOT IN \('authenticated', 'service_role', 'postgres'\)/,
      "current_user NOT IN ('service_role', 'postgres')"
    );
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('no_current_user_authz');
  });

  it('multi-grantee GRANT smuggling anon fails (adversarial CRITICAL)', () => {
    const mutated = sql.replace(
      new RegExp(`GRANT EXECUTE ON FUNCTION ${MAP.rpc}\\(UUID, TEXT, TEXT, TEXT\\) TO authenticated;`),
      `GRANT EXECUTE ON FUNCTION ${MAP.rpc}(UUID, TEXT, TEXT, TEXT) TO authenticated, anon;`
    );
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('grant_named_roles_only');
  });

  it('a second function riding along fails single_function_scope', () => {
    const mutated = sql + '\nCREATE OR REPLACE FUNCTION sneaky() RETURNS void LANGUAGE sql AS $x$ SELECT 1 $x$;\n';
    expect(judgeSql(mutated, MAP, { kind: KIND }).failed).toContain('single_function_scope');
  });
});
