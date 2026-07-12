/**
 * Tests for the Relationship Engine meeting-surface read contract.
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-C
 */
import { describe, it, expect } from 'vitest';
import { buildPipelineMeetingSurfacePayload, MEETING_SURFACE_ADAPTER_VERSION } from './meeting-surface-adapter.js';

// getPipelineMeetingSurfaceReport requires a live DB — tested via integration only

describe('buildPipelineMeetingSurfacePayload', () => {
  it('returns data_state=unavailable for null input, never a fabricated zero', () => {
    const payload = buildPipelineMeetingSurfacePayload(null);
    expect(payload.data_state).toBe('unavailable');
    expect(payload.qualified_pipeline_value).toBeNull();
    expect(payload.version).toBe(MEETING_SURFACE_ADAPTER_VERSION);
  });

  it('returns data_state=unavailable for undefined input', () => {
    const payload = buildPipelineMeetingSurfacePayload(undefined);
    expect(payload.data_state).toBe('unavailable');
  });

  it('returns data_state=empty for a legitimately empty pipeline (distinct from unavailable)', () => {
    const payload = buildPipelineMeetingSurfacePayload({
      qualifiedValue: 0,
      contactCount: 0,
      stageBreakdown: [],
      lastActivityAt: null,
    });
    expect(payload.data_state).toBe('empty');
    expect(payload.qualified_pipeline_value).toBe(0);
    expect(payload.contact_count).toBe(0);
  });

  it('returns data_state=available with structured stage breakdown when live data exists', () => {
    const payload = buildPipelineMeetingSurfacePayload({
      qualifiedValue: 3,
      currency: 'USD',
      stageBreakdown: [{ stage: 'qualified', count: 3 }],
      contactCount: 5,
      orgCount: 2,
      lastActivityAt: '2026-07-11T23:00:00Z',
    });
    expect(payload.data_state).toBe('available');
    expect(payload.qualified_pipeline_value).toBe(3);
    expect(payload.stage_breakdown).toEqual([{ stage: 'qualified', count: 3 }]);
    expect(payload.contact_count).toBe(5);
    expect(payload.last_activity_at).toBe('2026-07-11T23:00:00Z');
  });

  it('defaults currency to USD when not provided', () => {
    const payload = buildPipelineMeetingSurfacePayload({ qualifiedValue: 1, contactCount: 1 });
    expect(payload.currency).toBe('USD');
  });
});
