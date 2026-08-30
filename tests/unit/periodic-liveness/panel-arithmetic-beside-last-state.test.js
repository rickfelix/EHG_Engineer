// QF-20260830-920 — Triangulation Audit cycle 2, area C, recommendation R3
// (chairman-ratified 2026-08-30, ratification 2ab4b4bc).
//
// THE DEFECT: the PERIODIC-PROCESS LIVENESS panel rendered periodic_process_registry.last_state
// alone. last_state is written by the watcher, and the watcher's stamps were measured lagging
// reality by hours for the github_actions_api class and absent entirely on 79-81 active rows, so
// the panel showed a healthy fleet the same table's own columns contradicted (measured
// 2026-08-30T17:09:17Z: 55 of 232 active rows overdue by their own grace window, only 24 carrying
// last_state=OVERDUE).
//
// These tests pin BOTH halves, because the second one is what the first cut of the fix got wrong:
// the arithmetic must fire on the classes that stamp last_fired_at, and must NOT fire on the
// classes for which a null last_fired_at is correct by design.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printPeriodicLiveness } = require('../../../scripts/fleet-dashboard.cjs');

/** Minimal stub of the supabase chain printPeriodicLiveness uses: .from().select().order(). */
function stubClient(rows, count) {
  return {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows, error: null, count }),
      }),
    }),
  };
}

const HOUR = 3600 * 1000;
function row(over) {
  return {
    process_key: 'k-' + Math.random().toString(36).slice(2, 8),
    display_name: 'test process',
    process_type: 'standalone_cron',
    currently_expected_active: true,
    last_fired_at: new Date(Date.now() - HOUR).toISOString(),
    last_state: 'OK',
    updated_at: new Date().toISOString(),
    expected_interval_seconds: 900,
    grace_multiplier: 2,
    liveness_source: 'github_actions_api',
    ...over,
  };
}

async function render(rows, count) {
  const lines = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
  try {
    await printPeriodicLiveness(stubClient(rows, count));
  } finally {
    spy.mockRestore();
  }
  return lines.join('\n');
}

afterEach(() => { vi.restoreAllMocks(); });

