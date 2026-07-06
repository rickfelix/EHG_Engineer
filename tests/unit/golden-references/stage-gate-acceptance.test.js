// Acceptance for the stage-gate-check golden reference: behavioral-first
// (tests CALL the reference — RISK M2: textual locks over JS are necessary
// but weak), textual locks for the obvious doctrine violations, and mutation
// miss-tests proving each violation fails a named check.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate, emitEvidence } from '../../../golden-references/stage-gate-check/gate-check.mjs';
import { judgeSource, buildLocks } from '../../../golden-references/stage-gate-check/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = readFileSync(join(REPO_ROOT, 'golden-references', 'stage-gate-check', 'gate-check.mjs'), 'utf8');
const HAPPY = { venture_id: 'v-1', stage_number: 7, artifact_count: 3, blocking_issues: 0 };

describe('behavioral contract (TS-1, the real enforcement)', () => {
  it('fail-closed: empty inputs BLOCK naming every missing field', () => {
    const v = evaluateGate({});
    expect(v.allowed).toBe(false);
    for (const f of ['venture_id', 'stage_number', 'artifact_count', 'blocking_issues']) {
      expect(v.reason).toContain(f);
    }
  });

  it('fail-closed handles null/undefined inputs object without throwing', () => {
    expect(evaluateGate(null).allowed).toBe(false);
    expect(evaluateGate(undefined).allowed).toBe(false);
  });

  it('zero is a PRESENT value (truthiness would lie): blocking_issues=0 is not missing', () => {
    const v = evaluateGate(HAPPY);
    expect(v.allowed).toBe(true);
    expect(v.reason).toContain('all checks passed');
    expect(v.evidence.length).toBeGreaterThan(0);
  });

  it('negative paths carry reasons: no artifacts / open blockers', () => {
    expect(evaluateGate({ ...HAPPY, artifact_count: 0 })).toMatchObject({ allowed: false });
    const blocked = evaluateGate({ ...HAPPY, blocking_issues: 2 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('2 blocking issue');
  });

  it('determinism: double-call deep-equal', () => {
    expect(evaluateGate(HAPPY)).toEqual(evaluateGate(HAPPY));
  });

  it('totality (doctrine 5): a poisoned input (throwing getter) resolves to BLOCK, never a throw', () => {
    const poisoned = { venture_id: 'v-1', stage_number: 7, blocking_issues: 0 };
    Object.defineProperty(poisoned, 'artifact_count', {
      enumerable: true,
      get() { throw new Error('poisoned getter'); },
    });
    const v = evaluateGate(poisoned);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('evaluation error');
    expect(v.reason).toContain('poisoned getter');
  });

  it('separated emission: the emitter writes the verdict to the injected sink and returns nothing', () => {
    const written = [];
    const verdict = evaluateGate(HAPPY);
    emitEvidence(verdict, { write: (r) => written.push(r) });
    expect(written).toHaveLength(1);
    expect(written[0].allowed).toBe(true);
    expect(written[0].evidence).toEqual(verdict.evidence);
  });
});

describe('textual locks pass on the canonical (TS-1 pass direction)', () => {
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

describe('doctrine mutations fail named checks (TS-2 miss direction)', () => {
  it('side-effect-in-predicate: Date.now inserted fails predicate_purity', () => {
    const mutated = SRC.replace('const evidence = [', 'const now = Date.now();\n    const evidence = [');
    expect(judgeSource(mutated).failed).toContain('predicate_purity');
  });

  it('fail-open: presence guard stripped fails fail_closed_on_missing', () => {
    const mutated = SRC.replace(/const missing = REQUIRED_INPUTS[\s\S]*?\n    }\n/, '').replace(/missing inputs:[^`]*`/, '`');
    expect(judgeSource(mutated).failed).toContain('fail_closed_on_missing');
  });

  it('dual predicate: a second evaluate* export fails single_predicate_source', () => {
    const mutated = SRC + '\nexport function evaluateGateFast() { return { allowed: true, reason: "", evidence: [] }; }\n';
    expect(judgeSource(mutated).failed).toContain('single_predicate_source');
  });

  it('swallowed-throw-pass: catch returning allowed:true fails exception_total AND the behavioral contract', () => {
    const mutated = SRC.replace(/allowed: false,\s*\n\s*reason: `evaluation error/, 'allowed: true,\n      reason: `evaluation error');
    expect(judgeSource(mutated).failed).toContain('exception_total');
    // Behavioral demonstration of the antipattern failing the contract:
    const swallowedThrowPass = (inputs) => { try { throw new Error('boom'); } catch { return { allowed: true, reason: '', evidence: [] }; } };
    const v = swallowedThrowPass({});
    expect(v.allowed).toBe(true); // the antipattern passes where the doctrine demands BLOCK
    expect(evaluateGate(null).allowed).toBe(false); // the canonical blocks
  });

  it('emitter influence: predicate body referencing the sink fails evidence_separation', () => {
    const mutated = SRC.replace('const evidence = [', 'if (globalThis.sink) globalThis.sink.write({});\n    const evidence = [');
    expect(judgeSource(mutated).failed).toContain('evidence_separation');
  });
});
