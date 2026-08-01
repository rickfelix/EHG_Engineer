/**
 * Full-spectrum drive-state probe — core contract, composer and renderer.
 * SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-1 and FR-6.
 *
 * WHAT THESE GUARD. The SD detects things that report a state they have not established. The probe
 * built to do that can commit the same defect three ways, and each has a test here:
 *   - report CLEAR for an axis it cannot measure         -> UNMEASURABLE is closed and unfoldable
 *   - emit five axes and look complete                   -> the composer throws on a missing adapter
 *   - render nothing when it saw nothing                 -> the renderer refuses, loudly
 */

import { describe, it, expect } from 'vitest';
import { AXES, STATE, STATES, ACTION, ACTIONS, assertAxisEntry, summarise } from '../../../lib/governance/drive-state/contract.cjs';
import { computeDriveState } from '../../../lib/governance/drive-state/index.cjs';
import { renderDriveState, renderRefusal, safeCitation } from '../../../lib/governance/drive-state/render.cjs';

const NOW = Date.parse('2026-08-01T14:00:00.000Z');

function entry(axis, over = {}) {
  return { axis, state: STATE.CLEAR, citation: axis + ' checked', owed: 0, in_motion: 1, stalled: 0, action_taken: ACTION.NONE, ...over };
}
/** Adapters for all six axes, each pure and clock-injected. */
function adaptersAll(stateFor = () => STATE.CLEAR) {
  const map = {};
  for (const axis of AXES) map[axis] = { classify: () => entry(axis, { state: stateFor(axis) }) };
  return map;
}

describe('the six axes are frozen and the state set is closed', () => {
  it('names exactly the six chairman-ratified axes, in order', () => {
    expect(AXES).toEqual([
      'chairman_decisions', 'coordinator_performance', 'roadmap_motion',
      'venture_stage_motion', 'fleet_health', 'learning_conversion'
    ]);
    expect(Object.isFrozen(AXES)).toBe(true);
  });

  it('asserts the state set DIRECTLY — a not.toContain check cannot catch an omission', () => {
    expect([...STATES].sort()).toEqual(['CLEAR', 'STALLED', 'UNMEASURABLE']);
    expect([...ACTIONS].sort()).toEqual(['NONE', 'RECORDED', 'UNVERIFIABLE']);
  });
});

describe('a partial verdict is impossible by construction', () => {
  it('THROWS when any single adapter is missing, rather than emitting five axes', async () => {
    for (const missing of AXES) {
      const adapters = adaptersAll();
      delete adapters[missing];
      await expect(computeDriveState({ adapters, now: NOW })).rejects.toThrow(new RegExp(missing));
    }
  });

  it('a missing adapter is NOT quietly synthesised as UNMEASURABLE', async () => {
    // An axis nobody wired and an axis that genuinely cannot be measured are different facts.
    // Collapsing them would hide a build error inside an honest-looking state.
    const adapters = adaptersAll();
    delete adapters.fleet_health;
    await expect(computeDriveState({ adapters, now: NOW })).rejects.toThrow(/refusing to emit a partial verdict/);
  });

  it('returns exactly six entries when all adapters are present', async () => {
    const v = await computeDriveState({ adapters: adaptersAll(), now: NOW });
    expect(v.axes).toHaveLength(6);
    expect(v.axes.map((a) => a.axis)).toEqual([...AXES]);
  });
});

describe('UNMEASURABLE is not CLEAR, and cannot be folded into it', () => {
  it('summarise reports THREE separate counts', () => {
    const entries = [
      entry('a'), entry('b'),
      entry('c', { state: STATE.STALLED }),
      entry('d', { state: STATE.UNMEASURABLE, reason: 'x' })
    ];
    expect(summarise(entries)).toEqual({ clear: 2, stalled: 1, unmeasurable: 1 });
  });

  it('the module exports NO allClear boolean — the fold has nothing to attach to', async () => {
    // THE DEFENCE IS STRUCTURAL. A reviewer defeated the first design with
    // axes.filter(a => a.state !== 'STALLED').length === 6, which merges CLEAR and UNMEASURABLE and
    // reads as "all six checked, none stalled". The original criterion — that no consumer helper may
    // count UNMEASURABLE as clear — cannot be quantified over helpers that do not exist yet, so
    // instead there is simply no boolean to reach for.
    const contract = await import('../../../lib/governance/drive-state/contract.cjs');
    const exported = Object.keys(contract.default || contract);
    expect(exported).not.toContain('allClear');
    expect(exported).not.toContain('isAllClear');
    const s = summarise([entry('a', { state: STATE.UNMEASURABLE, reason: 'r' })]);
    expect(s.clear).toBe(0);          // an unmeasurable axis contributes ZERO to clear
    expect(s.unmeasurable).toBe(1);
  });

  it('UNMEASURABLE without a reason token is rejected', () => {
    expect(() => assertAxisEntry(entry('a', { state: STATE.UNMEASURABLE }), 'a')).toThrow(/requires a reason token/);
  });

  it('a citation is required on EVERY state, not only on UNMEASURABLE', () => {
    for (const state of STATES) {
      const e = entry('a', { state, citation: '  ', reason: 'r' });
      expect(() => assertAxisEntry(e, 'a'), state).toThrow(/citation is required/);
    }
  });
});