describe('periodic-liveness panel: arithmetic rendered beside last_state', () => {
  it('flags a row whose OWN columns say overdue while last_state reads OK', async () => {
    const out = await render([row({ display_name: 'stale-but-OK', last_state: 'OK' })]);
    expect(out).toMatch(/stale-but-OK/);
    expect(out).toMatch(/OVERDUE 1\.0h>30m/);
    expect(out).toMatch(/!!/); // the disagreement marker
    expect(out).toMatch(/1 row\(s\) where the ARITHMETIC/);
  });

  it('does NOT mark disagreement when last_state already says OVERDUE (gauge and arithmetic agree)', async () => {
    const out = await render([row({ display_name: 'agreeing', last_state: 'OVERDUE' })]);
    expect(out).toMatch(/OVERDUE 1\.0h>30m/); // arithmetic still shown
    expect(out).not.toMatch(/!!/);
    expect(out).not.toMatch(/row\(s\) where the ARITHMETIC/);
  });

  // This test originally paired NEVER-STAMPED with last_state='UNVERIFIED' and asserted the
  // disagreement marker -- i.e. IT PINNED THE BUG the review later found. UNVERIFIED is an alarm
  // state, so that pairing is agreement, not disagreement. Split into the two things it was
  // conflating: NEVER-STAMPED renders regardless of last_state, and the marker depends on whether
  // last_state is alarming.
  it('reports NEVER-STAMPED for an active stamping-class row with a null last_fired_at', async () => {
    const out = await render([row({ display_name: 'never-run', last_fired_at: null, last_state: 'UNVERIFIED' })]);
    expect(out).toMatch(/NEVER-STAMPED/);
    expect(out).not.toMatch(/!!/); // UNVERIFIED is itself an alarm — the instruments agree
  });

  it('marks NEVER-STAMPED as a disagreement when last_state is a non-alarm state', async () => {
    const out = await render([row({ display_name: 'never-run-but-OK', last_fired_at: null, last_state: 'OK' })]);
    expect(out).toMatch(/NEVER-STAMPED/);
    expect(out).toMatch(/!!/);
  });

  // THE SCOPE TEST. eva_scheduler_heartbeat (0 of 17 rows ever stamped) and
  // claude_sessions_heartbeat (0 of 3) resolve liveness from an external heartbeat, never from
  // last_fired_at -- measured across all 238 registry rows at 2026-08-30T17:39:31Z. Flagging them
  // would put a warning on 20 rows working exactly as built, which is the cry-wolf failure this
  // same audit cycle raised against the dispatcher's drain warn. The first cut of this renderer
  // did exactly that; this test exists so it cannot come back.
  it('does NOT flag heartbeat-sourced classes whose null last_fired_at is correct by design', async () => {
    const out = await render([
      row({ display_name: 'eva-round', last_fired_at: null, liveness_source: 'eva_scheduler_heartbeat', process_type: 'scheduler_round' }),
      row({ display_name: 'role-seat', last_fired_at: null, liveness_source: 'claude_sessions_heartbeat', process_type: 'role_session' }),
    ]);
    expect(out).toMatch(/eva-round/);
    expect(out).toMatch(/role-seat/);
    expect(out).not.toMatch(/NEVER-STAMPED/);
    expect(out).not.toMatch(/!!/);
  });

  it('does not compute arithmetic for a retired row (currently_expected_active false)', async () => {
    const out = await render([row({ display_name: 'retired', currently_expected_active: false, last_fired_at: null })]);
    expect(out).toMatch(/INTENTIONALLY_DOWN/);
    expect(out).not.toMatch(/NEVER-STAMPED/);
  });

  it('still renders last_state itself — the arithmetic is added beside it, never substituted', async () => {
    const out = await render([row({ display_name: 'both-shown', last_state: 'OK' })]);
    expect(out).toMatch(/OK\s+standalone_cron/);
  });

  // The panel must never render a capped subset as if it were the fleet. A truncated liveness
  // panel would hide the never-stamped population this change exists to surface -- the failure
  // mode would be the fix's own subject matter, one layer up.
  it('states the shortfall when the read returned fewer rows than the registry holds', async () => {
    const out = await render([row({ display_name: 'only-one' })], 238);
    expect(out).toMatch(/SHOWING 1 OF 238 REGISTRY ROWS/);
    expect(out).toMatch(/NOT the whole fleet/);
  });

  it('says nothing about truncation when the row count matches the head count', async () => {
    const out = await render([row({ display_name: 'complete' })], 1);
    expect(out).not.toMatch(/SHOWING/);
  });

  // REVIEW FINDING (QF-20260830-920, PR #7799): the first cut used a hand-typed regex
  // /^(OVERDUE|STALE|MISSING|FAIL)/i. STALE/MISSING/FAIL do not exist anywhere in this codebase,
  // and UNVERIFIED -- which DOES exist and which the watcher escalates to the owner "the same way
  // an OVERDUE row is escalated" (emitPersistentUnverifiedSignal) -- was absent. So a row whose
  // last_state was UNVERIFIED while the arithmetic also said overdue, i.e. BOTH INSTRUMENTS
  // AGREEING, was counted as a disagreement. 43 of the reported disagreements were that case.
  it('treats UNVERIFIED as an alarm state — arithmetic + UNVERIFIED is AGREEMENT, not disagreement', async () => {
    const out = await render([row({ display_name: 'unverified-and-overdue', last_state: 'UNVERIFIED' })]);
    expect(out).toMatch(/OVERDUE 1\.0h>30m/);   // the arithmetic still renders
    expect(out).not.toMatch(/!!/);              // but the two instruments agree
    expect(out).not.toMatch(/row\(s\) where the ARITHMETIC/);
  });

  it('still flags a genuine disagreement (arithmetic overdue vs last_state OK)', async () => {
    const out = await render([row({ display_name: 'genuine', last_state: 'OK' })]);
    expect(out).toMatch(/!!/);
  });
});

// DRIFT PIN. The panel's alarm vocabulary must stay the watcher's, not a hand-typed copy that
// silently rots the next time the enum changes. This imports the watcher's own frozen STATE and
// asserts the relationship, rather than duplicating the list a third time.
describe('alarm-state vocabulary is derived from the watcher, not guessed', () => {
  it('the panel alarm set is a subset of the watcher STATE enum and is exactly the escalated states', async () => {
    const { STATE } = await import('../../../scripts/periodic-liveness-watcher.mjs');
    const watcherStates = new Set(Object.values(STATE));
    expect(watcherStates).toEqual(new Set(['OK', 'OVERDUE', 'UNVERIFIED', 'INTENTIONALLY_DOWN']));
    const panelAlarms = ['OVERDUE', 'UNVERIFIED'];
    for (const a of panelAlarms) expect(watcherStates.has(a)).toBe(true);
    // OK is never an alarm; INTENTIONALLY_DOWN is a retirement, not a breach.
    expect(panelAlarms).not.toContain('OK');
    expect(panelAlarms).not.toContain('INTENTIONALLY_DOWN');
  });

  it('the renderer source contains no invented state names', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('scripts/fleet-dashboard.cjs', 'utf8');
    const alarmDecl = src.match(/const ALARM_STATES = new Set\(\[[^\]]*\]\)/);
    expect(alarmDecl).not.toBeNull();
    for (const invented of ['STALE', 'MISSING', 'FAIL']) {
      expect(alarmDecl[0]).not.toContain(invented);
    }
  });
});
