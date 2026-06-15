/**
 * SD-LEO-INFRA-OKR-KR-ALIGNMENT-WIRE-001 — unit tests for the pure alignment row-builder + the
 * sd_key->sd_id resolver. The DB I/O is not unit-tested (one-time data op); the row CONTRACT +
 * the FK-resolution (adversarial-review H1) are what matter.
 */
import { describe, it, expect } from 'vitest';
import { buildAlignmentRows, toInsertRows, alignmentKey, _internals } from '../../../scripts/okr/wire-o-2026-07-kr-alignment.mjs';

describe('buildAlignmentRows (O-2026-07 KR -> SD alignment)', () => {
  const rows = buildAlignmentRows();

  it('builds 8 rows covering all 5 O-2026-07 KRs', () => {
    expect(rows).toHaveLength(8);
    const krs = new Set(rows.map((r) => r.key_result_id));
    expect(krs.size).toBe(5);
  });

  it('KR-04 (first revenue) has 2 links; KR-05 (distance-to-quit) has 3; others 1', () => {
    const byKr = {};
    for (const r of rows) byKr[r.key_result_id] = (byKr[r.key_result_id] || 0) + 1;
    expect(byKr[_internals.KR.K01_SUPPORT_TRIAGE]).toBe(1);
    expect(byKr[_internals.KR.K02_BREAKAGE]).toBe(1);
    expect(byKr[_internals.KR.K03_SPIKE_REHEARSAL]).toBe(1);
    expect(byKr[_internals.KR.K04_FIRST_REVENUE]).toBe(2);
    expect(byKr[_internals.KR.K05_DISTANCE_TO_QUIT]).toBe(3); // VISION-LADDER + ONE-ROADMAP + REPLACEMENT-NET
  });

  it('HONEST types: only the ACHIEVED KR-01 is direct; every pending-KR row is enabling/supporting', () => {
    for (const r of rows) expect(_internals.VALID_CONTRIBUTION_TYPES.has(r.contribution_type)).toBe(true);
    const directs = rows.filter((r) => r.contribution_type === 'direct');
    expect(directs).toHaveLength(1);
    expect(directs[0].key_result_id).toBe(_internals.KR.K01_SUPPORT_TRIAGE);
    // no 'direct' on any pending KR
    for (const r of rows) {
      if (r.key_result_id !== _internals.KR.K01_SUPPORT_TRIAGE) expect(r.contribution_type).not.toBe('direct');
    }
  });

  it('KR-05 primary contributor is VISION-LADDER-V1-001 (ships the literal distance-to-quit gauge)', () => {
    const k05 = rows.filter((r) => r.key_result_id === _internals.KR.K05_DISTANCE_TO_QUIT).map((r) => r.sd_key);
    expect(k05).toContain('SD-LEO-INFRA-VISION-LADDER-V1-001');
    expect(k05).toContain('SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001');
    expect(k05).toContain('SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001');
  });

  it('every row: non-empty note, weight=1, aligned_by=ai_auto, confidence in (0,1], sd_key shape', () => {
    for (const r of rows) {
      expect(r.contribution_note && r.contribution_note.length).toBeGreaterThan(10);
      expect(r.contribution_weight).toBe(1);
      expect(r.aligned_by).toBe('ai_auto');
      expect(r.alignment_confidence).toBeGreaterThan(0);
      expect(r.alignment_confidence).toBeLessThanOrEqual(1);
      expect(r.sd_key.startsWith('SD-')).toBe(true);
      expect(r.sd_id).toBeUndefined(); // not resolved yet
    }
  });

  it('the 8 (sd_key,key_result_id) idempotency keys are distinct', () => {
    expect(new Set(rows.map(alignmentKey)).size).toBe(8);
  });
});

describe('toInsertRows (FK resolution — adversarial-review H1)', () => {
  const rows = buildAlignmentRows();
  const idBySdKey = {
    'SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001': '031aca6d-c445-4ca3-b2f0-461c7354da5c',
    'SD-LEO-INFRA-BREAKAGE-DETECTOR-SURFACE-001': 'c9924f1e-c6c8-4f82-ac3e-91afca930b68',
    'SD-LEO-INFRA-SOLO-OPERATOR-CONTINUITY-001': '1cc9062e-bf5f-463e-bfbe-5f79ffdb9486',
    'SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001': '30e833e5-5588-4bd6-8930-d93b4295b800',
    'SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001': '3e413403-1880-49d9-a8a6-4a799adf9298',
    'SD-LEO-INFRA-VISION-LADDER-V1-001': '32c4934c-8bda-4c76-815c-50fa851e9c70',
    'SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001': 'SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001', // legacy key-as-id
  };

  it('replaces sd_key with the resolved sd_id (FK target id) and drops sd_key', () => {
    const out = toInsertRows(rows, idBySdKey);
    expect(out).toHaveLength(8);
    for (const r of out) {
      expect(r.sd_key).toBeUndefined();
      expect(typeof r.sd_id).toBe('string');
    }
    // a modern SD resolves to its UUID; the legacy one resolves to its sd_key
    const support = out.find((r) => r.sd_id === '031aca6d-c445-4ca3-b2f0-461c7354da5c');
    expect(support).toBeTruthy();
    const oneRoadmap = out.find((r) => r.sd_id === 'SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001');
    expect(oneRoadmap).toBeTruthy();
  });

  it('throws loudly if a sd_key cannot be resolved (fail before the FK violation)', () => {
    expect(() => toInsertRows(rows, {})).toThrow(/unresolved sd_key/);
  });
});