describe('a throwing adapter is UNMEASURABLE, never CLEAR', () => {
  it('fails toward could-not-see rather than toward health', async () => {
    const adapters = adaptersAll();
    adapters.roadmap_motion = { fetch: async () => { throw new Error('db exploded'); }, classify: () => entry('roadmap_motion') };
    const v = await computeDriveState({ adapters, now: NOW });
    const axis = v.axes.find((a) => a.axis === 'roadmap_motion');
    expect(axis.state).toBe(STATE.UNMEASURABLE);
    expect(axis.reason).toBe('adapter_threw');
    expect(axis.citation).toMatch(/db exploded/);
    expect(v.summary.clear).toBe(5);
    expect(v.summary.unmeasurable).toBe(1);
  });
});

describe('action_taken is a closed domain and is verified', () => {
  it('rejects a value outside the set', () => {
    expect(() => assertAxisEntry(entry('a', { action_taken: 'DONE' }), 'a')).toThrow(/action_taken/);
  });

  it('RECORDED without an action_citation is rejected — the field that reads as evidence must carry some', () => {
    expect(() => assertAxisEntry(entry('a', { action_taken: ACTION.RECORDED }), 'a')).toThrow(/action_citation/);
  });

  it('there is deliberately no DONE value — action_taken cannot compel a row into existence', () => {
    // Per the drain-descriptor prohibition: forcing judgment work to emit rows so a counter can see
    // it is forbidden. RECORDED must point at an artifact that already exists; otherwise UNVERIFIABLE.
    expect(ACTIONS).not.toContain('DONE');
    expect(ACTIONS).toContain('UNVERIFIABLE');
  });
});

describe('the renderer REFUSES an incomplete verdict', () => {
  it('refuses when an axis is absent', () => {
    const v = { measured_at: 'now', axes: AXES.slice(0, 5).map((a) => entry(a)) };
    expect(() => renderDriveState(v)).toThrow(/incomplete verdict/);
  });

  it('refuses when any axis lacks a citation or an action_taken', () => {
    for (const missing of ['citation', 'action_taken']) {
      const axes = AXES.map((a) => entry(a));
      delete axes[3][missing];
      expect(() => renderDriveState({ measured_at: 'now', axes }), missing).toThrow(/incomplete verdict/);
    }
  });

  it('an ALL-CLEAR render still names all six axes with their citations', async () => {
    const v = await computeDriveState({ adapters: adaptersAll(), now: NOW });
    const out = renderDriveState(v).join('\n');
    for (const axis of AXES) expect(out).toContain(axis);
    expect(out).toContain('axes=6');
    expect(out).toContain('clear=6');
    expect(out).toContain('unmeasurable=0');
  });

  it('an all-UNMEASURABLE render is DISTINGUISHABLE from an all-clear one', async () => {
    // UNMEASURABLE requires a reason, so the fixture must supply one — the contract caught this
    // fixture bug when it was written without, which is the assertion working as intended.
    const map = {};
    for (const axis of AXES) map[axis] = { classify: () => entry(axis, { state: STATE.UNMEASURABLE, reason: 'inputs_broken' }) };
    const blind = await computeDriveState({ adapters: map, now: NOW });
    // adaptersAll builds UNMEASURABLE entries without a reason, so supply one via a fresh map
    const out = renderDriveState(blind).join('\n');
    expect(out).toContain('unmeasurable=6');
    expect(out).toMatch(/could not see those axes, NOT that they are moving/);
  });

  it('renderRefusal is LOUD and says explicitly that it is not an all-clear', () => {
    const out = renderRefusal(new Error('missing roadmap_motion')).join('\n');
    expect(out).toMatch(/REFUSED/);
    expect(out).toMatch(/NOT an all-clear/);
  });
});

describe('citations are bounded and control-stripped — the chairman population is anon-writable', () => {
  it('strips ANSI, BEL and NUL and bounds the length', () => {
    const ESC = String.fromCharCode(27), BEL = String.fromCharCode(7), NUL = String.fromCharCode(0);
    const evil = 'ok' + ESC + '[31mRED' + BEL + 'bell' + NUL + 'nul' + 'x'.repeat(300);
    const out = safeCitation(evil);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.includes(ESC), 'ESC must be stripped').toBe(false);
    expect(out.includes(BEL), 'BEL must be stripped').toBe(false);
    expect(out.includes(NUL), 'NUL must be stripped').toBe(false);
    expect(out).toContain('ok');
  });
});
