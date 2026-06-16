/**
 * Adam durable-source-trigger watchdog tests — SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001 (FR-5).
 * Pure, no I/O. Pins the watchdog verdicts (ok / missing / unprovisioned) + the no-false-alarm
 * contract for the source arm.
 */
import { describe, it, expect } from 'vitest';
import { assessAdamSourceWatchdog, GAUGE_MAX_AGE_MS } from '../../lib/fleet/adam-source-watchdog.mjs';

const NOW = 1_700_000_000_000;
const minsAgo = (m) => NOW - m * 60_000;

describe('assessAdamSourceWatchdog (SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001)', () => {
  it('FAIL-SOFT: absent gated table → unprovisioned, no crash, honest label', () => {
    const r = assessAdamSourceWatchdog({ tableProvisioned: false, nowMs: NOW });
    expect(r.verdict).toBe('unprovisioned');
    expect(r.missing).toEqual([]);
    expect(r.label).toMatch(/not yet provisioned/i);
  });

  it('a fresh gauge run (within 90m) and no source arm → ok (no degraded line)', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: minsAgo(20), nowMs: NOW });
    expect(r.verdict).toBe('ok');
    expect(r.label).toBeNull();
  });

  it('a STALE gauge run (>90m) → missing, label names the stale gauge', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: minsAgo(120), nowMs: NOW });
    expect(r.verdict).toBe('missing');
    expect(r.missing).toContain('vision_build_gauge');
    expect(r.label).toMatch(/vision-gauge run \d+m stale/);
  });

  it('table provisioned but NO gauge run on record → missing (the dropped-trigger hole)', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: null, nowMs: NOW });
    expect(r.verdict).toBe('missing');
    expect(r.label).toMatch(/no vision-gauge run on record/);
  });

  it('NO false alarm: the source arm is skipped when lastSourceAtMs is undefined', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: minsAgo(10), nowMs: NOW }); // no lastSourceAtMs
    expect(r.verdict).toBe('ok');
    expect(r.missing).not.toContain('adam_source_event');
  });

  it('source arm: a stale Adam source event (provided) → missing names the source event', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: minsAgo(10), lastSourceAtMs: minsAgo(200), nowMs: NOW });
    expect(r.verdict).toBe('missing');
    expect(r.missing).toContain('adam_source_event');
    expect(r.label).toMatch(/Adam source \d+m stale/);
  });

  it('source arm: a fresh source event + fresh gauge → ok', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: minsAgo(10), lastSourceAtMs: minsAgo(10), nowMs: NOW });
    expect(r.verdict).toBe('ok');
  });

  it('both stale → missing lists both runs', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: minsAgo(200), lastSourceAtMs: minsAgo(200), nowMs: NOW });
    expect(r.verdict).toBe('missing');
    expect(r.missing).toEqual(expect.arrayContaining(['vision_build_gauge', 'adam_source_event']));
  });

  it('boundary: a gauge run exactly at the max age is still ok (not stale)', () => {
    const r = assessAdamSourceWatchdog({ lastGaugeAtMs: NOW - GAUGE_MAX_AGE_MS, nowMs: NOW });
    expect(r.verdict).toBe('ok');
  });

  it('defensive: empty args do not throw', () => {
    expect(() => assessAdamSourceWatchdog({ nowMs: NOW })).not.toThrow();
    // no gauge timestamp + provisioned default true → missing (no run on record)
    expect(assessAdamSourceWatchdog({ nowMs: NOW }).verdict).toBe('missing');
  });
});
