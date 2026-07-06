// Acceptance for the stage-gate-check golden reference: behavioral-first
// (tests CALL the reference — RISK M2: textual locks over JS are necessary
// but weak), textual locks for the obvious doctrine violations, and mutation
// miss-tests proving each violation fails a named check.
//
// PARAMETERIZED over a module path so a DELEGATE gets the SAME calling-
// enforcement on their adapted copy — not just the canonical (adversarial
// CRITICAL, 2026-07-06: the weak textual locks were the only thing reaching
// the copies). A delegate runs:
//   GOLDEN_REF_MODULE=<abs path to their gate-check.mjs> \
//   GOLDEN_REF_SRC=<abs path to their source> \
//   npx vitest run tests/unit/golden-references/stage-gate-acceptance.test.js
// defaulting to the canonical reference here.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeSource, buildLocks } from '../../../golden-references/stage-gate-check/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MODULE_PATH = process.env.GOLDEN_REF_MODULE
  ? (isAbsolute(process.env.GOLDEN_REF_MODULE) ? process.env.GOLDEN_REF_MODULE : join(REPO_ROOT, process.env.GOLDEN_REF_MODULE))
  : join(REPO_ROOT, 'golden-references', 'stage-gate-check', 'gate-check.mjs');
const SRC_PATH = process.env.GOLDEN_REF_SRC
  ? (isAbsolute(process.env.GOLDEN_REF_SRC) ? process.env.GOLDEN_REF_SRC : join(REPO_ROOT, process.env.GOLDEN_REF_SRC))
  : MODULE_PATH;

const SRC = readFileSync(SRC_PATH, 'utf8');
const HAPPY = { venture_id: 'v-1', stage_number: 7, artifact_count: 3, blocking_issues: 0 };
let evaluateGate, emitEvidence;

beforeAll(async () => {
  const mod = await import(pathToFileURL(MODULE_PATH).href);
  evaluateGate = mod.evaluateGate;
  emitEvidence = mod.emitEvidence;
});

describe('behavioral contract (TS-1, the real enforcement — runs against the ADAPTED module too)', () => {
  it('fail-closed: empty inputs BLOCK naming the missing fields', () => {
    const v = evaluateGate({});
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/missing|required/i);
  });

  it('fail-closed handles null/undefined inputs object without throwing', () => {
    expect(evaluateGate(null).allowed).toBe(false);
    expect(evaluateGate(undefined).allowed).toBe(false);
  });

  it('a fully-satisfied input ALLOWS with evidence (pass direction)', () => {
    const v = evaluateGate(HAPPY);
    expect(v.allowed).toBe(true);
    expect(Array.isArray(v.evidence)).toBe(true);
    expect(v.evidence.length).toBeGreaterThan(0);
  });

  it('determinism: double-call deep-equal (the REAL purity check — catches impurity a textual lock cannot)', () => {
    expect(evaluateGate(HAPPY)).toEqual(evaluateGate(HAPPY));
    const b = { ...HAPPY, blocking_issues: 3 };
    expect(evaluateGate(b)).toEqual(evaluateGate(b));
  });

  it('totality (doctrine 5): a getter throwing during the DECISION region resolves to BLOCK + internal_error, never a throw', () => {
    // Poison a field read DURING decision logic (not the presence loop) so the
    // proof exercises the decision region, not just the guard (adversarial INFO).
    const poisoned = { venture_id: 'v-1', stage_number: 7, blocking_issues: 0 };
    let reads = 0;
    Object.defineProperty(poisoned, 'artifact_count', {
      enumerable: true,
      get() { reads += 1; if (reads > 1) throw new Error('poisoned on decision read'); return 3; },
    });
    const v = evaluateGate(poisoned);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('evaluation error');
    expect(v.internal_error).toBe(true); // code-bug BLOCK is distinguishable from a policy BLOCK
  });

  it('a policy BLOCK is NOT flagged internal_error (the flag means "code bug", not "denied")', () => {
    const v = evaluateGate({ ...HAPPY, blocking_issues: 2 });
    expect(v.allowed).toBe(false);
    expect(v.internal_error).toBeUndefined();
  });

  it('separated emission: the emitter writes the verdict to the injected sink and never influences it', () => {
    const written = [];
    const verdict = evaluateGate(HAPPY);
    emitEvidence(verdict, { write: (r) => written.push(r) });
    expect(written).toHaveLength(1);
    expect(written[0].allowed).toBe(true);
    expect(evaluateGate(HAPPY)).toEqual(verdict); // emission did not change the verdict
  });
});

