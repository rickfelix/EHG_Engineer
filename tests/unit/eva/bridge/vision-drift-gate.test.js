/**
 * SD-LEO-INFRA-STAGE-VISION-ARTIFACT-001 (FR-1, FR-5, FR-6) — the pure vision-drift classifier + the
 * single hold/cause decision + the flag helpers + the static guardrail. These truth tables are the
 * keystone the worker S19 drift seam (FR-2) consumes. DR-1..DR-15, DR-24 from the PRD test_scenarios.
 *
 * Deliberately diverges from vision-acceptance-gate.test.js on the two prospective-testing findings:
 * NOT_EVALUATED fails OPEN by default (D1) and there is NO buildComplete short-circuit (D7).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  classifyVisionDrift,
  shouldHoldForVisionDrift,
  isVisionDriftGateEnabled,
  isVisionDriftStrict,
  VISION_DRIFT,
  DRIFT_HOLD_CAUSE,
} from '../../../../lib/eva/bridge/vision-drift-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = resolve(__dirname, '../../../../lib/eva/bridge/vision-drift-gate.js');
const D = VISION_DRIFT;
const C = DRIFT_HOLD_CAUSE;

describe('classifyVisionDrift (DR-1..DR-6)', () => {
  it('DR-1: { material_drift:true } → MATERIAL_DRIFT', () => {
    expect(classifyVisionDrift({ material_drift: true })).toBe(D.MATERIAL_DRIFT);
  });
  it('DR-2: { material_drift:false } → NO_DRIFT', () => {
    expect(classifyVisionDrift({ material_drift: false })).toBe(D.NO_DRIFT);
  });
  it('DR-3: undefined → NOT_EVALUATED (load-bearing — keeps the gate fail-open on the headless path)', () => {
    expect(classifyVisionDrift(undefined)).toBe(D.NOT_EVALUATED);
  });
  it('DR-4: null / {} / non-boolean material_drift → NOT_EVALUATED (never coerced to NO_DRIFT)', () => {
    expect(classifyVisionDrift(null)).toBe(D.NOT_EVALUATED);
    expect(classifyVisionDrift({})).toBe(D.NOT_EVALUATED);
    expect(classifyVisionDrift({ material_drift: 'true' })).toBe(D.NOT_EVALUATED); // string is not boolean
    expect(classifyVisionDrift({ material_drift: 1 })).toBe(D.NOT_EVALUATED);
  });
  it('DR-5: { board_unavailable:true } → BOARD_UNAVAILABLE (checked before drift; material value untrusted)', () => {
    expect(classifyVisionDrift({ board_unavailable: true })).toBe(D.BOARD_UNAVAILABLE);
    expect(classifyVisionDrift({ board_unavailable: true, material_drift: false })).toBe(D.BOARD_UNAVAILABLE);
  });
  it('DR-6: { packet_incomplete:true } → PACKET_INCOMPLETE (checked before drift)', () => {
    expect(classifyVisionDrift({ packet_incomplete: true })).toBe(D.PACKET_INCOMPLETE);
    expect(classifyVisionDrift({ packet_incomplete: true, material_drift: true })).toBe(D.PACKET_INCOMPLETE);
  });
});

describe('shouldHoldForVisionDrift (DR-7..DR-13b)', () => {
  it('DR-7: MATERIAL_DRIFT → HOLD, cause=chairman (any enforce)', () => {
    for (const enforce of [true, false]) {
      expect(shouldHoldForVisionDrift({ verdict: { material_drift: true }, enforce }))
        .toEqual({ hold: true, cause: C.CHAIRMAN, outcome: D.MATERIAL_DRIFT });
    }
  });
  it('DR-8: NO_DRIFT → no-hold', () => {
    expect(shouldHoldForVisionDrift({ verdict: { material_drift: false } }))
      .toEqual({ hold: false, cause: C.NONE, outcome: D.NO_DRIFT });
  });
  it('DR-9: NOT_EVALUATED + enforce=false → no-hold (the D1 deadlock-avoidance — absent verdict must not brick builds)', () => {
    expect(shouldHoldForVisionDrift({ verdict: undefined, enforce: false }))
      .toEqual({ hold: false, cause: C.NONE, outcome: D.NOT_EVALUATED });
    expect(shouldHoldForVisionDrift({ verdict: null }).hold).toBe(false); // default enforce=false
  });
  it('DR-10: NOT_EVALUATED + enforce=true → HOLD (cause=unevaluated, non-chairman)', () => {
    expect(shouldHoldForVisionDrift({ verdict: undefined, enforce: true }))
      .toEqual({ hold: true, cause: C.UNEVALUATED, outcome: D.NOT_EVALUATED });
  });
  it('DR-11: BOARD_UNAVAILABLE → HOLD, cause=transient (never chairman), both enforce values', () => {
    for (const enforce of [true, false]) {
      expect(shouldHoldForVisionDrift({ verdict: { board_unavailable: true }, enforce }))
        .toEqual({ hold: true, cause: C.TRANSIENT, outcome: D.BOARD_UNAVAILABLE });
    }
  });
  it('DR-12: PACKET_INCOMPLETE → HOLD, cause=transient (never chairman)', () => {
    expect(shouldHoldForVisionDrift({ verdict: { packet_incomplete: true } }))
      .toEqual({ hold: true, cause: C.TRANSIENT, outcome: D.PACKET_INCOMPLETE });
  });
  it('DR-13: full parity sweep — every classification × enforce', () => {
    const cases = [
      { v: { material_drift: true }, cls: D.MATERIAL_DRIFT },
      { v: { material_drift: false }, cls: D.NO_DRIFT },
      { v: undefined, cls: D.NOT_EVALUATED },
      { v: { board_unavailable: true }, cls: D.BOARD_UNAVAILABLE },
      { v: { packet_incomplete: true }, cls: D.PACKET_INCOMPLETE },
    ];
    for (const { v, cls } of cases) {
      for (const enforce of [true, false]) {
        const { hold } = shouldHoldForVisionDrift({ verdict: v, enforce });
        let expected;
        if (cls === D.MATERIAL_DRIFT || cls === D.BOARD_UNAVAILABLE || cls === D.PACKET_INCOMPLETE) expected = true;
        else if (cls === D.NOT_EVALUATED) expected = enforce === true;
        else expected = false; // NO_DRIFT
        expect(hold, `cls=${cls} enforce=${enforce}`).toBe(expected);
      }
    }
  });
  it('DR-13b: NO buildComplete short-circuit (D7) — an extraneous buildComplete:false does not unhold MATERIAL_DRIFT', () => {
    // The function signature has no buildComplete; passing it must be inert (would be the #4163 bug on the input side).
    expect(shouldHoldForVisionDrift({ verdict: { material_drift: true }, buildComplete: false }).hold).toBe(true);
  });
  it('default args do not throw and yield no-hold', () => {
    expect(shouldHoldForVisionDrift().hold).toBe(false);
    expect(shouldHoldForVisionDrift({}).hold).toBe(false);
  });
});

describe('flag helpers (DR-14, DR-15) — hermetic env, both default OFF', () => {
  let savedGate, savedStrict;
  beforeEach(() => {
    savedGate = process.env.VISION_DRIFT_GATE; savedStrict = process.env.VISION_DRIFT_STRICT;
    delete process.env.VISION_DRIFT_GATE; delete process.env.VISION_DRIFT_STRICT;
  });
  afterEach(() => {
    if (savedGate === undefined) delete process.env.VISION_DRIFT_GATE; else process.env.VISION_DRIFT_GATE = savedGate;
    if (savedStrict === undefined) delete process.env.VISION_DRIFT_STRICT; else process.env.VISION_DRIFT_STRICT = savedStrict;
  });

  it('DR-14: VISION_DRIFT_GATE default OFF (unset/empty/false/0/off/no); ON only for true/1/on/yes', () => {
    expect(isVisionDriftGateEnabled()).toBe(false); // unset → OFF (new gate ships dark)
    process.env.VISION_DRIFT_GATE = '';
    expect(isVisionDriftGateEnabled()).toBe(false); // empty → OFF
    for (const off of ['false', '0', 'off', 'no', 'FALSE']) {
      process.env.VISION_DRIFT_GATE = off;
      expect(isVisionDriftGateEnabled(), off).toBe(false);
    }
    for (const on of ['true', '1', 'on', 'yes', 'TRUE', 'On']) {
      process.env.VISION_DRIFT_GATE = on;
      expect(isVisionDriftGateEnabled(), on).toBe(true);
    }
  });

  it('DR-15: VISION_DRIFT_STRICT default OFF (unset/false); ON for true/1/on/yes', () => {
    expect(isVisionDriftStrict()).toBe(false); // unset → OFF (avoids the D1 deadlock)
    process.env.VISION_DRIFT_STRICT = 'false';
    expect(isVisionDriftStrict()).toBe(false);
    for (const on of ['true', '1', 'on', 'yes', 'TRUE', 'On']) {
      process.env.VISION_DRIFT_STRICT = on;
      expect(isVisionDriftStrict(), on).toBe(true);
    }
  });
});

describe('static never-advance + session-only guardrail (DR-24)', () => {
  it('DR-24: vision-drift-gate.js source has zero advance/stage/chairman/vision-write tokens and no cron entrypoint', () => {
    const src = readFileSync(LIB_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/_advanceStage/);
    expect(src).not.toMatch(/current_lifecycle_stage\s*:/);
    expect(src).not.toMatch(/chairman_decisions|chairman_approved\s*:/);
    expect(src).not.toMatch(/advance_venture_stage/);
    // session-only: the pure gate must carry no scheduler/cron entrypoint (the producer guardrail extends this)
    expect(src).not.toMatch(/setInterval\(|cron\.schedule|node-cron/);
  });
});
