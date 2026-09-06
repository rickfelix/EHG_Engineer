/**
 * SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 FR-4 — directedSdOf, the pure extraction the CI
 * predicate uses to name the addressed SD on a WORK_ASSIGNMENT row. Live-verified against real
 * data during EXEC (2026-09-06): --since 2026-09-06T00:00:00Z found 4 real pre-fix specimens,
 * including this session's own claim history — the predicate genuinely measures the defect class.
 */
import { describe, it, expect } from 'vitest';
import { directedSdOf } from '../../../scripts/ci/directed-assignment-outranked-by-resume-count.mjs';

describe('directedSdOf', () => {
  it('reads payload.sd_key first', () => {
    expect(directedSdOf({ payload: { sd_key: 'SD-A' }, target_sd: 'SD-B' })).toBe('SD-A');
  });

  it('falls back to payload.assigned_sd', () => {
    expect(directedSdOf({ payload: { assigned_sd: 'SD-C' } })).toBe('SD-C');
  });

  it('falls back to the target_sd column', () => {
    expect(directedSdOf({ payload: {}, target_sd: 'SD-D' })).toBe('SD-D');
  });

  it('returns null when nothing names a target', () => {
    expect(directedSdOf({ payload: {} })).toBeNull();
    expect(directedSdOf({ payload: null })).toBeNull();
  });
});