describe('textual locks pass on the source (TS-1 pass direction)', () => {
  const LOCKS = buildLocks();
  for (const name of Object.keys(LOCKS)) {
    it(`lock: ${name}`, () => {
      expect(LOCKS[name](SRC), `lock '${name}' must hold`).toBe(true);
    });
  }
  it('judgeSource aggregates to ok', () => {
    expect(judgeSource(SRC)).toEqual({ ok: true, failed: [] });
  });
});

// Mutations run against the CANONICAL source text regardless of the module
// under test — they prove the LOCKS discriminate, independent of the target.
describe('doctrine mutations fail named checks (TS-2 miss direction)', () => {
  const CANON = readFileSync(join(REPO_ROOT, 'golden-references', 'stage-gate-check', 'gate-check.mjs'), 'utf8');

  it('side-effect-in-predicate: Date.now inserted fails predicate_purity', () => {
    const m = CANON.replace('const evidence = [', 'const now = Date.now();\n    const evidence = [');
    expect(judgeSource(m).failed).toContain('predicate_purity');
  });

  it('module-scope clock consumed by the predicate is caught (performance.now)', () => {
    const m = CANON.replace('if (inputs.artifact_count < 1)', 'if (performance.now() < 0 || inputs.artifact_count < 1)');
    expect(judgeSource(m).failed).toContain('predicate_purity');
  });

  it('fail-open with marker strings KEPT fools the textual lock — behavior is what catches it (adversarial INFO #6)', () => {
    // Force an early allowed:true BEFORE the guard, leaving the `missing
    // inputs:` string + REQUIRED_INPUTS as dead code below. The textual lock
    // is FOOLED (strings still present) — proving it is necessary-but-weak and
    // the parameterized BEHAVIORAL runner (which would call this module and
    // see evaluateGate({}).allowed === true) is the real fail-closed guard.
    const m = CANON.replace('const missing =', 'return { allowed: true, reason: "forced open", evidence: [] };\n    const missing =');
    expect(judgeSource(m).ok).toBe(true); // lock fooled — the documented weakness
    // Behavioral proof of what the lock missed: emulate the mutated predicate.
    const fooled = (inputs) => ({ allowed: true, reason: 'forced open', evidence: [] });
    expect(fooled({}).allowed).toBe(true); // fail-OPEN — behavior catches what the lock can't
  });

  it('dual predicate as an ARROW export fails single_predicate_source (under-fire closed)', () => {
    const m = CANON + '\nexport const evaluateFast = (i) => ({ allowed: true, reason: "", evidence: [] });\n';
    expect(judgeSource(m).failed).toContain('single_predicate_source');
  });

  it('dual predicate as a RE-EXPORT fails single_predicate_source', () => {
    const m = CANON + "\nexport { something as evaluateOther } from './other.mjs';\n";
    expect(judgeSource(m).failed).toContain('single_predicate_source');
  });

  it('a legitimate Batch wrapper does NOT over-fire single_predicate_source', () => {
    const m = CANON + '\nexport function evaluateGateBatch(list) { return list.map(evaluateGate); }\n';
    expect(judgeSource(m).failed).not.toContain('single_predicate_source');
  });

  it('swallowed-throw-pass: catch returning allowed:true fails exception_total', () => {
    const m = CANON.replace(/allowed: false,\s*\n\s*internal_error: true,/, 'allowed: true,\n      internal_error: true,');
    expect(judgeSource(m).failed).toContain('exception_total');
  });

  it('catch without internal_error flag fails exception_total (bug indistinguishable from policy)', () => {
    const m = CANON.replace(/\n\s*internal_error: true,/, '');
    expect(judgeSource(m).failed).toContain('exception_total');
  });

  it('emitter influence: predicate body referencing the sink fails evidence_separation', () => {
    const m = CANON.replace('const evidence = [', 'if (globalThis.sink) globalThis.sink.write({});\n    const evidence = [');
    expect(judgeSource(m).failed).toContain('evidence_separation');
  });
});
