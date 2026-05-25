/**
 * SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001 — FR-2 / AC-3 / AC-4.
 *
 * validateOperation must skip type-checking the 'unknown' placeholder (no false-positive on
 * non-string columns), still flag unknown columns, and still catch genuine literal type
 * mismatches. We mock the schema cache so no live DB is needed.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the transitive schema-cache require with a fixed schema:
//   is_working_on -> bool (NOT NULL with a default, so null-checks don't interfere)
//   status        -> varchar
vi.mock('../../../lib/schema-cache.cjs', () => ({
  getTableSchema: async () => new Map([
    ['is_working_on', { udt_name: 'bool', is_nullable: 'NO', column_default: 'false', column_name: 'is_working_on' }],
    ['status', { udt_name: 'varchar', is_nullable: 'YES', column_default: null, column_name: 'status' }],
  ]),
}));

const { validateOperation } = await import('../../../lib/schema-preflight.cjs');

describe('schema-preflight validateOperation — unknown-skip + literal type-check', () => {
  it("AC-1: a boolean true on a bool column is valid (the is_working_on:true false-positive is gone)", async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { is_working_on: true });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("AC-3: the 'unknown' placeholder skips the type check (no false 'Type mismatch')", async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { is_working_on: 'unknown' });
    expect(r.valid).toBe(true);
  });

  it('AC-3: an unknown column is still flagged regardless of value', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { bogus_col: 'unknown' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Unknown column: bogus_col/);
  });

  it('AC-4: a genuine literal type mismatch is still caught (number on a bool column)', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { is_working_on: 5 });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Type mismatch on "is_working_on"/);
  });

  it('a quoted-string literal on a varchar column is valid', async () => {
    const r = await validateOperation('strategic_directives_v2', 'query', { status: 'active' });
    expect(r.valid).toBe(true);
  });
});
