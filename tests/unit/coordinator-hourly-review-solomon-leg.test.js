/**
 * SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001 — the SOLOMON leg of coordinator-hourly-review.cjs
 * mirrors the Adam leg: resolve the live Solomon (getActiveSolomonId, no hardcoded UUID) and dispatch a
 * coordinator_reminder (topic=solomon_responsibilities) via the validated dispatch guard. Self-contained
 * (returns a verdict, does NOT exit main), dry-run-safe, fail-open. Deps (resolveSolomon/insert) are
 * injectable so the test drives the leg without a live DB. The cycle-down gate is the caller's
 * (assessFleetActivity, checked once) — a quiescent fleet never reaches this leg.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { dispatchSolomonReminder, SOLOMON_REMINDER } = require('../../scripts/coordinator-hourly-review.cjs');

const sb = {};

describe('dispatchSolomonReminder — the Solomon hourly leg', () => {
  it('dispatches a coordinator_reminder (topic=solomon_responsibilities) to the LIVE Solomon', async () => {
    const insert = vi.fn(async () => ({ data: { id: 'row-1' }, error: null }));
    const r = await dispatchSolomonReminder(sb, { dryRun: false, resolveSolomon: async () => 'solomon-sess-123', insert });
    expect(r.dispatched).toBe(true);
    expect(r.target).toBe('solomon-sess-123');
    const [, row] = insert.mock.calls[0];
    expect(row.target_session).toBe('solomon-sess-123');
    expect(row.payload.kind).toBe('coordinator_reminder');
    expect(row.payload.topic).toBe('solomon_responsibilities'); // mirrors adam_responsibilities
    expect(row.sender_type).toBe('coordinator');
    expect(row.body).toBe(SOLOMON_REMINDER);
  });

  it('skips (no dispatch) when there is no live Solomon — itself a cycle-down', async () => {
    const insert = vi.fn();
    const r = await dispatchSolomonReminder(sb, { dryRun: false, resolveSolomon: async () => null, insert });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('no_live_solomon');
    expect(insert).not.toHaveBeenCalled();
  });

  it('dry-run: resolves the live Solomon but does NOT dispatch', async () => {
    const insert = vi.fn();
    const r = await dispatchSolomonReminder(sb, { dryRun: true, resolveSolomon: async () => 'solomon-sess-123', insert });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('dry_run');
    expect(insert).not.toHaveBeenCalled();
  });

  it('fail-open: a resolve/dispatch error returns a non-dispatched verdict (never throws)', async () => {
    const r = await dispatchSolomonReminder(sb, { dryRun: false, resolveSolomon: async () => { throw new Error('db down'); }, insert: vi.fn() });
    expect(r.dispatched).toBe(false);
    expect(r.reason).toBe('error');
  });

  it('SOLOMON_REMINDER references CONST-002 + the consult triage gate + the task_budget', () => {
    expect(SOLOMON_REMINDER).toMatch(/CONST-002/);
    expect(SOLOMON_REMINDER).toMatch(/consult triage gate/i);
    expect(SOLOMON_REMINDER).toMatch(/task_budget/);
  });
});
