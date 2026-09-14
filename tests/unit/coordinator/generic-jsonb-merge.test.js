/**
 * SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 FR-1/FR-4.
 *
 * Proves lib/coordinator/safe-metadata-merge.mjs's new generic core (mergeJsonbColumn /
 * removeJsonbColumnKey) works correctly against a SECOND table shape --
 * product_requirements_v2, whose schema was verified live during this SD's LEAD-phase
 * investigation (PK column `id`, varchar 'PRD-SD-XXX' -- not a UUID, not sd_key-shaped;
 * metadata jsonb, nullable, DEFAULT '{}'::jsonb) -- without depending on
 * SD-LEARN-FIX-ADDRESS-PAT-LES-012's unmerged branch or any of its files.
 *
 * Also proves the identifier allowlist (JSONB_MERGE_ALLOWLIST) refuses any table/column
 * combination outside the two entries it declares -- the only thing standing between a
 * generalized "accept a table name" API and an identifier-injection surface, since Postgres
 * has no bind-parameter form for a table/column name.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  mergeJsonbColumn, removeJsonbColumnKey, JSONB_MERGE_ALLOWLIST,
} from '../../../lib/coordinator/safe-metadata-merge.mjs';

function fakeClient({ rowCount = 1 } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      return { rowCount };
    }),
  };
}

describe('JSONB_MERGE_ALLOWLIST', () => {
  it('declares exactly the two verified-compatible tables', () => {
    expect(Object.keys(JSONB_MERGE_ALLOWLIST).sort()).toEqual([
      'product_requirements_v2', 'strategic_directives_v2',
    ]);
  });

  it('product_requirements_v2 entry matches the live-verified schema: PK id, jsonb column metadata', () => {
    expect(JSONB_MERGE_ALLOWLIST.product_requirements_v2).toEqual({
      keyColumns: ['id'], jsonbColumn: 'metadata', extraGuardColumns: [],
    });
  });

  // SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 EXEC-phase SECURITY review (SEC-1/SEC-2): the
  // allowlist must be immutable and looked up safely, not just documented as fixed.
  it('is deep-frozen at every level — cannot be mutated to admit an unreviewed table/column', () => {
    expect(Object.isFrozen(JSONB_MERGE_ALLOWLIST)).toBe(true);
    expect(Object.isFrozen(JSONB_MERGE_ALLOWLIST.strategic_directives_v2)).toBe(true);
    expect(Object.isFrozen(JSONB_MERGE_ALLOWLIST.strategic_directives_v2.keyColumns)).toBe(true);
    expect(Object.isFrozen(JSONB_MERGE_ALLOWLIST.strategic_directives_v2.extraGuardColumns)).toBe(true);
    // ESM modules run in strict mode, so an assignment to a frozen object throws outright
    // (rather than silently no-op'ing, strict mode's stronger guarantee) — either way, assert
    // the mutation had no effect.
    expect(() => { JSONB_MERGE_ALLOWLIST.probe_injected_table = { keyColumns: ['id'], jsonbColumn: 'metadata' }; }).toThrow(TypeError);
    expect(Object.hasOwn(JSONB_MERGE_ALLOWLIST, 'probe_injected_table')).toBe(false);
  });

  it('a prototype-chain property name (constructor, toString, __proto__) is refused, not silently truthy', async () => {
    const client = fakeClient();
    for (const hostileTable of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      await expect(mergeJsonbColumn({
        table: hostileTable, keyColumn: 'id', keyValue: 'x', jsonbColumn: 'metadata', patch: {}, client,
      })).rejects.toThrow(/not in JSONB_MERGE_ALLOWLIST/);
    }
    expect(client.queries).toHaveLength(0);
  });
});

// SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001 EXEC-phase SECURITY review (SEC-1): the prior
// free-text extraGuardSql/extraGuardParams API accepted an unvalidated predicate fragment
// from the caller -- `extraGuardSql: 'OR 1=1'` would widen the WHERE clause to match every
// row, silently defeating the compare-and-swap it exists to express. Replaced with a
// closed-shape extraGuardColumn (allowlist-validated) + extraGuardValue (always a bind
// parameter) pair. These tests pin that the new shape is genuinely closed.
describe('removeJsonbColumnKey extra-guard column allowlisting (SEC-1 regression)', () => {
  it('an allowlisted extraGuardColumn produces a parameterized AND clause', async () => {
    const client = fakeClient({ rowCount: 1 });
    const result = await removeJsonbColumnKey({
      table: 'strategic_directives_v2', keyColumn: 'id', keyValue: 'sd-1',
      jsonbColumn: 'metadata', key: 'release_request', client,
      extraGuardColumn: 'claiming_session_id', extraGuardValue: 'sess-1',
    });
    expect(result.rowCount).toBe(1);
    expect(client.queries[0].sql).toMatch(/WHERE id = \$1 AND claiming_session_id = \$3\s*$/);
    expect(client.queries[0].params).toEqual(['sd-1', 'release_request', 'sess-1']);
  });

  it('an extraGuardColumn NOT in that table\'s extraGuardColumns allowlist is refused', async () => {
    const client = fakeClient();
    await expect(removeJsonbColumnKey({
      table: 'strategic_directives_v2', keyColumn: 'id', keyValue: 'sd-1',
      jsonbColumn: 'metadata', key: 'k', client,
      extraGuardColumn: 'sd_key', extraGuardValue: 'x', // real column, but not allowlisted as an extra guard
    })).rejects.toThrow(/extraGuardColumn 'sd_key' is not allowed/);
    expect(client.queries).toHaveLength(0);
  });

  it('a hostile predicate-widening string as extraGuardColumn is refused outright (the SEC-1 exploit shape)', async () => {
    const client = fakeClient();
    await expect(removeJsonbColumnKey({
      table: 'strategic_directives_v2', keyColumn: 'id', keyValue: 'sd-1',
      jsonbColumn: 'metadata', key: 'k', client,
      extraGuardColumn: '1=1 OR id != $99 --', extraGuardValue: 'irrelevant',
    })).rejects.toThrow(/is not allowed/);
    expect(client.queries).toHaveLength(0);
  });

  it('product_requirements_v2 has no allowlisted extra-guard columns yet — any attempt is refused', async () => {
    const client = fakeClient();
    await expect(removeJsonbColumnKey({
      table: 'product_requirements_v2', keyColumn: 'id', keyValue: 'PRD-1',
      jsonbColumn: 'metadata', key: 'k', client,
      extraGuardColumn: 'anything', extraGuardValue: 'x',
    })).rejects.toThrow(/extraGuardColumn 'anything' is not allowed/);
  });

  it('omitting extraGuardColumn entirely produces the plain 2-param remove (unchanged from before this fix)', async () => {
    const client = fakeClient({ rowCount: 1 });
    await removeJsonbColumnKey({
      table: 'strategic_directives_v2', keyColumn: 'sd_key', keyValue: 'SD-1',
      jsonbColumn: 'metadata', key: 'k', client,
    });
    expect(client.queries[0].params).toEqual(['SD-1', 'k']);
    expect(client.queries[0].sql).not.toMatch(/AND/);
  });
});

describe('mergeJsonbColumn against product_requirements_v2 (second-table proof)', () => {
  it('generates COALESCE(metadata, \'{}\'::jsonb) || $patch WHERE id = $key for a PRD row', async () => {
    const client = fakeClient({ rowCount: 1 });
    const patch = { integration_operationalization: { status: 'reviewed' } };

    const result = await mergeJsonbColumn({
      table: 'product_requirements_v2', keyColumn: 'id', keyValue: 'PRD-SD-TEST-001',
      jsonbColumn: 'metadata', patch, client,
    });

    expect(result.rowCount).toBe(1);
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE product_requirements_v2/i);
    expect(client.queries[0].sql).toMatch(/COALESCE\(metadata, '\{\}'::jsonb\) \|\| \$2::jsonb/);
    expect(client.queries[0].sql).toMatch(/WHERE id = \$1\s*$/);
    expect(client.queries[0].params[0]).toBe('PRD-SD-TEST-001');
    expect(JSON.parse(client.queries[0].params[1])).toEqual(patch);
  });

  it('the SAME NULL-column guard that protects strategic_directives_v2 protects this table too', async () => {
    // COALESCE(metadata, '{}'::jsonb) is present in the generated SQL regardless of table --
    // this is what stops a row whose metadata has never been set (the live-verified nullable
    // column with a '{}'::jsonb default) from having its whole blob silently wiped.
    const client = fakeClient({ rowCount: 1 });
    await mergeJsonbColumn({
      table: 'product_requirements_v2', keyColumn: 'id', keyValue: 'PRD-SD-TEST-001',
      jsonbColumn: 'metadata', patch: { x: 1 }, client,
    });
    expect(client.queries[0].sql).toContain("COALESCE(metadata, '{}'::jsonb)");
  });
});

describe('removeJsonbColumnKey against product_requirements_v2', () => {
  it('generates COALESCE(metadata, \'{}\'::jsonb) - $key WHERE id = $keyValue', async () => {
    const client = fakeClient({ rowCount: 1 });
    const result = await removeJsonbColumnKey({
      table: 'product_requirements_v2', keyColumn: 'id', keyValue: 'PRD-SD-TEST-001',
      jsonbColumn: 'metadata', key: 'stale_field', client,
    });
    expect(result.rowCount).toBe(1);
    expect(client.queries[0].sql).toMatch(/^\s*UPDATE product_requirements_v2/i);
    expect(client.queries[0].sql).toMatch(/COALESCE\(metadata, '\{\}'::jsonb\) - \$2::text/);
    expect(client.queries[0].params).toEqual(['PRD-SD-TEST-001', 'stale_field']);
  });
});

describe('identifier allowlist refuses anything not declared', () => {
  it('refuses an unlisted table entirely', async () => {
    const client = fakeClient();
    await expect(mergeJsonbColumn({
      table: 'some_other_table', keyColumn: 'id', keyValue: 'x', jsonbColumn: 'metadata', patch: {}, client,
    })).rejects.toThrow(/not in JSONB_MERGE_ALLOWLIST/);
    expect(client.queries).toHaveLength(0);
  });

  it('refuses a keyColumn not listed for that table (e.g. sd_key against product_requirements_v2)', async () => {
    const client = fakeClient();
    await expect(mergeJsonbColumn({
      table: 'product_requirements_v2', keyColumn: 'sd_key', keyValue: 'x', jsonbColumn: 'metadata', patch: {}, client,
    })).rejects.toThrow(/keyColumn 'sd_key' is not allowed/);
    expect(client.queries).toHaveLength(0);
  });

  it('refuses a jsonbColumn not matching the allowlist entry', async () => {
    const client = fakeClient();
    await expect(mergeJsonbColumn({
      table: 'strategic_directives_v2', keyColumn: 'sd_key', keyValue: 'x', jsonbColumn: 'some_other_jsonb_col', patch: {}, client,
    })).rejects.toThrow(/jsonbColumn 'some_other_jsonb_col' is not allowed/);
    expect(client.queries).toHaveLength(0);
  });

  it('same refusals apply to removeJsonbColumnKey', async () => {
    const client = fakeClient();
    await expect(removeJsonbColumnKey({
      table: 'DROP TABLE strategic_directives_v2; --', keyColumn: 'id', keyValue: 'x', jsonbColumn: 'metadata', key: 'k', client,
    })).rejects.toThrow(/not in JSONB_MERGE_ALLOWLIST/);
    expect(client.queries).toHaveLength(0);
  });
});
