/**
 * SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001 — the WIRING, executed rather than grepped.
 *
 * WHY THIS FILE EXISTS. The persist call was originally inline in reportDriveState and "covered" by
 * two regexes over that file's own source text. A mutation review then dead-coded the call —
 * `if (false) await persistDriveState(...)` — and it SURVIVED the entire unit project: 3063 files,
 * 37,365 tests, all green. It is silent in production too: no write, no banner, nothing. Two more
 * mutations survived the same way (writing to a wrong table, and taking a second clock reading for
 * run_id instead of reusing measured_at).
 *
 * That is this SD's own thesis — "an axis can sit stalled indefinitely while every hourly render
 * reads as normal" — reproduced one layer down, inside the fix written to remove it. A REGEX PINS A
 * STATEMENT FORM; ONLY AN EXECUTED TEST PINS THE DATA FLOW. So the block was extracted into an
 * exported function and this file calls it for real.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { persistRenderedVerdict } = require_('../../../scripts/coordinator-hourly-review.cjs');
const { AXES, STATE, ACTION } = require_('../../../lib/governance/drive-state/contract.cjs');

/** Captures the table AND the rows, so a wrong-table write is visible rather than silently green. */
function captureClient({ failWith = null } = {}) {
  const calls = { tables: [], rows: null };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      return {
        insert(rows) {
          calls.rows = rows;
          return { select: () => Promise.resolve(failWith ? { data: null, error: failWith } : { data: rows, error: null }) };
        },
      };
    },
  };
}

const MEASURED_AT = '2026-08-08T16:00:00.000Z';
const verdict = (over = {}) => ({
  axes: AXES.map((axis) => ({
    axis, state: STATE.CLEAR, citation: `${axis} checked`, action_taken: ACTION.NONE,
    owed: null, in_motion: null, stalled: null, reason: null,
  })),
  summary: { clear: 6, stalled: 0, unmeasurable: 0 },
  measured_at: MEASURED_AT,
  ...over,
});

describe('[EXECUTED WIRING] the hourly review actually writes the verdict it rendered', () => {
  it('[KILLS THE DEAD-CODE MUTATION] a rendered verdict results in six rows being inserted', async () => {
    // The mutation that survived 37,365 tests was making this call unreachable. This test calls the
    // real exported function and asserts the WRITE HAPPENED — not that a string appears in a file.
    const c = captureClient();
    const res = await persistRenderedVerdict(verdict(), c);
    expect(res.persisted).toBe(true);
    expect(c.calls.rows).toHaveLength(6);
    expect(res.written).toBe(6);
  });

  it('[KILLS THE WRONG-TABLE MUTATION] the rows land on drive_state_verdicts', async () => {
    const c = captureClient();
    await persistRenderedVerdict(verdict(), c);
    expect(c.calls.tables).toContain('drive_state_verdicts');
  });

  it('[KILLS THE SECOND-CLOCK-READ MUTATION] run_id IS the verdict measured_at, not a fresh timestamp', async () => {
    // The inline comment claimed this; nothing enforced it. A second clock read would stamp the six
    // rows a moment after the verdict they came from, so the history and the report would disagree
    // about when the reading happened — and no test would have noticed.
    const c = captureClient();
    await persistRenderedVerdict(verdict(), c);
    expect(c.calls.rows.every((r) => r.run_id === MEASURED_AT)).toBe(true);
  });

  it('[KILLS THE WRONG-FIELD MUTATION] reading entries instead of axes yields no write at all', async () => {
    // A verdict shaped with `entries` (the field that does NOT exist on the real return) must not
    // silently succeed — the guard has to see the absence.
    const c = captureClient();
    const res = await persistRenderedVerdict({ entries: verdict().axes, measured_at: MEASURED_AT }, c);
    expect(res.persisted).toBe(false);
    expect(c.calls.rows).toBeNull();
  });

  it('the six rows carry every axis exactly once, with the state and citation intact', async () => {
    const c = captureClient();
    const v = verdict();
    v.axes[1].state = STATE.STALLED;
    v.axes[2].state = STATE.UNMEASURABLE;
    v.axes[2].reason = 'no_cohort';
    await persistRenderedVerdict(v, c);
    expect(c.calls.rows.map((r) => r.axis).sort()).toEqual([...AXES].sort());
    const byAxis = Object.fromEntries(c.calls.rows.map((r) => [r.axis, r]));
    expect(byAxis[AXES[1]].state).toBe('STALLED');
    expect(byAxis[AXES[2]].state).toBe('UNMEASURABLE');
    expect(byAxis[AXES[2]].reason).toBe('no_cohort');
    expect(c.calls.rows.every((r) => typeof r.citation === 'string' && r.citation.length > 0)).toBe(true);
  });
});

describe('[TS-3, executed] a write failure is REPORTED, never silent', () => {
  it('returns write_failed and does not throw out of the review', async () => {
    // The render already happened before this point; a persistence failure must not take the whole
    // hourly review down, but it must also not be invisible. Both halves asserted.
    const c = captureClient({ failWith: { code: '42P01', message: 'relation does not exist' } });
    const res = await persistRenderedVerdict(verdict(), c);
    expect(res.persisted).toBe(false);
    expect(res.reason).toBe('write_failed');
    expect(String(res.error)).toMatch(/durable write failed/);
  });

  it('[CONTROL] the success path does NOT report a failure — the signal is two-sided', async () => {
    const res = await persistRenderedVerdict(verdict(), captureClient());
    expect(res.persisted).toBe(true);
    expect(res.reason).toBeUndefined();
  });
});

