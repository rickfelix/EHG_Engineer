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
// SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: a real on-disk migration with no INSERT statement at
// all, for the genuinely-untested "unparseable migration shape" branch (distinct from the
// nonexistent-file branch already covered below).
const NO_INSERT_MIGRATION = 'database/migrations/009_bmad_risk_assessment.sql';

function makeSupabase(selectResult) {
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(async () => selectResult),
  };
  return chain;
}

describe('extractMigrationPaths', () => {
  it('extracts a database/migrations/*.sql path from free text', () => {
    const text = 'Applied database/migrations/20260829_encode_chairman_venture_doctrine.sql per plan.';
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

  it('returns null for a nonexistent migration file (fails open -- genuine limitation, preserved)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const gap = await checkMigrationDataPresent(supabase, 'database/migrations/does-not-exist-9999.sql');
    expect(gap).toBeNull();
  });

  it('returns null for a real migration with no INSERT statement (unparseable shape -- genuine limitation, preserved)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const gap = await checkMigrationDataPresent(supabase, NO_INSERT_MIGRATION);
    expect(gap).toBeNull();
  });

  // SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: INVERTED from the pre-fix "returns null on a DB query
  // error (fails open, not this check's concern)" -- a query error is not the same kind of
  // limitation as an unparseable shape; it is a failure to obtain the fact this check exists to
  // obtain. Reframed to a transient error class (code 57014), since the original mock's
  // no-.code shape is unreachable through the real schema-drift-detecting wrapped client in
  // production.
  it('throws (preserving the original error) on a transient DB query error, instead of silently reading as no-gap-found', async () => {
    const dbError = { message: 'canceling statement due to statement timeout', code: '57014' };
    const supabase = makeSupabase({ data: null, error: dbError });
    await expect(checkMigrationDataPresent(supabase, REAL_MIGRATION)).rejects.toEqual(dbError);
  });

  // QF-20260905-161: a 22P02/22023 error means the regex mis-parsed non-seed-insert SQL and fed
  // a garbage literal to a typed column -- a parser-shape limitation, not a query-execution
  // failure, so it fails open (null) like the other genuine parser limitations above.
  it.each(['22P02', '22023'])('returns null (fails open) on a parser-limitation SQLSTATE %s, instead of throwing', async (code) => {
    const dbError = { message: 'invalid input syntax for type uuid: "sdKey"', code };
    const supabase = makeSupabase({ data: null, error: dbError });
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
              eq: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }],
                })),
              })),
            })),
          };
        }
        // chairman_constraints presence check
        return { select: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })) })) };
      }),
    };

    const gaps = await findEvidenceMigrationGaps(supabase, 'sd-uuid-1');
    expect(gaps).toEqual([{ path: REAL_MIGRATION, table: 'chairman_constraints', column: 'constraint_key', expected: 4, missing: REAL_KEYS }]);
  });

  it('returns [] when no handoff evidence names a migration', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [{ deliverables_manifest: 'no migration here', completeness_report: null, executive_summary: null }] })),
          })),
        })),
      })),
    };
    const gaps = await findEvidenceMigrationGaps(supabase, 'sd-uuid-2');
    expect(gaps).toEqual([]);
  });

  // SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: the sd_phase_handoffs query previously did not
  // destructure `error` at all -- a transient error silently yielded undefined handoffs ->
  // empty text -> zero gaps found. Now throws instead.
  it('throws (preserving the original error) when the sd_phase_handoffs query itself errors, instead of silently reporting zero gaps', async () => {
    const dbError = { message: 'canceling statement due to statement timeout', code: '57014' };
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: null, error: dbError })),
          })),
        })),
      })),
    };
    await expect(findEvidenceMigrationGaps(supabase, 'sd-uuid-3')).rejects.toEqual(dbError);
  });

  // SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F FR-6: the throw from checkMigrationDataPresent() must
  // propagate all the way out of findEvidenceMigrationGaps()'s per-migration loop, not be
  // silently reinstated as a swallow one layer up by a defensive try/catch.
  it('propagates a checkMigrationDataPresent() throw out of the per-migration loop, not swallowed one layer up', async () => {
    const dbError = { message: 'canceling statement due to statement timeout', code: '57014' };
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'sd_phase_handoffs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [{ deliverables_manifest: `Applied ${REAL_MIGRATION}`, completeness_report: null, executive_summary: null }],
                  error: null,
                })),
              })),
            })),
          };
        }
        // The per-migration presence check errors.
        return { select: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: null, error: dbError })) })) })) };
      }),
    };
    await expect(findEvidenceMigrationGaps(supabase, 'sd-uuid-4')).rejects.toEqual(dbError);
  });
});
