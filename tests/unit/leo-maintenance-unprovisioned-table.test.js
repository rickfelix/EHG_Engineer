/**
 * leo:maintenance unprovisioned-table detector — SD-REFILL-001MABRD.
 *
 * `leo:maintenance` reads three tables that are not provisioned (leo_session_tracking,
 * circuit_breaker_state, sub_agent_activation_stats). PostgREST returns a relation/schema-cache
 * error rather than throwing, so those routines used to silently no-op (the circuit-breaker reset
 * even reported a false "Reset 0" success). isUnprovisionedTableError classifies those errors so
 * each site can report an explicit "not provisioned — skipped" status. These tests pin that
 * classification and confirm a genuine error / no-error is NOT treated as unprovisioned.
 */
import { describe, it, expect } from 'vitest';
import { isUnprovisionedTableError } from '../../scripts/leo-maintenance.js';

describe('isUnprovisionedTableError (SD-REFILL-001MABRD)', () => {
  it('detects PostgREST relation/schema-cache errors as unprovisioned', () => {
    for (const msg of [
      'relation "circuit_breaker_state" does not exist',
      "Could not find the table 'public.leo_session_tracking' in the schema cache",
      'relation "sub_agent_activation_stats" does not exist',
      'undefined table',
    ]) {
      expect(isUnprovisionedTableError({ message: msg })).toBe(true);
    }
  });

  it('accepts a bare string error and is case-insensitive', () => {
    expect(isUnprovisionedTableError('Relation Does Not Exist')).toBe(true);
  });

  it('returns false for no error (the table exists / query succeeded)', () => {
    expect(isUnprovisionedTableError(null)).toBe(false);
    expect(isUnprovisionedTableError(undefined)).toBe(false);
  });

  it('returns false for a genuine non-missing-table error (must not mask real failures)', () => {
    expect(isUnprovisionedTableError({ message: 'permission denied for table circuit_breaker_state' })).toBe(false);
    expect(isUnprovisionedTableError({ message: 'connection reset by peer' })).toBe(false);
    expect(isUnprovisionedTableError({ message: 'invalid input syntax for type uuid' })).toBe(false);
  });
});
