/**
 * QF-20260829-936 -- lib/quality/migration-data-presence.js
 *
 * Fixture: database/migrations/20260829_encode_chairman_venture_doctrine.sql is the real
 * measured specimen (SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001) -- a single-table seed insert
 * into chairman_constraints with 4 literal constraint_key values. Tests exercise the real
 * file on disk (no fixture duplication) against a mocked Supabase client.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkMigrationDataPresent,
  extractMigrationPaths,
  findEvidenceMigrationGaps,
} from '../../../lib/quality/migration-data-presence.js';

const REAL_MIGRATION = 'database/migrations/20260829_encode_chairman_venture_doctrine.sql';
const REAL_KEYS = ['AMBITION_AS_MOAT', 'JAGGED_SPACE_TARGETING', 'EDGE_OF_CAPABILITY_TIMING', 'TECHNOLOGY_CONVERGENCE'];

function makeSupabase(selectResult) {
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    in: vi.fn(async () => selectResult),
    eq: vi.fn(() => chain),
  };
  return chain;
}

describe('extractMigrationPaths', () => {
  it('extracts a database/migrations/*.sql path from free text', () => {
    const text = `Applied database/migrations/20260829_encode_chairman_venture_doctrine.sql per plan.`;
    expect(extractMigrationPaths(text)).toEqual([REAL_MIGRATION]);
  });

  it('dedupes repeated mentions and returns [] when none present', () => {
    expect(extractMigrationPaths(`${REAL_MIGRATION} ... also see ${REAL_MIGRATION}`)).toEqual([REAL_MIGRATION]);
    expect(extractMigrationPaths('no migration mentioned here')).toEqual([]);
  });
});

describe('checkMigrationDataPresent — real fixture migration, mocked DB', () => {
  it('flags all 4 rows missing when the DB has none of them (the measured specimen)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const gap = await checkMigrationDataPresent(supabase, REAL_MIGRATION);
    expect(gap).toEqual({ table: 'chairman_constraints', column: 'constraint_key', expected: 4, missing: REAL_KEYS });
  });

  it('returns null when every named row is present', async () => {
    const supabase = makeSupabase({ data: REAL_KEYS.map((constraint_key) => ({ constraint_key })), error: null });
    const gap = await checkMigrationDataPresent(supabase, REAL_MIGRATION);
    expect(gap).toBeNull();
  });

  it('flags a partial gap when only some rows are present', async () => {
    const supabase = makeSupabase({ data: [{ constraint_key: 'AMBITION_AS_MOAT' }], error: null });
    const gap = await checkMigrationDataPresent(supabase, REAL_MIGRATION);
    expect(gap.missing).toEqual(['JAGGED_SPACE_TARGETING', 'EDGE_OF_CAPABILITY_TIMING', 'TECHNOLOGY_CONVERGENCE']);
  });

  it('returns null for a nonexistent migration file (fails open)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const gap = await checkMigrationDataPresent(supabase, 'database/migrations/does-not-exist-9999.sql');
    expect(gap).toBeNull();
  });

  it('returns null on a DB query error (fails open, not this check\'s concern)', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'relation does not exist' } });
    const gap = await checkMigrationDataPresent(supabase, REAL_MIGRATION);
    expect(gap).toBeNull();
  });
});

describe('findEvidenceMigrationGaps', () => {
  it('reads handoff evidence text, extracts the migration path, and reports the gap', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }],
              })),
            })),
          };
        }
        // chairman_constraints presence check
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) };
      }),
    };

    const gaps = await findEvidenceMigrationGaps(supabase, 'sd-uuid-1');
    expect(gaps).toEqual([{ path: REAL_MIGRATION, table: 'chairman_constraints', column: 'constraint_key', expected: 4, missing: REAL_KEYS }]);
  });

  it('returns [] when no handoff evidence names a migration', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [{ deliverables_manifest: 'no migration here', completeness_report: null, executive_summary: null }] })),
        })),
      })),
    };
    const gaps = await findEvidenceMigrationGaps(supabase, 'sd-uuid-2');
    expect(gaps).toEqual([]);
  });
});
