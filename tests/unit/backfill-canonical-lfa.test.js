// SD-REFILL-00LTDQZ5: backfill the canonical sd_phase_handoffs LFA-accept row ONLY for completion
// ghosts whose approval is CORROBORATED by an accepted leo_handoff_executions row — never fabricate.
import { describe, it, expect } from 'vitest';
import { buildCanonicalLfaRow, isBackfillable } from '../../scripts/backfill-canonical-lfa-from-executions.mjs';

describe('buildCanonicalLfaRow (SD-REFILL-00LTDQZ5)', () => {
  const sd = { id: 'uuid-e', sd_key: 'SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001-E', target_application: 'EHG' };
  const exec = { validation_score: 99, accepted_at: '2026-06-13T00:00:00Z' };

  it('TS-1: copies validation_score from the execution row and uses the ADMIN_OVERRIDE trigger escape', () => {
    const row = buildCanonicalLfaRow(sd, exec);
    expect(row.handoff_type).toBe('LEAD-FINAL-APPROVAL');
    expect(row.status).toBe('accepted');
    expect(row.validation_score).toBe(99);
    expect(row.validation_passed).toBe(true);
    expect(row.created_by).toBe('ADMIN_OVERRIDE');
    expect(row.from_phase).toBe('LEAD');
    expect(row.to_phase).toBe('LEAD');
  });

  it('TS-2: marks the row as a corroborated backfill (honest provenance) + preserves accepted_at', () => {
    const row = buildCanonicalLfaRow(sd, exec);
    expect(row.metadata.canonical_backfill).toBe(true);
    expect(row.metadata.source).toMatch(/corroboration/);
    expect(row.metadata.target_application).toBe('EHG');
    expect(row.accepted_at).toBe('2026-06-13T00:00:00Z'); // history preserved, not "now"
  });

  it('a missing/invalid execution score -> null (no fabricated number)', () => {
    expect(buildCanonicalLfaRow(sd, {}).validation_score).toBeNull();
    expect(buildCanonicalLfaRow(sd, { validation_score: 'x' }).validation_score).toBeNull();
  });
});

describe('isBackfillable (corroboration gate)', () => {
  it('TS-3: corroborated (exec accepted) + missing canonical -> true', () => {
    expect(isBackfillable({ hasExecAccepted: true, hasCanonicalAccepted: false })).toBe(true);
  });

  it('uncorroborated (no exec accepted) -> false (never fabricate approval)', () => {
    expect(isBackfillable({ hasExecAccepted: false, hasCanonicalAccepted: false })).toBe(false);
  });

  it('TS-4: already-canonical -> false (idempotent)', () => {
    expect(isBackfillable({ hasExecAccepted: true, hasCanonicalAccepted: true })).toBe(false);
  });
});
