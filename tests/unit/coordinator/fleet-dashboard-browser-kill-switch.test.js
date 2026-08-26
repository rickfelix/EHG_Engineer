/**
 * SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001 FR-7 -- regression test for a real shipped bug
 * (EXEC-phase TESTING sub-agent finding F1): `browser-kill-switch on` originally wrote
 * `{engaged: !engaged}` (the local `engaged` variable negated), which lib/fleet/browser-actuation-
 * guards.js#isKillSwitchEngaged read back as PERMITTED -- the exact inverse of the chairman's
 * intent. No test executed the CLI verb body, so it shipped. This test asserts the actual
 * write-then-read round trip through the SAME reader driveAction() uses, not just the write call's
 * own arguments -- the class of check that would have caught F1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printBrowserKillSwitchAction } = require('../../../scripts/fleet-dashboard.cjs');

/** A minimal in-memory app_config table backing BOTH the write (upsert) and the read (isKillSwitchEngaged -> select). */
function makeAppConfigStore() {
  const rows = new Map();
  const client = {
    from: vi.fn(() => ({
      upsert: vi.fn(async (row) => {
        rows.set(row.key, row);
        return { error: null };
      }),
      select: vi.fn(() => ({
        eq: vi.fn((_col, key) => ({
          maybeSingle: vi.fn(async () => ({ data: rows.has(key) ? { value: rows.get(key).value } : null, error: null })),
        })),
      })),
    })),
  };
  return { client, rows };
}

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

describe('printBrowserKillSwitchAction — write-then-read round trip (F1 regression)', () => {
  it('"on" stores a value that isKillSwitchEngaged() reads back as ENGAGED (STOPPED)', async () => {
    const { client } = makeAppConfigStore();
    await printBrowserKillSwitchAction('on', client);
    expect(output()).toContain('ENGAGED (all actuation STOPPED, fleet-wide)');
    expect(output()).not.toContain('WARNING: read-back mismatch');

    // Independently confirm via a bare status read (a second, unrelated call path).
    logSpy.mockClear();
    await printBrowserKillSwitchAction(undefined, client);
    expect(output()).toContain('BROWSER ACTUATION KILL SWITCH: ENGAGED (STOPPED)');
  });

  it('"off" stores a value that isKillSwitchEngaged() reads back as disengaged (running)', async () => {
    const { client } = makeAppConfigStore();
    await printBrowserKillSwitchAction('off', client);
    expect(output()).toContain('disengaged (actuation permitted');
    expect(output()).not.toContain('WARNING: read-back mismatch');

    logSpy.mockClear();
    await printBrowserKillSwitchAction(undefined, client);
    expect(output()).toContain('BROWSER ACTUATION KILL SWITCH: disengaged (running)');
  });

  it('toggling on then off then on again round-trips correctly each time (no stuck/inverted state)', async () => {
    const { client } = makeAppConfigStore();
    await printBrowserKillSwitchAction('on', client);
    await printBrowserKillSwitchAction('off', client);
    logSpy.mockClear();
    await printBrowserKillSwitchAction('on', client);
    expect(output()).toContain('ENGAGED (all actuation STOPPED, fleet-wide)');
  });
});
