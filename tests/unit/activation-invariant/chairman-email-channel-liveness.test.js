/**
 * Activation invariant test — SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001.
 *
 * Per docs/reference/activation-invariant-rule.md: proves the schema -> worker -> UI chain is
 * ACTUALLY WIRED end-to-end against the same state, not just independently unit-tested in
 * isolation (closes PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 for this SD).
 *
 * Chain under test:
 *   schema:  chairman_email_channel_health row shape (database/migrations/20260704_chairman_email_channel_health.sql)
 *   worker:  lib/notifications/channel-health-recorder.js's recordAndEvaluate() -- writes real alarm state
 *   UI:      scripts/fleet-dashboard.cjs's printChairmanEmailChannelHealth() -- reads and renders it
 *
 * The SAME in-memory fake DB row is mutated by the REAL worker function and then read by the
 * REAL UI function -- if the two ever drift (column rename, shape mismatch, wrong table name),
 * this test fails where isolated unit tests of each piece would not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printChairmanEmailChannelHealth } = require('../../../scripts/fleet-dashboard.cjs');
import { recordAndEvaluate } from '../../../lib/notifications/channel-health-recorder.js';

function makeFakeHealthDb(initialRow = { consecutive_failures: 0, alarm_state: 'clear' }) {
  let row = { ...initialRow };
  return {
    from: (table) => {
      expect(table).toBe('chairman_email_channel_health');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        upsert: (patch) => { row = { ...row, ...patch }; return Promise.resolve({ error: null }); },
        update: (patch) => ({ eq: () => { row = { ...row, ...patch }; return Promise.resolve({ error: null }); } }),
      };
    },
  };
}

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

describe('Activation invariant: schema -> worker -> UI chain is genuinely wired', () => {
  it('a real alarm raised by the worker is rendered correctly by the UI reading the SAME row', async () => {
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn().mockResolvedValue({ verified: true });

    // WORKER: real recorder logic raises the alarm on the 2nd consecutive real failure.
    await recordAndEvaluate({ supabase: db, notifyChairman }, { success: false, errorCode: 'TIMEOUT' }, { now: new Date('2026-07-04T15:00:00Z') });
    await recordAndEvaluate({ supabase: db, notifyChairman }, { success: false, errorCode: 'TIMEOUT' }, { now: new Date('2026-07-04T15:01:00Z') });
    expect(notifyChairman).toHaveBeenCalledTimes(1); // confirms the worker genuinely raised

    // UI: real dashboard renderer, reading the SAME db the worker just wrote to.
    await printChairmanEmailChannelHealth({}, { supabase: db });
    const out = output();

    expect(out).toContain('CHAIRMAN-EMAIL CHANNEL HEALTH');
    expect(out).toContain('🔴 ALARM');
    expect(out).toContain('consecutive_failures=2');
    expect(out).toContain('last_error_class=TIMEOUT');
  });

  it('a real verified success recorded by the worker is rendered as healthy by the UI', async () => {
    const db = makeFakeHealthDb();

    await recordAndEvaluate({ supabase: db, notifyChairman: vi.fn() }, { success: true, providerMessageId: 'm1' }, { now: new Date('2026-07-04T15:00:00Z') });
    await printChairmanEmailChannelHealth({}, { supabase: db });
    const out = output();

    expect(out).toContain('🟢 healthy');
    expect(out).not.toContain('🔴 ALARM');
  });

  it('a recovering (cooldown) state written by the worker is rendered distinctly by the UI', async () => {
    const db = makeFakeHealthDb();
    const notifyChairman = vi.fn().mockResolvedValue({ verified: true });

    await recordAndEvaluate({ supabase: db, notifyChairman }, { success: false, errorCode: 'TIMEOUT' }, { now: new Date('2026-07-04T15:00:00Z') });
    await recordAndEvaluate({ supabase: db, notifyChairman }, { success: false, errorCode: 'TIMEOUT' }, { now: new Date('2026-07-04T15:01:00Z') });
    await recordAndEvaluate({ supabase: db, notifyChairman }, { success: true, providerMessageId: 'recovered' }, { now: new Date('2026-07-04T15:02:00Z') });

    await printChairmanEmailChannelHealth({}, { supabase: db });
    const out = output();

    expect(out).toContain('🟡 RECOVERING (cooldown)');
  });

  it('an unmigrated table (no row) is rendered as a clear, actionable message, not a crash', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
    await printChairmanEmailChannelHealth({}, { supabase: db });
    const out = output();
    expect(out).toContain('migration may be unapplied');
  });
});
