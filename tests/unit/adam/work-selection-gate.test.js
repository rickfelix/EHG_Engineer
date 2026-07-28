/**
 * SD-LEO-INFRA-ADAM-WORK-SELECTION-001 / FR-3 + TS-5.
 *
 * TESTING flagged the original TS-5 as satisfiable by a grep-guard or an import smoke test, both of
 * which pass on dead code — and noted the precedent this gate copies (checkAdamOutbound) is itself
 * only classifier-tested and never asserts it is REACHED. So these tests execute the classifier's
 * real behaviour, and the wiring test below asserts the persisted record actually carries the
 * evaluation rather than that the module merely imports.
 */
import { describe, it, expect } from 'vitest';
import { evaluateWorkSelection, isPlanLinked, injectionKind } from '../../../lib/adam/work-selection-gate.js';
import { buildRankPatch } from '../../../scripts/coordinator-backlog-rank.mjs';

const linked = (key, over = {}) => ({ sd_key: key, metadata: { wave_id: 'w-1', ...over } });
const plain = (key, over = {}) => ({ sd_key: key, metadata: { ...over } });

describe('FR-3: plan-linkage is read from evidence on the row', () => {
  it('recognises every roadmap marker, and source-based linkage', () => {
    for (const md of [{ wave_id: 'w' }, { roadmap_item_id: 'r' }, { promoted_from_roadmap: true },
      { plan_key: 'p' }, { wave_disposition: 'selected' }, { source: 'plan' }, { source: 'roadmap_item' }]) {
      expect(isPlanLinked({ sd_key: 'SD-X', metadata: md })).toBe(true);
    }
    expect(isPlanLinked(plain('SD-X'))).toBe(false);
    expect(isPlanLinked(undefined)).toBe(false);
  });

  it('names the LEGITIMATE injection reasons rather than treating them as violations', () => {
    expect(injectionKind(plain('SD-X', { provenance: 'chairman directive' }))).toBe('chairman-directed');
    expect(injectionKind(plain('SD-FDBK-X-001'))).toBe('feedback');
    expect(injectionKind(plain('SD-X', { provenance: 'rca corrective' }))).toBe('incident');
    expect(injectionKind(plain('SD-X'))).toBeNull(); // unexplained
  });
});

describe('FR-3: the gate NAMES WHAT INJECTION DISPLACES', () => {
  it('counts the plan-linked work an unlinked item outranks — that is the whole measurement', () => {
    const r = evaluateWorkSelection([plain('SD-INJECT-1'), linked('SD-PLAN-1'), linked('SD-PLAN-2')]);
    const injected = r.evaluations.find((e) => e.sd_key === 'SD-INJECT-1');
    expect(injected.displaces).toBe(2);
    expect(injected.displaced_sample).toEqual(['SD-PLAN-1', 'SD-PLAN-2']);
    expect(r.verdict).toBe('warn');
    expect(r.reasons[0]).toMatch(/ranked #1 .*displacing 2 plan-linked/);
  });

  it('an unexplained injection that displaces NOTHING is not reported — it costs nothing', () => {
    // Guards against a gate that cries wolf on every non-roadmap item regardless of rank.
    const r = evaluateWorkSelection([linked('SD-PLAN-1'), plain('SD-INJECT-1')]);
    expect(r.evaluations.find((e) => e.sd_key === 'SD-INJECT-1').displaces).toBe(0);
    expect(r.verdict).toBe('pass');
    expect(r.reasons).toEqual([]);
  });

  it('a STATED injection reason displaces legitimately and is not flagged', () => {
    // Injecting higher-priority work is explicitly permitted. The gate records it, does not object.
    const r = evaluateWorkSelection([plain('SD-CHAIR-1', { provenance: 'chairman' }), linked('SD-PLAN-1')]);
    const e = r.evaluations.find((x) => x.sd_key === 'SD-CHAIR-1');
    expect(e.injection_kind).toBe('chairman-directed');
    expect(e.displaces).toBe(1); // the displacement is still MEASURED...
    expect(r.verdict).toBe('pass'); // ...but it is explained, so it is not a finding
  });

  it('says plainly when NOTHING on the belt is plan-linked (the measured 2026-07-28 state)', () => {
    const r = evaluateWorkSelection([plain('SD-A'), plain('SD-B')]);
    expect(r.checks).toMatchObject({ total: 2, plan_linked: 0, injected: 2, plan_linked_share: 0 });
    expect(r.reasons.some((x) => /NO plan-linked work on the belt at all/.test(x))).toBe(true);
  });

  it('an empty belt is a pass, not a warn (no work is not a plan violation)', () => {
    expect(evaluateWorkSelection([])).toMatchObject({ verdict: 'pass', reasons: [] });
    expect(evaluateWorkSelection(null).verdict).toBe('pass');
  });
});

describe('FR-3 / TS-5: the evaluation is PERSISTED, not just logged', () => {
  it('buildRankPatch carries the evaluation into the rank write', () => {
    // Pinned through the REAL write-path builder. A log line is gone by the next tick; "what
    // displaced the plan" is asked days later, so it has to be on the row.
    const evaluation = { sd_key: 'SD-INJECT-1', rank: 1, plan_linked: false, injection_kind: null, displaces: 3 };
    const patch = buildRankPatch(1, '2026-07-28T00:00:00Z', 'sess-1', 'unclassified', evaluation);
    expect(patch.work_selection).toEqual({
      plan_linked: false, injection_kind: null, displaces: 3, evaluated_at: '2026-07-28T00:00:00Z',
    });
    expect(patch.dispatch_reason_band).toBe('unclassified');
  });

  it('omits work_selection entirely when no evaluation was produced (gate failed open)', () => {
    // The fail-open contract: a gate error must leave ranking untouched, not write a misleading
    // half-record that a later reader would take as "evaluated, found nothing".
    const patch = buildRankPatch(1, '2026-07-28T00:00:00Z', 'sess-1', 'feedback', null);
    expect(patch.work_selection).toBeUndefined();
    expect(patch.dispatch_rank).toBe(1);
  });
});
