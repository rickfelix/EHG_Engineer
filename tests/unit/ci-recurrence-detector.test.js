/**
 * SD-LEO-INFRA-CI-FAILURE-AUTOTRIAGE-LOOP-001
 * Pure tests for the CI-failure recurrence detector: it flags only chronic, OPEN,
 * NOT-yet-covered failure classes for DRAFT corrective sourcing — excluding self-healed
 * and already-covered classes, and respecting the anti-spam caps.
 */
import { describe, it, expect } from 'vitest';
import {
  detectChronicClasses,
  applyCaps,
  classSignature,
  isSelfHealedOrResolved,
  isCovered,
  DEFAULT_THRESHOLD,
} from '../../scripts/lib/ci-recurrence-detector.mjs';

const row = (over = {}) => ({
  id: over.id || 'fb-' + Math.round((over._n || 1) * 1000),
  status: 'new',
  error_hash: 'hashA',
  resolution_type: null,
  strategic_directive_id: null,
  resolution_sd_id: null,
  occurrence_count: 1,
  created_at: '2026-06-19T00:00:00Z',
  error_message: 'workflow X failed',
  metadata: { repo: 'rickfelix/EHG_Engineer', workflow_name: 'CI', branch: 'feat/x' },
  ...over,
});

describe('classSignature', () => {
  it('uses error_hash when present', () => {
    expect(classSignature(row({ error_hash: 'h1' }))).toBe('h1');
  });
  it('falls back to repo:workflow_name when no error_hash', () => {
    expect(classSignature(row({ error_hash: null }))).toBe('rickfelix/EHG_Engineer:CI');
  });
});

describe('isSelfHealedOrResolved / isCovered', () => {
  it('treats resolved + self-heal resolution_types as self-healed', () => {
    expect(isSelfHealedOrResolved(row({ status: 'resolved' }))).toBe(true);
    expect(isSelfHealedOrResolved(row({ resolution_type: 'auto_resolved' }))).toBe(true);
    expect(isSelfHealedOrResolved(row({ resolution_type: 'pr_merged_moot' }))).toBe(true);
    expect(isSelfHealedOrResolved(row({ resolution_type: 'workflow_unhealthy' }))).toBe(true);
    expect(isSelfHealedOrResolved(row())).toBe(false);
  });
  it('treats either linkage column as covered', () => {
    expect(isCovered(row({ strategic_directive_id: 'SD-X' }))).toBe(true);
    expect(isCovered(row({ resolution_sd_id: 'SD-Y' }))).toBe(true);
    expect(isCovered(row())).toBe(false);
  });
});

describe('detectChronicClasses', () => {
  it('flags a chronic, open, uncovered class (occurrence_count sums to >= threshold)', () => {
    const rows = [
      row({ id: 'a', error_hash: 'hChronic', occurrence_count: 2 }),
      row({ id: 'b', error_hash: 'hChronic', occurrence_count: 2 }),
    ];
    const out = detectChronicClasses(rows, { threshold: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].classSignature).toBe('hChronic');
    expect(out[0].occurrenceTotal).toBe(4);
    expect(out[0].rowIds.sort()).toEqual(['a', 'b']);
    expect(out[0].representativeId).toBeDefined();
  });

  it('excludes a below-threshold (transient) class', () => {
    const rows = [row({ id: 'a', error_hash: 'hLow', occurrence_count: 1 })];
    expect(detectChronicClasses(rows, { threshold: 3 })).toHaveLength(0);
  });

  it('excludes a self-healed class even above threshold', () => {
    const rows = [
      row({ id: 'a', error_hash: 'hHeal', occurrence_count: 5, resolution_type: 'auto_resolved' }),
    ];
    expect(detectChronicClasses(rows, { threshold: 3 })).toHaveLength(0);
  });

  it('excludes a class already covered by a corrective SD (no double-source)', () => {
    const rows = [
      row({ id: 'a', error_hash: 'hCov', occurrence_count: 5, strategic_directive_id: 'SD-OPEN-1' }),
      row({ id: 'b', error_hash: 'hCov', occurrence_count: 5 }),
    ];
    expect(detectChronicClasses(rows, { threshold: 3 })).toHaveLength(0);
  });

  it('picks the oldest row as the representative', () => {
    const rows = [
      row({ id: 'new', error_hash: 'hRep', occurrence_count: 2, created_at: '2026-06-19T10:00:00Z' }),
      row({ id: 'old', error_hash: 'hRep', occurrence_count: 2, created_at: '2026-06-19T01:00:00Z' }),
    ];
    expect(detectChronicClasses(rows, { threshold: 3 })[0].representativeId).toBe('old');
  });

  it('orders candidates by occurrenceTotal desc (most-recurring first)', () => {
    const rows = [
      row({ id: 'a', error_hash: 'hSmall', occurrence_count: 3 }),
      row({ id: 'b', error_hash: 'hBig', occurrence_count: 9 }),
    ];
    const out = detectChronicClasses(rows, { threshold: 3 });
    expect(out.map((c) => c.classSignature)).toEqual(['hBig', 'hSmall']);
  });

  it('default threshold is a small positive integer', () => {
    expect(DEFAULT_THRESHOLD).toBeGreaterThanOrEqual(2);
  });
});

describe('applyCaps (anti-spam)', () => {
  const cands = [1, 2, 3, 4, 5].map((n) => ({ classSignature: 'c' + n }));
  it('caps to perRunCap', () => {
    expect(applyCaps(cands, { perRunCap: 2, sourcedToday: 0, perDayCap: 10 })).toHaveLength(2);
  });
  it('respects remaining per-day budget', () => {
    expect(applyCaps(cands, { perRunCap: 5, sourcedToday: 9, perDayCap: 10 })).toHaveLength(1);
  });
  it('returns nothing when the day cap is exhausted', () => {
    expect(applyCaps(cands, { perRunCap: 5, sourcedToday: 10, perDayCap: 10 })).toHaveLength(0);
  });
});
