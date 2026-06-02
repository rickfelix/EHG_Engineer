/**
 * SD-LEO-INFRA-VISION-GROUNDED-ACCEPTANCE-001 (FR-1) — the pure vision-acceptance classifier + the
 * single hold/advance decision + the flag helpers. These truth tables are the keystone the worker
 * S19 gate (FR-2) consumes, so a regression here is a regression everywhere. VA-1..VA-12, VA-23,
 * VA-26, VA-27 from the PRD test_scenarios.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  classifyVisionAcceptance,
  shouldHoldForVisionAcceptance,
  isVisionAcceptanceGateEnabled,
  isVisionAcceptanceStrict,
  VISION_ACCEPTANCE,
} from '../../../../lib/eva/bridge/vision-acceptance-gate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_PATH = resolve(__dirname, '../../../../lib/eva/bridge/vision-acceptance-gate.js');
const A = VISION_ACCEPTANCE;

describe('classifyVisionAcceptance (VA-1..VA-5)', () => {
  it('VA-1: { pass:true } → VERIFIED_PASS', () => {
    expect(classifyVisionAcceptance({ pass: true })).toBe(A.VERIFIED_PASS);
  });
  it('VA-2: { pass:false } → VERIFIED_GAPS', () => {
    expect(classifyVisionAcceptance({ pass: false })).toBe(A.VERIFIED_GAPS);
  });
  it('VA-3: undefined → NOT_EVALUATED', () => {
    expect(classifyVisionAcceptance(undefined)).toBe(A.NOT_EVALUATED);
  });
  it('VA-4: null / {} / non-boolean pass → NOT_EVALUATED (never coerced to PASS — load-bearing)', () => {
    expect(classifyVisionAcceptance(null)).toBe(A.NOT_EVALUATED);
    expect(classifyVisionAcceptance({})).toBe(A.NOT_EVALUATED);
    expect(classifyVisionAcceptance({ pass: 'true' })).toBe(A.NOT_EVALUATED); // string is not boolean true
    expect(classifyVisionAcceptance({ pass: 1 })).toBe(A.NOT_EVALUATED);
  });
  it('VA-5: explicit { no_vision:true } marker → NO_VISION (checked before pass)', () => {
    expect(classifyVisionAcceptance({ no_vision: true })).toBe(A.NO_VISION);
    expect(classifyVisionAcceptance({ no_vision: true, pass: false })).toBe(A.NO_VISION);
  });
});

describe('shouldHoldForVisionAcceptance (VA-6..VA-12)', () => {
  it('VA-6: VERIFIED_GAPS → HOLD (any strict, buildComplete=true)', () => {
    expect(shouldHoldForVisionAcceptance({ verdict: { pass: false }, buildComplete: true, strict: false })).toBe(true);
    expect(shouldHoldForVisionAcceptance({ verdict: { pass: false }, buildComplete: true, strict: true })).toBe(true);
  });
  it('VA-7: VERIFIED_PASS → no-hold', () => {
    expect(shouldHoldForVisionAcceptance({ verdict: { pass: true }, buildComplete: true })).toBe(false);
  });
  it('VA-8: NOT_EVALUATED + strict=false → no-hold (fail-open)', () => {
    expect(shouldHoldForVisionAcceptance({ verdict: undefined, buildComplete: true, strict: false })).toBe(false);
  });
  it('VA-9: NO_VISION → no-hold (defer to existing VISION_MISSING gate)', () => {
    expect(shouldHoldForVisionAcceptance({ verdict: { no_vision: true }, buildComplete: true, strict: true })).toBe(false);
  });
  it('VA-10: NOT_EVALUATED + strict=true → HOLD', () => {
    expect(shouldHoldForVisionAcceptance({ verdict: undefined, buildComplete: true, strict: true })).toBe(true);
    expect(shouldHoldForVisionAcceptance({ verdict: null, buildComplete: null, strict: true })).toBe(true);
  });
  it('VA-11: buildComplete=false → no-hold even for VERIFIED_GAPS (only complete builds are verified)', () => {
    expect(shouldHoldForVisionAcceptance({ verdict: { pass: false }, buildComplete: false, strict: true })).toBe(false);
    expect(shouldHoldForVisionAcceptance({ verdict: undefined, buildComplete: false, strict: true })).toBe(false);
  });
  it('VA-12: full parity sweep — every classification × strict × buildComplete', () => {
    const verdicts = [
      { v: { pass: true }, cls: A.VERIFIED_PASS },
      { v: { pass: false }, cls: A.VERIFIED_GAPS },
      { v: undefined, cls: A.NOT_EVALUATED },
      { v: { no_vision: true }, cls: A.NO_VISION },
    ];
    for (const { v, cls } of verdicts) {
      for (const strict of [true, false]) {
        for (const buildComplete of [true, false, null]) {
          const got = shouldHoldForVisionAcceptance({ verdict: v, buildComplete, strict });
          let expected;
          if (buildComplete === false) expected = false;          // incomplete build never holds here
          else if (cls === A.VERIFIED_GAPS) expected = true;
          else if (cls === A.NOT_EVALUATED) expected = strict === true;
          else expected = false;                                  // VERIFIED_PASS / NO_VISION
          expect(got, `cls=${cls} strict=${strict} buildComplete=${buildComplete}`).toBe(expected);
        }
      }
    }
  });
  it('default args do not throw and yield no-hold', () => {
    expect(shouldHoldForVisionAcceptance()).toBe(false);
    expect(shouldHoldForVisionAcceptance({})).toBe(false);
  });
});

describe('flag helpers (VA-26, VA-27) — hermetic env', () => {
  let savedGate, savedStrict;
  beforeEach(() => { savedGate = process.env.VISION_ACCEPTANCE_GATE; savedStrict = process.env.VISION_ACCEPTANCE_STRICT; delete process.env.VISION_ACCEPTANCE_GATE; delete process.env.VISION_ACCEPTANCE_STRICT; });
  afterEach(() => {
    if (savedGate === undefined) delete process.env.VISION_ACCEPTANCE_GATE; else process.env.VISION_ACCEPTANCE_GATE = savedGate;
    if (savedStrict === undefined) delete process.env.VISION_ACCEPTANCE_STRICT; else process.env.VISION_ACCEPTANCE_STRICT = savedStrict;
  });

  it('VA-26: VISION_ACCEPTANCE_GATE default ON (unset and =true); OFF for false/0/off/no', () => {
    expect(isVisionAcceptanceGateEnabled()).toBe(true); // unset → ON
    process.env.VISION_ACCEPTANCE_GATE = '';
    expect(isVisionAcceptanceGateEnabled()).toBe(true); // empty → ON
    process.env.VISION_ACCEPTANCE_GATE = 'true';
    expect(isVisionAcceptanceGateEnabled()).toBe(true);
    for (const off of ['false', '0', 'off', 'no', 'FALSE', 'Off']) {
      process.env.VISION_ACCEPTANCE_GATE = off;
      expect(isVisionAcceptanceGateEnabled(), off).toBe(false);
    }
  });

  it('VA-27: VISION_ACCEPTANCE_STRICT default OFF (unset and =false); ON for true/1/on/yes', () => {
    expect(isVisionAcceptanceStrict()).toBe(false); // unset → OFF
    process.env.VISION_ACCEPTANCE_STRICT = '';
    expect(isVisionAcceptanceStrict()).toBe(false);
    process.env.VISION_ACCEPTANCE_STRICT = 'false';
    expect(isVisionAcceptanceStrict()).toBe(false);
    for (const on of ['true', '1', 'on', 'yes', 'TRUE', 'On']) {
      process.env.VISION_ACCEPTANCE_STRICT = on;
      expect(isVisionAcceptanceStrict(), on).toBe(true);
    }
  });
});

describe('static never-advance guardrail (VA-23)', () => {
  it('VA-23: vision-acceptance-gate.js source has zero advance/stage/chairman/vision-write tokens', () => {
    const src = readFileSync(LIB_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/_advanceStage/);
    expect(src).not.toMatch(/current_lifecycle_stage\s*:/);
    expect(src).not.toMatch(/chairman_decisions|chairman_approved\s*:/);
    expect(src).not.toMatch(/advance_venture_stage/);
  });
});
