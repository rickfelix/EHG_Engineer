/**
 * Unit tests: GATE_MIGRATION_DATA_VERIFICATION — FR-4 WAIT branch
 * SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001
 *
 * Covers each combination of applied_at / verified_at / last_verification_error:
 *   - applied, unverified, no error            → WAIT  (race window)
 *   - last_verification_error present          → FAIL  (verification crashed)
 *   - applied AND verified, no error           → OK    (proceeds to data check → PASS)
 *   - not applied (no tracking fields)         → OK    (proceeds to data check → PASS)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMigrationDataVerificationGate } from './migration-data-verification.js';

/**
 * Mock supabase whose sd_phase_handoffs query returns a metadata.migrations[]
 * array (the source findSdMigrations reads). All other tables return empty so
 * the data-verification step is a no-op (tables with no target → verified=true).
 */
function makeSupabase(metadataMigrations) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: () => Promise.resolve({
            data: { metadata: { migrations: metadataMigrations } },
            error: null
          })
        };
        return q;
      }
      // sd_deliverables fallback (only hit when no metadata migrations)
      if (table === 'sd_deliverables') {
        const q = { select: () => q, eq: () => q, ilike: () => Promise.resolve({ data: [], error: null }) };
        return q;
      }
      // target-table count queries during data verification
      return {
        select: () => Promise.resolve({ count: 5, error: null })
      };
    }
  };
}

const SD = { id: 'sd-uuid-mig', sd_key: 'SD-MIG-001', sd_type: 'database' };

describe('GATE_MIGRATION_DATA_VERIFICATION — FR-4 verification-state WAIT/FAIL', () => {
  let gate;
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('applied_at set, verified_at null, no error → WAIT', async () => {
    const supabase = makeSupabase([
      { name: 'm1', applied_at: '2026-04-24T20:00:00Z', verified_at: null, last_verification_error: null }
    ]);
    gate = createMigrationDataVerificationGate(supabase);
    const result = await gate.validator({ sd: SD });
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(result.details.reason).toBe('MIGRATION_VERIFICATION_PENDING');
    expect(result.issues).toEqual([]);
  });

  it('last_verification_error present → FAIL (verification crashed, not a race)', async () => {
    const supabase = makeSupabase([
      {
        name: 'm1',
        applied_at: '2026-04-24T20:00:00Z',
        verified_at: null,
        last_verification_error: 'relation "foo" does not exist'
      }
    ]);
    gate = createMigrationDataVerificationGate(supabase);
    const result = await gate.validator({ sd: SD });
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(false);
    expect(result.details.reason).toBe('MIGRATION_VERIFICATION_ERROR');
    expect(result.issues.some(i => /relation "foo" does not exist/.test(i))).toBe(true);
  });

  it('last_verification_error present takes precedence even if verified_at also set → FAIL', async () => {
    const supabase = makeSupabase([
      {
        name: 'm1',
        applied_at: '2026-04-24T20:00:00Z',
        verified_at: '2026-04-24T20:05:00Z',
        last_verification_error: 'constraint violation'
      }
    ]);
    gate = createMigrationDataVerificationGate(supabase);
    const result = await gate.validator({ sd: SD });
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(false);
    expect(result.details.reason).toBe('MIGRATION_VERIFICATION_ERROR');
  });

  it('applied_at AND verified_at set, no error → not WAIT/FAIL (proceeds to data check → PASS)', async () => {
    const supabase = makeSupabase([
      {
        name: 'm1',
        applied_at: '2026-04-24T20:00:00Z',
        verified_at: '2026-04-24T20:05:00Z',
        last_verification_error: null,
        tables: []
      }
    ]);
    gate = createMigrationDataVerificationGate(supabase);
    const result = await gate.validator({ sd: SD });
    expect(result.passed).toBe(true);
    expect(result.wait).toBeUndefined();
  });

  it('no tracking fields (not-yet-applied descriptor) → not WAIT/FAIL (proceeds → PASS)', async () => {
    const supabase = makeSupabase([
      { name: 'm1', tables: [] } // no applied_at/verified_at/last_verification_error
    ]);
    gate = createMigrationDataVerificationGate(supabase);
    const result = await gate.validator({ sd: SD });
    expect(result.passed).toBe(true);
    expect(result.wait).toBeUndefined();
  });
});
