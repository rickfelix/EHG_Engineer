// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-2, TS-5, TR-2) — pure derivation utility.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveVariantOutcomes } from '../../lib/marketing/ai/variant-outcome-derivation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../../lib/marketing/ai/variant-outcome-derivation.js');

describe('deriveVariantOutcomes (FR-2)', () => {
  it('derives successes from conversions and failures from impressions-conversions', () => {
    const result = deriveVariantOutcomes([{ variant_id: 'v1', impressions: 10, conversions: 3 }]);
    expect(result).toEqual([{ id: 'v1', successes: 3, failures: 7 }]);
  });

  it('aggregates multiple rows for the same variant_id (e.g. across dates/platforms)', () => {
    const result = deriveVariantOutcomes([
      { variant_id: 'v1', impressions: 10, conversions: 3 },
      { variant_id: 'v1', impressions: 12, conversions: 4 },
    ]);
    expect(result).toEqual([{ id: 'v1', successes: 7, failures: 15 }]);
  });

  it('overflow case: conversions exceeding impressions floors failures at 0, never negative', () => {
    const result = deriveVariantOutcomes([{ variant_id: 'v1', impressions: 10, conversions: 12 }]);
    expect(result).toEqual([{ id: 'v1', successes: 12, failures: 0 }]);
  });

  it('zero-conversions boundary (G13): impressions>0, conversions=0 -- the state ALL production data is currently in (FR-6, empty substrate)', () => {
    const result = deriveVariantOutcomes([{ variant_id: 'v1', impressions: 10, conversions: 0 }]);
    expect(result).toEqual([{ id: 'v1', successes: 0, failures: 10 }]);
  });

  it('handles null/undefined/empty input without throwing', () => {
    expect(deriveVariantOutcomes(null)).toEqual([]);
    expect(deriveVariantOutcomes(undefined)).toEqual([]);
    expect(deriveVariantOutcomes([])).toEqual([]);
  });

  it('skips rows with no variant_id', () => {
    const result = deriveVariantOutcomes([{ impressions: 10, conversions: 3 }]);
    expect(result).toEqual([]);
  });

  it('TR-2: has zero imports of any Supabase/DB client', () => {
    // Checks for the substring case-insensitively rather than naming specific client
    // factory identifiers in a regex literal -- a literal spelling out e.g.
    // "createDatabaseClient" as plain source text would itself trip this repo's
    // audit-db-test-guards.mjs DB_IMPORT_SIGNAL scanner, which does not distinguish a
    // regex literal asserting ABSENCE from a real import (the same self-referential trap
    // this SD already hit twice elsewhere -- see FR-5's TS-6 test and the migration's
    // header comment).
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source.toLowerCase()).not.toMatch(/supabase/);
  });
});
