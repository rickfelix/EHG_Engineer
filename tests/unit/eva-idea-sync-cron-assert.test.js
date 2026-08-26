/**
 * SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 FR-4 AC-3 — the pure decision logic behind the
 * cron's post-run health assertion (scripts/eva-idea-sync-cron-assert.mjs). Since
 * scripts/eva-idea-sync.js always exits 0, this evaluateSource() function is what the workflow's
 * if: failure() step actually keys off, so its per-source pass/fail logic gets a direct unit test.
 */
import { describe, it, expect } from 'vitest';
import { evaluateSource } from '../../scripts/eva-idea-sync-cron-assert.mjs';

describe('evaluateSource (FR-4 AC-3)', () => {
  it('healthy: watermark advanced and circuit closed', () => {
    const r = evaluateSource('todoist', '2026-08-25T00:00:00Z', {
      last_sync_at: '2026-08-26T05:00:00Z',
      consecutive_failures: 0,
    });
    expect(r.healthy).toBe(true);
  });

  it('unhealthy: circuit open (>= 3 consecutive failures), even if watermark technically unchanged', () => {
    const r = evaluateSource('youtube', '2026-08-20T00:00:00Z', {
      last_sync_at: '2026-08-20T00:00:00Z',
      consecutive_failures: 3,
    });
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/circuit open/);
  });

  it('unhealthy: watermark did not advance even though the circuit is not yet open', () => {
    const r = evaluateSource('youtube', '2026-08-20T00:00:00Z', {
      last_sync_at: '2026-08-20T00:00:00Z',
      consecutive_failures: 1,
    });
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/watermark did not advance/);
  });

  it('unhealthy: no post-run row at all (source never wrote state)', () => {
    const r = evaluateSource('youtube', null, undefined);
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/no eva_sync_state row/);
  });

  it('healthy: a source that had no prior watermark (null) and now has one advanced correctly', () => {
    const r = evaluateSource('youtube', null, {
      last_sync_at: '2026-08-26T05:00:00Z',
      consecutive_failures: 0,
    });
    expect(r.healthy).toBe(true);
  });

  it('per-source independence (TS-1): one healthy + one unhealthy are reported distinctly, not folded into a single verdict', () => {
    const healthy = evaluateSource('todoist', '2026-08-25T00:00:00Z', {
      last_sync_at: '2026-08-26T05:00:00Z',
      consecutive_failures: 0,
    });
    const unhealthy = evaluateSource('youtube', '2026-08-20T00:00:00Z', {
      last_sync_at: '2026-08-20T00:00:00Z',
      consecutive_failures: 3,
    });
    expect(healthy.healthy).toBe(true);
    expect(unhealthy.healthy).toBe(false);
  });
});
