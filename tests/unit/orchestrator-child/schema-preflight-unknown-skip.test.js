/**
 * SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001 — FR-2 / AC-3 / AC-4.
 *
 * validateOperation must skip type-checking the 'unknown' placeholder (no false-positive on
 * non-string columns), still flag unknown columns, and still catch genuine literal type
 * mismatches. A stub Supabase client is injected via options.supabaseClient so no live DB
 * is needed.
 *
 * SD-LEO-INFRA-ENFORCE-UNIT-TIER-001: the previous vi.mock('../../../lib/schema-cache.cjs')
 * silently NO-OPed (schema-preflight.cjs is CJS and require()s schema-cache at load time,
 * outside Vitest's ESM mock graph) — the test only passed because real .env creds let the
 * un-mocked cache hit the live DB. The supported injection seam (getTableSchema's client
 * parameter, wired through options.supabaseClient) makes the test genuinely hermetic.
 */
import { describe, it, expect, vi } from 'vitest';

const { validateOperation } = await import('../../../lib/schema-preflight.cjs');

// Fixed schema served through the get_schema_columns RPC shape that
// lib/schema-cache.cjs fetchTableSchema expects:
//   is_working_on -> bool (NOT NULL with a default, so null-checks don't interfere)
//   status        -> varchar
const stubClient = {
  rpc: vi.fn(async (fn, { p_table_name } = {}) => {
    expect(fn).toBe('get_schema_columns');
    expect(p_table_name).toBe('strategic_directives_v2');
    return {
      data: [
        { column_name: 'is_working_on', data_type: 'boolean', udt_name: 'bool', is_nullable: 'NO', column_default: 'false' },
        { column_name: 'status', data_type: 'character varying', udt_name: 'varchar', is_nullable: 'YES', column_default: null },
      ],
      error: null,
    };
  }),
};
const opts = { supabaseClient: stubClient };

describe('schema-preflight validateOperation — unknown-skip + literal type-check', () => {
  it('AC-1: a boolean true on a bool column is valid (the is_working_on:true false-positive is gone)', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { is_working_on: true }, opts);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("AC-3: the 'unknown' placeholder skips the type check (no false 'Type mismatch')", async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { is_working_on: 'unknown' }, opts);
    expect(r.valid).toBe(true);
  });

  it('AC-3: an unknown column is still flagged regardless of value', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { bogus_col: 'unknown' }, opts);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Unknown column: bogus_col/);
  });

  it('AC-4: a genuine literal type mismatch is still caught (number on a bool column)', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { is_working_on: 5 }, opts);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Type mismatch on "is_working_on"/);
  });

  it('a quoted-string literal on a varchar column is valid', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { status: 'active' }, opts);
    expect(r.valid).toBe(true);
  });
});
