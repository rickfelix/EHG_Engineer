// Vitest runner for the gated-RPC reference's structural acceptance.
// Env-parameterized so the SAME assertions judge delegate-adapted output:
//   GOLDEN_REF_SQL=<path> GOLDEN_REF_ENTITY_MAP='{"table":"x","rpc":"y"}'
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

describe('mutated copies fail their named lock (TS-1 miss direction)', () => {
  it('weakened search_path (bare public — the modal-but-weaker estate form)', () => {
    const mutated = sql.replace(/SET search_path = pg_catalog, public/, 'SET search_path = public');
    expect(LOCKS.hardened_search_path(mutated)).toBe(false);
    expect(judgeSql(mutated, MAP).failed).toContain('hardened_search_path');
  });

  it('missing REVOKE', () => {
    const mutated = sql.replace(/REVOKE EXECUTE[\s\S]*?FROM PUBLIC;/, '');
    expect(judgeSql(mutated, MAP).failed).toContain('revoke_public_and_anon');
  });

  it('missing DOWN stanza', () => {
    const mutated = sql.replace(/^-- DOWN[\s\S]*$/m, '');
    expect(judgeSql(mutated, MAP).failed).toContain('down_stanza');
  });

  it('deleted AUTHZ block', () => {
    const mutated = sql.replace(/-- AUTHZ[\s\S]*?END IF;/, '');
    expect(judgeSql(mutated, MAP).failed).toContain('in_function_authz');
  });

  it('granting to PUBLIC', () => {
    const mutated = sql + `\nGRANT EXECUTE ON FUNCTION ${MAP.rpc}(UUID) TO PUBLIC;`;
    expect(judgeSql(mutated, MAP).failed).toContain('grant_named_roles_only');
  });
});
