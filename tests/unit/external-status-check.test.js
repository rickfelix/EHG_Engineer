/**
 * External-status attribution guard tests — SD-LEO-INFRA-AUTO-CHECK-EXTERNAL-001.
 * PURE classifier + injected-fetch fetcher. ZERO live network (fetchImpl is always mocked).
 */
import { describe, it, expect, vi } from 'vitest';
import { checkAnthropicStatus, classifyAnomalyAttribution } from '../../lib/fleet/external-status-check.mjs';

// A mock fetchImpl that resolves to a Statuspage-shaped body.
const okFetch = (body) => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
const sp = (indicator, description = '', updated_at = '2026-06-15T12:00:00.000Z') => ({ status: { indicator, description }, page: { updated_at } });

describe('classifyAnomalyAttribution (pure)', () => {
  it('active incident (critical) → likely_external=true, high confidence, do-not-attribute-internally', () => {
    const v = classifyAnomalyAttribution({ anomaly: { summary: 'mass heartbeat loss' }, status: { indicator: 'critical', description: 'Elevated errors' } });
    expect(v.likely_external).toBe(true);
    expect(v.confidence).toBe('high');
    expect(v.recommendation).toMatch(/do NOT attribute/i);
  });
  it('minor incident → likely_external=true, medium confidence', () => {
    expect(classifyAnomalyAttribution({ status: { indicator: 'minor' } })).toMatchObject({ likely_external: true, confidence: 'medium' });
  });
  it('operational (none) → likely_external=false, investigate internally', () => {
    const v = classifyAnomalyAttribution({ anomaly: 'rate-limit spike', status: { indicator: 'none' } });
    expect(v.likely_external).toBe(false);
    expect(v.recommendation).toMatch(/code\/fleet gap/i);
  });
  it('unknown (fetch failed) → likely_external=null, low confidence, check manually (no false attribution)', () => {
    const v = classifyAnomalyAttribution({ status: { indicator: 'unknown', error: 'timeout' } });
    expect(v.likely_external).toBeNull();
    expect(v.confidence).toBe('low');
    expect(v.recommendation).toMatch(/manually/i);
  });
  it('missing/partial input never throws → treated as unknown', () => {
    expect(() => classifyAnomalyAttribution()).not.toThrow();
    expect(classifyAnomalyAttribution({}).indicator).toBe('unknown');
    expect(classifyAnomalyAttribution({ status: {} }).likely_external).toBeNull();
  });
  it('F2: an UNRECOGNIZED indicator (e.g. maintenance/future value) is NOT confidently operational → low-confidence manual-check', () => {
    const v = classifyAnomalyAttribution({ anomaly: 'odd anomaly', status: { indicator: 'maintenance' } });
    expect(v.likely_external).toBeNull();            // NOT false ("investigate internally")
    expect(v.confidence).toBe('low');
    expect(v.reason).toMatch(/Unrecognized.*maintenance/i); // names the real indicator, not 'none'
    expect(v.recommendation).toMatch(/manually/i);
  });
});

describe('checkAnthropicStatus (injectable-IO, fail-open)', () => {
  it('valid JSON body → {ok:true, indicator, description, updatedAt, ageMs}', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: okFetch(sp('none', 'All Systems Operational')), nowMs: Date.parse('2026-06-15T13:00:00.000Z') });
    expect(r).toMatchObject({ ok: true, indicator: 'none', description: 'All Systems Operational' });
    expect(r.ageMs).toBe(60 * 60 * 1000); // 1h after the page updated_at
  });
  it('maps an active incident indicator', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: okFetch(sp('major', 'Degraded')) });
    expect(r).toMatchObject({ ok: true, indicator: 'major', description: 'Degraded' });
  });
  it('fetchImpl that THROWS → fail-open {ok:false, indicator:unknown}, never throws', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNRESET')) });
    expect(r).toMatchObject({ ok: false, indicator: 'unknown' });
    expect(r.error).toMatch(/ECONNRESET/);
  });
  it('non-200 response → fail-open', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }) });
    expect(r).toMatchObject({ ok: false, indicator: 'unknown' });
  });
  it('F1: present but UNPARSEABLE updated_at → ageMs is null (not NaN), per the JSDoc contract', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: okFetch({ status: { indicator: 'none' }, page: { updated_at: 'not-a-real-date' } }), nowMs: Date.parse('2026-06-15T13:00:00.000Z') });
    expect(r.ok).toBe(true);
    expect(r.ageMs).toBeNull();           // NOT NaN
    expect(Number.isNaN(r.ageMs)).toBe(false);
  });
  it('200 but body missing status.indicator → fail-open', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: okFetch({ page: { updated_at: '2026-06-15T12:00:00.000Z' } }) });
    expect(r).toMatchObject({ ok: false, indicator: 'unknown' });
  });
  it('json() that throws (unparseable body) → fail-open', async () => {
    const r = await checkAnthropicStatus({ fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('bad json')) }) });
    expect(r).toMatchObject({ ok: false, indicator: 'unknown' });
  });
});

describe('end-to-end (mocked fetch) — incident detected gates internal attribution', () => {
  it('fetch reports critical → classifier says likely_external (do not attribute to code/fleet)', async () => {
    const status = await checkAnthropicStatus({ fetchImpl: okFetch(sp('critical', 'Major outage')) });
    const v = classifyAnomalyAttribution({ anomaly: { summary: 'fleet-wide tool errors' }, status });
    expect(v.likely_external).toBe(true);
    expect(v.recommendation).toMatch(/EXTERNAL/);
  });
});
