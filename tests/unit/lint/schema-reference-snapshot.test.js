/**
 * QF-20260904-619 — hermetic unit test for the pure column-array guard extracted from
 * schema-reference-snapshot.mjs. No fs/DB/network: exercises assertParsedColumnArray()
 * directly. Importing this module does NOT connect to a database (the query/write logic
 * is gated behind isMainModule()).
 */
import { describe, it, expect } from 'vitest';
import { assertParsedColumnArray } from '../../../scripts/lint/schema-reference-snapshot.mjs';

describe('assertParsedColumnArray — the runtime guard against an unparsed array OID', () => {
  it('returns a real array unchanged', () => {
    const cols = ['id', 'sd_key', 'deliverables_manifest'];
    expect(assertParsedColumnArray(cols, 'sd_scope_deliverables')).toBe(cols);
  });

  it('throws when the aggregate arrived as a raw Postgres array-literal string (the QF-20260904-619 defect shape)', () => {
    expect(() => assertParsedColumnArray('{id,sd_key,deliverables_manifest}', 'sd_scope_deliverables'))
      .toThrow(/expected a parsed array of columns/);
  });

  it('names the relation in the error so a failure is triageable', () => {
    expect(() => assertParsedColumnArray('{a,b}', 'ventures')).toThrow(/"ventures"/);
  });
});
