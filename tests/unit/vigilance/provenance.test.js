/**
 * FR-3 provenance-kind taxonomy — pure unit tests. TS-5: an observation write with neither
 * FETCHED nor ATTESTED provenance (or missing the fields its kind requires) is rejected.
 */
import { describe, it, expect } from 'vitest';
import { validateObservationProvenance, toEvidenceFabricProvenance, OBSERVATION_PROVENANCE_KINDS } from '../../../lib/vigilance/provenance.js';

describe('vigilance provenance taxonomy (FR-3)', () => {
  it('TS-5: rejects an observation with neither FETCHED nor ATTESTED provenance', () => {
    const result = validateObservationProvenance({ capturedAt: '2026-07-12T00:00:00Z' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/provenanceKind/);
  });

  it('rejects an unrecognized provenanceKind value', () => {
    const result = validateObservationProvenance({ provenanceKind: 'GUESSED', capturedAt: '2026-07-12T00:00:00Z' });
    expect(result.valid).toBe(false);
  });

  it('requires capturedAt for both kinds', () => {
    expect(validateObservationProvenance({ provenanceKind: 'ATTESTED', attestedBy: 'chairman' }).valid).toBe(false);
    expect(validateObservationProvenance({ provenanceKind: 'FETCHED', url: 'https://x', method: 'GET' }).valid).toBe(false);
  });

  it('accepts a valid ATTESTED observation', () => {
    const result = validateObservationProvenance({ provenanceKind: 'ATTESTED', attestedBy: 'chairman', capturedAt: '2026-07-12T00:00:00Z' });
    expect(result.valid).toBe(true);
  });

  it('FETCHED requires url AND method', () => {
    expect(validateObservationProvenance({ provenanceKind: 'FETCHED', url: 'https://x', capturedAt: '2026-07-12T00:00:00Z' }).valid).toBe(false);
    expect(validateObservationProvenance({ provenanceKind: 'FETCHED', method: 'GET', capturedAt: '2026-07-12T00:00:00Z' }).valid).toBe(false);
    expect(validateObservationProvenance({ provenanceKind: 'FETCHED', url: 'https://x', method: 'GET', capturedAt: '2026-07-12T00:00:00Z' }).valid).toBe(true);
  });

  it('accepts a valid FETCHED observation', () => {
    const result = validateObservationProvenance({ provenanceKind: 'FETCHED', url: 'https://x', method: 'GET', capturedAt: '2026-07-12T00:00:00Z' });
    expect(result.valid).toBe(true);
  });

  it('maps ATTESTED -> attested and FETCHED -> real_event onto evidence-fabric provenance (does not modify the upstream taxonomy)', () => {
    expect(toEvidenceFabricProvenance('ATTESTED')).toBe('attested');
    expect(toEvidenceFabricProvenance('FETCHED')).toBe('real_event');
  });

  it('throws on an unmapped provenance kind (defensive)', () => {
    expect(() => toEvidenceFabricProvenance('UNKNOWN')).toThrow();
  });

  it('taxonomy is closed to exactly FETCHED and ATTESTED', () => {
    expect(OBSERVATION_PROVENANCE_KINDS).toEqual(['FETCHED', 'ATTESTED']);
  });
});
