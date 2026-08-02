// SD-LEO-INFRA-COORDINATOR-REVIVE-NEVER-001 — the caller must be able to tell a live
// queue from a dead one.
//
// worker_spawn_requests has 29 rows and has NEVER fulfilled one (fulfilled_at IS NOT NULL
// returns zero, lifetime). revive still printed "✓ Revival requested" and reported duplicates
// as benign idempotency, so a write-only surface read as success and 8 requests accumulated
// unnoticed. These tests pin the REPORTING, which is the defect — not the insert, which
// worked correctly all 29 times.
//
// Pure: no DB, no network. assessQueueHealth is exercised against the live table separately;
// what matters here is that the WARNING is derived from the counts and can switch off.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { formatQueueWarning } = require_('../../scripts/coordinator-revive.cjs');

const DEAD = { total: 29, pending: 8, everFulfilled: 0, oldestPendingAt: '2026-06-30T10:45:49.440001+00:00', neverConsumed: true };
const ALIVE = { total: 29, pending: 8, everFulfilled: 1, oldestPendingAt: '2026-06-30T10:45:49.440001+00:00', neverConsumed: false };

describe('coordinator-revive queue health reporting', () => {
  // TS-1 — the deciding scenario. Without this, "requested" reads as "will happen".
  it('warns that the request may never be consumed when nothing has ever been fulfilled', () => {
    const w = formatQueueWarning(DEAD);
    expect(w).toContain('MAY NEVER BE CONSUMED');
    expect(w).toContain('0 of 29');
  });

  // TS-2 — THE OFF-SWITCH, and the reason this is a measurement rather than an assertion.
  // A warning that cannot stop firing becomes noise, gets ignored, and re-creates the very
  // unobservability it was added to fix. It must go silent the moment a consumer works.
  it('goes completely silent once any request has been fulfilled', () => {
    expect(formatQueueWarning(ALIVE)).toBe('');
  });

  // TS-3 — counts always carry their denominator. A bare "8 pending" is the count-truncation
  // shape this codebase keeps rediscovering; "8 of 29" cannot be misread as the whole story.
  it('reports pending WITH its denominator and the oldest wait', () => {
    const w = formatQueueWarning(DEAD);
    expect(w).toMatch(/pending: 8 of 29/);
    expect(w).toMatch(/oldest waiting [\d.]+ days/);
  });

  // The operator gate lives in a DIFFERENT file's comment (fleet-rollcall-cron.yml), so a
  // reader of revive could never discover why it never completes. Surface it at the point of use.
  it('names the operator gate as the reason, where the caller will actually meet it', () => {
    const w = formatQueueWarning(DEAD);
    expect(w).toContain('OPERATOR-GATED');
    expect(w).toContain('fleet-rollcall-cron.yml');
  });

  // Absent health must never read as healthy — silence is not evidence of a live consumer.
  it('reports unreadable health as unreadable rather than as fine', () => {
    expect(formatQueueWarning(null)).toContain('unreadable');
  });

  // An empty table is not a dead queue: nothing has been fulfilled because nothing was asked.
  it('does not cry wolf on an empty queue', () => {
    expect(formatQueueWarning({ total: 0, pending: 0, everFulfilled: 0, oldestPendingAt: null, neverConsumed: false })).toBe('');
  });
});
