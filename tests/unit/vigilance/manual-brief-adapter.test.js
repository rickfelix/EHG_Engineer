/**
 * FR-2 manual-brief adapter — pure unit tests. TS-3 (adapter half): a fixture manual brief
 * normalizes to an ATTESTED observation.
 */
import { describe, it, expect } from 'vitest';
import { manualBriefAdapter, isManualBriefConfigured } from '../../../lib/vigilance/adapters/manual-brief-adapter.js';

describe('manual-brief adapter (FR-2)', () => {
  it('is always configured (ungated, no credential required)', () => {
    expect(isManualBriefConfigured()).toBe(true);
    expect(manualBriefAdapter.isConfigured()).toBe(true);
  });

  it('TS-3: a fixture brief normalizes to an ATTESTED observation', async () => {
    const obs = await manualBriefAdapter.submit({
      subjectType: 'competitor',
      subjectId: 'Acme Rival',
      thesis: 'pricing_pressure',
      summary: 'Acme Rival dropped price 20% on the pro tier.',
      attestedBy: 'chairman',
      capturedAt: '2026-07-12T00:00:00Z',
    });
    expect(obs.provenanceKind).toBe('ATTESTED');
    expect(obs.attestedBy).toBe('chairman');
    expect(obs.subjectType).toBe('competitor');
    expect(obs.subjectId).toBe('Acme Rival');
    expect(obs.thesis).toBe('pricing_pressure');
    expect(obs.capturedAt).toBe('2026-07-12T00:00:00Z');
  });

  it('defaults capturedAt to now when omitted', async () => {
    const obs = await manualBriefAdapter.submit({
      subjectType: 'competitor', subjectId: 'X', summary: 'brief', attestedBy: 'chairman',
    });
    expect(obs.capturedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(obs.capturedAt))).toBe(false);
  });

  it('rejects a brief missing subjectType/subjectId', async () => {
    await expect(manualBriefAdapter.submit({ summary: 'x', attestedBy: 'chairman' })).rejects.toThrow(/subjectType/);
  });

  it('rejects an empty-summary brief', async () => {
    await expect(manualBriefAdapter.submit({ subjectType: 'competitor', subjectId: 'X', attestedBy: 'chairman' })).rejects.toThrow(/summary/);
  });

  it('rejects a brief with no attesting identity', async () => {
    await expect(manualBriefAdapter.submit({ subjectType: 'competitor', subjectId: 'X', summary: 'x' })).rejects.toThrow(/attestedBy/);
  });
});
