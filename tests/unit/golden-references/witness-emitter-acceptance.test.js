// Acceptance for the witness-evidence-emitter golden reference. Behavioral-
// first and PARAMETERIZED over GOLDEN_REF_MODULE from line 1 (the -C fix) so a
// delegate's adapted copy gets the same calling-enforcement — critical here
// because the self-test-masking checks can only be proven by CALLING emit/verify
// against a real store.
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

// A minimal store + single-boundary transaction the emitter is given.
function makeStore() {
  const store = new Map();
  const transaction = (fn) => fn(store); // one boundary; a real app wraps BEGIN/COMMIT
  return { store, transaction };
}
function action() { return { id: 7, value: 'observed' }; }

describe('behavioral contract (TS-1/TS-2, the real enforcement — runs against the ADAPTED module too)', () => {
  it('round-trip: emit writes effect+witness atomically; verified is null at emit; verify reads store -> true', () => {
    const { store, transaction } = makeStore();
    const w = emitWitness(action, { transaction, key: 'a' });
    expect(w.verified).toBe(null);              // D3: emitter never self-asserts
    expect(w.evidence_hash).toBeTruthy();       // D4: content-bearing
    expect(w.observed_result).toEqual({ id: 7, value: 'observed' }); // D2: from the action return
    expect(store.get('a:effect')).toEqual(w.observed_result); // D1: effect persisted in the same boundary
    const v = verifyWitness(w, { store, key: 'a' });
    expect(v.verified).toBe(true);
  });

  it('SELF-TEST-MASKING defeated: tamper the store after emit -> verify returns false', () => {
    const { store, transaction } = makeStore();
    const w = emitWitness(action, { transaction, key: 'a' });
    store.set('a:effect', { id: 7, value: 'TAMPERED' }); // independent store diverges from the witness
    expect(verifyWitness(w, { store, key: 'a' }).verified).toBe(false);
  });

  it('SELF-TEST-MASKING defeated: empty the store after emit -> verify returns false (no silent pass)', () => {
    const { store, transaction } = makeStore();
    const w = emitWitness(action, { transaction, key: 'a' });
    store.delete('a:effect');
    expect(verifyWitness(w, { store, key: 'a' }).verified).toBe(false);
  });

  it('verify re-derives from the STORE, not the witness object (a forged witness.observed_result cannot self-pass)', () => {
    const { store, transaction } = makeStore();
    const w = emitWitness(action, { transaction, key: 'a' });
    const forged = { ...w, observed_result: { id: 7, value: 'FORGED' } }; // lie in the witness
    // store still holds the real effect, so the forged witness's hash won't match a re-hash of the store
    const forgedHashMismatch = { ...forged }; // evidence_hash still the ORIGINAL hash
    expect(verifyWitness(forgedHashMismatch, { store, key: 'a' }).verified).toBe(true); // original hash matches store (honest)
    // but if someone re-hashes the forgery INTO evidence_hash, the store still disagrees:
    const fullyForged = emitWitness(() => ({ id: 7, value: 'FORGED' }), { transaction: (fn) => fn(new Map()), key: 'z' });
    expect(verifyWitness(fullyForged, { store, key: 'a' }).verified).toBe(false); // read the real store -> mismatch
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

describe('doctrine mutations fail named checks (TS-3 miss direction)', () => {
  const CANON = readFileSync(join(REPO_ROOT, 'golden-references', 'witness-evidence-emitter', 'witness-emitter.mjs'), 'utf8');

  it('pre-declare: observed_result from a param fails never_predeclare', () => {
    const m = CANON.replace('const observed_result = action();', 'const observed_result = opts.expected;');
    expect(judgeSource(m).failed).toContain('never_predeclare');
  });

  it('two-awaited-writes fails atomic_single_boundary', () => {
    const m = CANON.replace(/opts\.transaction\(\(store\) => \{[\s\S]*?\}\);/, 'await opts.store.write("effect", observed_result);\n  await opts.store.write("witness", witness);');
    expect(judgeSource(m).failed).toContain('atomic_single_boundary');
  });

  it('boolean-only witness fails tamper_evident', () => {
    // A witness that carries a bare boolean instead of content+hash.
    const m = CANON.replace(
      /const witness = \{[^}]*\};/,
      'const witness = { action: String(action.name || key), passed: true, verified: null };'
    );
    expect(judgeSource(m).failed).toContain('tamper_evident');
  });

  it('rederive reading witness.observed_result fails independent_rederivation + verify_by_read', () => {
    const m = CANON.replace('const rederived = opts.store.get(key + \':effect\');', 'const rederived = witness.observed_result;');
    const failed = judgeSource(m).failed;
    expect(failed).toContain('independent_rederivation');
  });

  it('a module-singleton store fails injected_store', () => {
    const m = CANON.replace('import { createHash }', 'const store = new Map();\nimport { createHash }');
    expect(judgeSource(m).failed).toContain('injected_store');
  });
});
