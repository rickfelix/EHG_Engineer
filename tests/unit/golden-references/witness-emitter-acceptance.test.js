// Acceptance for the witness-evidence-emitter golden reference. Behavioral-
// first and PARAMETERIZED over GOLDEN_REF_MODULE from line 1 (the -C fix) so a
// delegate's adapted copy gets the same calling-enforcement. The load-bearing
// tests are the ones a grep cannot prove: a LYING action must fail verify, and
// a crash inside the transaction must roll BOTH the effect and the witness back.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeSource, buildLocks } from '../../../golden-references/witness-evidence-emitter/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const abs = (p, d) => (p ? (isAbsolute(p) ? p : join(REPO_ROOT, p)) : d);
const MODULE_PATH = abs(process.env.GOLDEN_REF_MODULE, join(REPO_ROOT, 'golden-references', 'witness-evidence-emitter', 'witness-emitter.mjs'));
const SRC_PATH = abs(process.env.GOLDEN_REF_SRC, MODULE_PATH);
const SRC = readFileSync(SRC_PATH, 'utf8');

let emitWitness, verifyWitness;
beforeAll(async () => {
  const mod = await import(pathToFileURL(MODULE_PATH).href);
  emitWitness = mod.emitWitness;
  verifyWitness = mod.verifyWitness;
});

// A governed store + single-boundary transaction. deriveTruth re-derives the
// ACTUAL outcome from the store (the primary state), independent of the witness.
function makeGoverned() {
  const store = new Map();
  const transaction = (fn) => {
    const snapshot = new Map(store); // simulate rollback on throw (a real txn's job)
    try { fn(store); } catch (e) { store.clear(); for (const [k, v] of snapshot) store.set(k, v); throw e; }
  };
  // Re-derive the outcome in the SAME shape as the action's claim, from the
  // primary governed state (an honest delegate's deriveTruth reconstructs the
  // claim shape from the columns the action wrote).
  const deriveTruth = (s) => ({ balance: s.get('balance') ?? null });
  return { store, transaction, deriveTruth };
}
// Honest action: really mutates the governed state AND returns a matching claim.
const honestAction = (store) => { store.set('balance', 100); return { balance: 100 }; };

describe('behavioral contract (the real enforcement — runs against the ADAPTED module too)', () => {
  it('round-trip: honest action mutates state, witness commits atomically, verify re-derives -> true', () => {
    const { store, transaction, deriveTruth } = makeGoverned();
    const w = emitWitness(honestAction, { transaction, key: 'a' });
    expect(w.verified).toBe(null);                    // D3: emitter never self-asserts
    expect(w.evidence_hash).toBeTruthy();             // D4: content-bearing
    expect(store.get('balance')).toBe(100);           // D1: real effect landed in the boundary
    expect(store.get('a:witness')).toBeTruthy();      // D1: witness in the same boundary
    const v = verifyWitness(w, { store, deriveTruth });
    expect(v.verified).toBe(true);                    // D3/D5: re-derived truth matches
  });

  it('LYING action FAILS verify (the whole point): claims success but never mutates the governed state', () => {
    const { store, transaction, deriveTruth } = makeGoverned();
    const lying = (/* store */) => ({ balance: 100 }); // returns success, mutates NOTHING
    const w = emitWitness(lying, { transaction, key: 'a' });
    // A naive consistency-check would pass here. The independent re-derivation
    // reads the governed state (balance=null, the action did nothing) -> mismatch.
    expect(verifyWitness(w, { store, deriveTruth }).verified).toBe(false);
  });

  it('WRONG action FAILS verify: mutates the state to something other than its claim', () => {
    const { store, transaction, deriveTruth } = makeGoverned();
    const wrong = (s) => { s.set('balance', 5); return { balance: 100 }; }; // claim != effect
    const w = emitWitness(wrong, { transaction, key: 'a' });
    expect(verifyWitness(w, { store, deriveTruth }).verified).toBe(false);
  });

  it('atomic rollback: a crash inside the transaction rolls BACK both the effect and the witness', () => {
    const { store, transaction, deriveTruth } = makeGoverned();
    const crashing = (s) => { s.set('balance', 100); throw new Error('mid-action crash'); };
    expect(() => emitWitness(crashing, { transaction, key: 'a' })).toThrow('mid-action crash');
    expect(store.has('balance')).toBe(false);   // effect rolled back
    expect(store.has('a:witness')).toBe(false); // witness rolled back — no action without witness
  });

  it('tamper the governed state after emit -> verify false (independent re-derivation catches it)', () => {
    const { store, transaction, deriveTruth } = makeGoverned();
    const w = emitWitness(honestAction, { transaction, key: 'a' });
    store.set('balance', 999); // someone mutated the primary state after the witness
    expect(verifyWitness(w, { store, deriveTruth }).verified).toBe(false);
  });

  it('canonical hash: key order in the claim does not cause a false verify failure', () => {
    const { store, transaction, deriveTruth } = makeGoverned();
    // action returns keys in one order; deriveTruth yields the same content in another
    const a = (s) => { s.set('balance', { x: 1, y: 2 }); return { y: 2, x: 1 }; };
    const dt = (s) => { const b = s.get('balance'); return { x: b.x, y: b.y }; };
    const w = emitWitness(a, { transaction, key: 'a' });
    expect(verifyWitness(w, { store, deriveTruth: dt }).verified).toBe(true); // canonical sort -> match
  });
});

describe('textual locks pass on the source', () => {
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

describe('doctrine mutations fail named checks (miss direction)', () => {
  const CANON = readFileSync(join(REPO_ROOT, 'golden-references', 'witness-evidence-emitter', 'witness-emitter.mjs'), 'utf8');

  it('action OUTSIDE the transaction fails action_inside_transaction', () => {
    const m = CANON.replace('opts.transaction((store) => {\n    const claimed_result = action(store);', 'const claimed_result = action(new Map());\n  opts.transaction((store) => {');
    expect(judgeSource(m).failed).toContain('action_inside_transaction');
  });

  it('verify re-reading the witness claim (tautology) fails independent_rederivation', () => {
    const m = CANON.replace('const actual = opts.deriveTruth(opts.store);', 'const actual = witness.claimed_result;');
    expect(judgeSource(m).failed).toContain('independent_rederivation');
  });

  it('non-canonical hash fails tamper_evident_canonical', () => {
    const m = CANON.replace(/return '\{' \+ Object\.keys\(value\)\.sort\(\)[\s\S]*?join\(','\) \+ '\}';/, 'return JSON.stringify(value);');
    expect(judgeSource(m).failed).toContain('tamper_evident_canonical');
  });

  it('boolean-only witness fails tamper_evident_canonical', () => {
    const m = CANON.replace(/witness = \{[\s\S]*?\};/, "witness = { action: 'x', passed: true, verified: null };");
    expect(judgeSource(m).failed).toContain('tamper_evident_canonical');
  });

  it('a module-singleton store fails injected_dependencies', () => {
    const m = CANON.replace('import { createHash }', 'const store = new Map();\nimport { createHash }');
    expect(judgeSource(m).failed).toContain('injected_dependencies');
  });
});