describe('a missing or refused verdict writes nothing', () => {
  it('a null verdict (the render-refusal path) does not attempt a write', async () => {
    const c = captureClient();
    const res = await persistRenderedVerdict(null, c);
    expect(res.persisted).toBe(false);
    expect(res.reason).toBe('no_verdict');
    expect(c.calls.tables).toHaveLength(0);
  });
});

/**
 * SD-LEO-INFRA-DRIVE-STATE-FORCING-001 — the forcing wiring, EXECUTED at the exported seam.
 * runDriveStateSection is dependency-injected precisely so this file can run the real
 * orchestration (compute → read-history → compose → persist → emit → meta-control) and pin the
 * DATA FLOW and CALL ORDER, not a statement form a dead-code mutation would survive.
 */
describe('[FORCING, executed] runDriveStateSection wires history-before-persist, emission and the meta-control', () => {
  const { runDriveStateSection } = require_('../../../scripts/coordinator-hourly-review.cjs');

  const stalledVerdict = () => {
    const v = verdict();
    v.axes[4].state = STATE.STALLED; // fleet_health
    return v;
  };

  function harness({ compute, emit, readHistory } = {}) {
    const order = [];
    const logs = [];
    const deps = {
      compute: compute || (async () => { order.push('compute'); return stalledVerdict(); }),
      readHistory: readHistory || (async () => { order.push('readHistory'); return { spans: [], priorNewest: null }; }),
      persist: async () => { order.push('persist'); return { persisted: true }; },
      emit: emit || (async (owed) => {
        order.push('emit');
        return owed.map((oa, i) => ({ id: i + 1, payload: { owed_axis: oa.axis } }));
      }),
      log: (l) => logs.push(String(l)),
    };
    return { order, logs, deps };
  }

  it('[FR-6 ORDER] history is read BEFORE the persist — read after, the stale-basis guard can never fire', async () => {
    const { order, deps } = harness();
    const res = await runDriveStateSection({}, deps);
    expect(order.indexOf('readHistory')).toBeGreaterThan(-1);
    expect(order.indexOf('readHistory'), 'readHistory must precede persist').toBeLessThan(order.indexOf('persist'));
    expect(res.forcing).toBe('ok');
  });

  it('[FR-1 executed] a stalled axis flows compute → derive → emit, and the meta-control passes on a faithful readback', async () => {
    const { order, logs, deps } = harness();
    const res = await runDriveStateSection({}, deps);
    expect(order).toEqual(['compute', 'readHistory', 'persist', 'emit']);
    expect(res.owedActions).toHaveLength(1);
    expect(res.owedActions[0].axis).toBe('fleet_health');
    const out = logs.join('\n');
    expect(out).toContain('OWED-ACTION');
    expect(out, 'the summary tail must be withheld while an action is owed').not.toContain('  axes=');
  });

  it('[FR-5 PLANTED MISS, executed] an emission that silently drops the owed-action produces the LOUD forcing banner', async () => {
    const { logs, deps } = harness({ emit: async () => [] }); // computed, stalled, emitted NOTHING
    const res = await runDriveStateSection({}, deps);
    expect(res.forcing).toBe('miss');
    const out = logs.join('\n');
    expect(out).toContain('DRIVE-STATE FORCING-FUNCTION — MISS OR EMISSION FAILURE');
    expect(out).toContain('DRIVE_STATE_FORCING_MISS');
    expect(out).toContain('fleet_health');
    expect(out).toContain('NOT all-green');
  });

  it('[CONTROL] nothing stalled → no owed-actions, no miss banner, byte-normal tail', async () => {
    const { logs, deps } = harness({ compute: async () => verdict() });
    const res = await runDriveStateSection({}, deps);
    expect(res.forcing).toBe('ok');
    expect(res.owedActions).toHaveLength(0);
    const out = logs.join('\n');
    expect(out).toContain('  axes=');
    expect(out).not.toContain('OWED-ACTION');
    expect(out).not.toContain('FORCING-FUNCTION — MISS');
  });

  it('[REFUSAL PATH] a compute failure renders the refusal banner and never reaches persist or emit', async () => {
    const { order, logs, deps } = harness({ compute: async () => { throw new Error('probe down'); } });
    const res = await runDriveStateSection({}, deps);
    expect(res.forcing).toBe('refused');
    expect(order).not.toContain('persist');
    expect(order).not.toContain('emit');
    expect(logs.join('\n')).toContain('NOT an all-clear');
  });

  it('[HISTORY-READ FAILURE] a spans read failure refuses loudly rather than composing on a blind basis', async () => {
    const { order, logs, deps } = harness({ readHistory: async () => { throw new Error('history unreachable'); } });
    const res = await runDriveStateSection({}, deps);
    expect(res.forcing).toBe('refused');
    expect(logs.join('\n')).toContain('history unreachable');
    expect(order).not.toContain('persist');
  });
});
