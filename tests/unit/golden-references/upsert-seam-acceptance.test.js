// Acceptance for the idempotent-composite-upsert golden reference. Behavioral-first
// and PARAMETERIZED over GOLDEN_REF_MODULE from line 1 (the -C fix) so a delegate's
// adapted COPY gets the same calling-enforcement. The load-bearing tests are the ones a
// grep cannot prove: two identical writes converge to ONE row AND a later differing write
// converges to the LATEST (falsifying ON CONFLICT DO NOTHING); a silent-drop store makes
// the seam FAIL LOUD; a partial key collapses distinct rows; and the upsertContract must
// ACCEPT the golden seam (positive control) while REJECTING every broken copy.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeSource, buildLocks } from '../../../golden-references/idempotent-composite-upsert/acceptance-locks.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const abs = (p, d) => (p ? (isAbsolute(p) ? p : join(REPO_ROOT, p)) : d);
const CANON_PATH = join(REPO_ROOT, 'golden-references', 'idempotent-composite-upsert', 'upsert-seam.mjs');
const MODULE_PATH = abs(process.env.GOLDEN_REF_MODULE, CANON_PATH);
const SRC_PATH = abs(process.env.GOLDEN_REF_SRC, MODULE_PATH);
const SRC = readFileSync(SRC_PATH, 'utf8');

let upsertByKey, readBack, bumpVersion, makeStore;
beforeAll(async () => {
  const m = await import(pathToFileURL(MODULE_PATH).href);
  upsertByKey = m.upsertByKey; readBack = m.readBack; bumpVersion = m.bumpVersion; makeStore = m.makeStore;
});

const KEY = ['venture_id', 'artifact_type', 'claim_ref'];
const rec = (over = {}) => ({ venture_id: 'v1', artifact_type: 'bp', claim_ref: 'c1', disposition: 'BUILT', ...over });
const keyStr = (over = {}) => { const r = rec(over); return JSON.stringify(KEY.map((c) => r[c])); };

// A PORTABLE upsert-contract checker — the teeth a delegate runs against their own seam.
// It RUNS the candidate (not a source grep) against configured store scenarios. Returns
// contract VIOLATIONS (empty === compliant). Includes a POSITIVE control (below) so a
// vacuously over-strict candidate cannot pass by rejecting everything.
function upsertContractViolations(seam, store = makeStore) {
  const v = [];
  const clock = (t) => ({ now: () => t });
  // idempotency + convergence-to-latest (falsifies ON CONFLICT DO NOTHING)
  try {
    const s = store();
    seam.upsertByKey(s, KEY, rec(), { clock: clock(1) });
    seam.upsertByKey(s, KEY, rec(), { clock: clock(1) });
    if (s.size() !== 1) v.push('not-idempotent');
    seam.upsertByKey(s, KEY, rec({ disposition: 'MISSING' }), { clock: clock(2) });
    const landed = s.getByKey(keyStr());
    if (s.size() !== 1) v.push('not-idempotent');
    if (!landed || landed.disposition !== 'MISSING') v.push('do-nothing-not-converged');
  } catch { v.push('threw-on-happy-path'); }
  // fail loud on a silent-drop store
  { const s = store({ silentDrop: true }); let threw = false; try { seam.upsertByKey(s, KEY, rec(), { clock: clock(1) }); } catch { threw = true; } if (!threw) v.push('no-fail-loud-on-silent-drop'); }
  // explicit updated_at advances with the clock
  try { const s = store(); const a = seam.upsertByKey(s, KEY, rec(), { clock: clock(10) }); const b = seam.upsertByKey(s, KEY, rec({ disposition: 'X' }), { clock: clock(20) }); if (!(a && a.updated_at === 10) || !(b && b.updated_at === 20)) v.push('stale-updated-at'); } catch {}
  // inputs not from the mutated row: seed a sentinel; the correct seam writes the external value
  try { const s = store(); s.seed(keyStr(), rec({ disposition: 'SENTINEL', updated_at: 0 })); seam.upsertByKey(s, KEY, rec({ disposition: 'EXTERNAL' }), { clock: clock(1) }); const landed = s.getByKey(keyStr()); if (!landed || landed.disposition !== 'EXTERNAL') v.push('self-read-from-mutated-row'); } catch {}
  // full composite key: distinct claim_ref must stay TWO rows (a partial key would collapse)
  try { const s = store(); seam.upsertByKey(s, KEY, rec({ claim_ref: 'c1' }), { clock: clock(1) }); seam.upsertByKey(s, KEY, rec({ claim_ref: 'c2' }), { clock: clock(1) }); if (s.size() !== 2) v.push('partial-key-collapse'); } catch {}
  // null-in-key must fail loud
  { const s = store(); let threw = false; try { seam.upsertByKey(s, KEY, rec({ claim_ref: null }), { clock: clock(1) }); } catch { threw = true; } if (!threw) v.push('null-in-key-not-fail-loud'); }
  // non-finite key must fail loud (NaN/Infinity serialize to "null" and forge a colliding key)
  { const s = store(); let threw = false; try { seam.upsertByKey(s, KEY, rec({ claim_ref: NaN }), { clock: clock(1) }); } catch { threw = true; } if (!threw) v.push('non-finite-key-not-fail-loud'); }
  // WRITE-IDENTITY verify: a silent drop-on-UPDATE (INSERT lands) must FAIL LOUD even when the
  // stale row's updated_at collides with this clock tick — an updated_at-equality-only verify
  // FALSE-PASSES here (h4 hiding under h2); a payload-identity verify does not.
  { const s = store({ dropUpdates: true }); seam.upsertByKey(s, KEY, rec(), { clock: clock(5) }); let threw = false; try { seam.upsertByKey(s, KEY, rec({ disposition: 'MISSING' }), { clock: clock(5) }); } catch { threw = true; } if (!threw) v.push('weak-verify-false-pass-on-drop-update'); }
  return v;
}

// Broken delegate seams (inline). Each fails a DIFFERENT contract clause.
const key = (over) => keyStr(over);
const DO_NOTHING = { upsertByKey(s, keyCols, r, o) { const k = key(r); if (!s.getByKey(k)) s.upsert(k, { ...r, updated_at: o.clock.now() }); return s.getByKey(k); } };
const SELF_READ = { upsertByKey(s, keyCols, r, o) { const k = key(r); const cur = s.getByKey(k); const row = { ...r, disposition: cur ? cur.disposition : r.disposition, updated_at: o.clock.now() }; s.upsert(k, row); return s.getByKey(k); } };
const PARTIAL_KEY = { upsertByKey(s, keyCols, r, o) { const k = JSON.stringify([r.venture_id]); const row = { ...r, updated_at: o.clock.now() }; s.upsert(k, row); return s.getByKey(k); } };
const NO_VERIFY = { upsertByKey(s, keyCols, r, o) { const k = key(r); const row = { ...r, updated_at: o.clock.now() }; s.upsert(k, row); return row; } }; // trusts the write, no read-back
const STALE_UPDATED_AT = { upsertByKey(s, keyCols, r, o) { const k = key(r); s.upsert(k, { ...r }); const landed = s.getByKey(k); if (!landed) throw new Error('nope'); return landed; } };
const NULL_KEY_UNSAFE = { upsertByKey(s, keyCols, r, o) { const k = JSON.stringify(keyCols.map((c) => r[c])); const row = { ...r, updated_at: o.clock.now() }; s.upsert(k, row); const landed = s.getByKey(k); if (!landed) throw new Error('nope'); return landed; } };
// verifies updated_at value-equality ONLY (the pre-hardening shape) -> FALSE-PASSES a silent
// drop-on-UPDATE whenever the stale row's updated_at collides with this clock tick.
const WEAK_VERIFY = { upsertByKey(s, keyCols, r, o) { const k = key(r); const row = { ...r, updated_at: o.clock.now() }; s.upsert(k, row); const landed = s.getByKey(k); if (!landed || landed.updated_at !== row.updated_at) throw new Error('nope'); return landed; } };
const NAN_KEY_UNSAFE = { upsertByKey(s, keyCols, r, o) { const k = JSON.stringify(keyCols.map((c) => r[c])); const row = { ...r, updated_at: o.clock.now() }; s.upsert(k, row); const landed = s.getByKey(k); if (!landed) throw new Error('nope'); return landed; } };

describe('behavioral contract (the real enforcement — runs against the ADAPTED copy too)', () => {
  it('IDEMPOTENCY + CONVERGENCE-TO-LATEST: identical writes -> 1 row; a differing write -> latest value (not DO NOTHING)', () => {
    const s = makeStore();
    upsertByKey(s, KEY, rec(), { clock: { now: () => 1 } });
    upsertByKey(s, KEY, rec(), { clock: { now: () => 1 } });
    expect(s.size()).toBe(1);
    upsertByKey(s, KEY, rec({ disposition: 'MISSING' }), { clock: { now: () => 2 } });
    expect(s.size()).toBe(1);
    expect(s.getByKey(keyStr()).disposition).toBe('MISSING'); // converged to latest
  });

  it('SILENT-DROP FAIL-LOUD: a store that silently no-ops -> upsertByKey THROWS (contrast -F never-throw)', () => {
    const s = makeStore({ silentDrop: true });
    expect(() => upsertByKey(s, KEY, rec(), { clock: { now: () => 1 } })).toThrow(/did not land|FAIL LOUD|silent/i);
  });

  it('HAPPY-PATH lands + verifies: returns the stored row with the stamped updated_at', () => {
    const s = makeStore();
    const r = upsertByKey(s, KEY, rec(), { clock: { now: () => 42 } });
    expect(r).toMatchObject({ venture_id: 'v1', artifact_type: 'bp', claim_ref: 'c1', disposition: 'BUILT', updated_at: 42 });
  });

  it('DROP-ON-UPDATE + COLLIDING TIMESTAMP FAIL-LOUD: a silent no-op on UPDATE (INSERT lands) still THROWS even when the stale updated_at equals this clock tick', () => {
    const s = makeStore({ dropUpdates: true });
    upsertByKey(s, KEY, rec({ disposition: 'BUILT' }), { clock: { now: () => 5 } }); // INSERT lands
    // the UPDATE silently drops; the stale row bears updated_at=5, SAME tick -> an updated_at-equality
    // verify would FALSE-PASS. The payload-identity verify must still fail loud (disposition differs).
    expect(() => upsertByKey(s, KEY, rec({ disposition: 'MISSING' }), { clock: { now: () => 5 } })).toThrow(/did not land|FAIL LOUD|column/i);
  });

  it('PAYLOAD-DROPPED write FAIL-LOUD: a store that keeps updated_at but drops the payload does not pass verification', () => {
    const s = makeStore({ timestampOnly: true });
    expect(() => upsertByKey(s, KEY, rec({ disposition: 'IMPORTANT' }), { clock: { now: () => 9 } })).toThrow(/did not land|column|FAIL LOUD/i);
  });

  it('NON-FINITE KEY FAIL-LOUD: NaN/Infinity key components throw (they serialize to "null" and forge a colliding key)', () => {
    const s = makeStore();
    expect(() => upsertByKey(s, ['a'], { a: NaN, v: 1 }, { clock: { now: () => 1 } })).toThrow(/non-finite|null|scalar|key/i);
    expect(() => upsertByKey(s, ['a'], { a: Infinity, v: 1 }, { clock: { now: () => 1 } })).toThrow();
  });

  it('EMPTY KEYCOLS FAIL-LOUD: a zero-column composite key throws (it cannot discriminate rows -> over-merge)', () => {
    const s = makeStore();
    expect(() => upsertByKey(s, [], { a: 1, v: 1 }, { clock: { now: () => 1 } })).toThrow(/non-empty|discriminate|keyCols/i);
  });

  it('NULL-IN-KEY FAIL-LOUD: a null/undefined key component throws (NULL is distinct from NULL -> duplicates)', () => {
    const s = makeStore();
    expect(() => upsertByKey(s, KEY, rec({ claim_ref: null }), { clock: { now: () => 1 } })).toThrow(/NULL|null|undefined|key/i);
    expect(() => upsertByKey(s, KEY, rec({ artifact_type: undefined }), { clock: { now: () => 1 } })).toThrow();
  });

  it('DELIMITER-COLLISION: ["a|b","c"] and ["a","b|c"] are DISTINCT rows (structural, not string-join keying)', () => {
    const s = makeStore();
    upsertByKey(s, ['a', 'b'], { a: 'a|b', b: 'c', v: 1 }, { clock: { now: () => 1 } });
    upsertByKey(s, ['a', 'b'], { a: 'a', b: 'b|c', v: 2 }, { clock: { now: () => 1 } });
    expect(s.size()).toBe(2);
  });

  it('DETERMINISTIC READ-BACK by full key; a non-existent key returns null (does NOT throw)', () => {
    const s = makeStore();
    upsertByKey(s, KEY, rec(), { clock: { now: () => 1 } });
    expect(readBack(s, KEY, ['v1', 'bp', 'c1']).disposition).toBe('BUILT');
    expect(readBack(s, KEY, ['v1', 'bp', 'nope'])).toBeNull(); // deterministic miss, no throw
  });

  it('VERSION-COUNTER CARVE-OUT (positive): an atomic bumpVersion survives repeats -> count advances', () => {
    const s = makeStore();
    s.seed(JSON.stringify(['v1', 'bp', 'c1']), rec({ count: 0 }));
    bumpVersion(s, KEY, ['v1', 'bp', 'c1'], 'count', { clock: { now: () => 1 } });
    const r = bumpVersion(s, KEY, ['v1', 'bp', 'c1'], 'count', { clock: { now: () => 2 } });
    expect(r.count).toBe(2); // atomic increment, not a racy read-modify-write
  });

  it('VERSION-COUNTER (negative demonstration): a racy read-modify-write LOSES an increment under interleaving', () => {
    const s = makeStore();
    s.seed(JSON.stringify(['v1', 'bp', 'c1']), rec({ count: 0 }));
    // simulate two interleaved sessions: both READ count=0, then both WRITE count=1
    const k = JSON.stringify(['v1', 'bp', 'c1']);
    const readA = s.getByKey(k).count;
    const readB = s.getByKey(k).count;
    s.upsert(k, { ...s.getByKey(k), count: readA + 1 });
    s.upsert(k, { ...s.getByKey(k), count: readB + 1 });
    expect(s.getByKey(k).count).toBe(1); // lost B's increment — WHY the atomic carve-out is required
  });
});

describe('the upsert CONTRACT has TEETH (positive control + rejects every broken copy)', () => {
  it('POSITIVE CONTROL: the canonical seam is ACCEPTED (contract is not vacuously over-strict)', () => {
    expect(upsertContractViolations({ upsertByKey, readBack, bumpVersion })).toEqual([]);
  });
  it('NEGATIVE: DO-NOTHING (insert-if-absent) is REJECTED (does not converge to latest)', () => {
    expect(upsertContractViolations(DO_NOTHING)).toContain('do-nothing-not-converged');
  });
  it('NEGATIVE: SELF-READ (value derived from the mutated row) is REJECTED', () => {
    expect(upsertContractViolations(SELF_READ)).toContain('self-read-from-mutated-row');
  });
  it('NEGATIVE: PARTIAL-KEY (upsert on a partial key) is REJECTED (data-loss collapse)', () => {
    expect(upsertContractViolations(PARTIAL_KEY)).toContain('partial-key-collapse');
  });
  it('NEGATIVE: NO-VERIFY (trusts the write) is REJECTED (reports success on a silent drop)', () => {
    expect(upsertContractViolations(NO_VERIFY)).toContain('no-fail-loud-on-silent-drop');
  });
  it('NEGATIVE: STALE-UPDATED-AT (does not stamp updated_at) is REJECTED', () => {
    expect(upsertContractViolations(STALE_UPDATED_AT)).toContain('stale-updated-at');
  });
  it('NEGATIVE: NULL-KEY-UNSAFE (keys on a null component) is REJECTED (no fail-loud)', () => {
    expect(upsertContractViolations(NULL_KEY_UNSAFE)).toContain('null-in-key-not-fail-loud');
  });
  it('NEGATIVE: WEAK-VERIFY (updated_at-equality only) is REJECTED (false-passes a drop-on-UPDATE under a timestamp collision)', () => {
    expect(upsertContractViolations(WEAK_VERIFY)).toContain('weak-verify-false-pass-on-drop-update');
  });
  it('NEGATIVE: NAN-KEY-UNSAFE (keys on a non-finite component) is REJECTED (no fail-loud)', () => {
    expect(upsertContractViolations(NAN_KEY_UNSAFE)).toContain('non-finite-key-not-fail-loud');
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
  const CANON = readFileSync(CANON_PATH, 'utf8');

  it('upserting on a partial key fails upsert_full_composite_key', () => {
    const m = CANON.replace('const key = keyOf(keyCols, record);', 'const key = keyOf([keyCols[0]], record);');
    expect(judgeSource(m).failed).toContain('upsert_full_composite_key');
  });
  it('deriving the row from a read-before-write fails inputs_not_from_mutated_row', () => {
    const m = CANON.replace('const row = { ...record, updated_at: clock.now() };', 'const prior = store.getByKey(key); const row = { ...record, updated_at: clock.now() };');
    expect(judgeSource(m).failed).toContain('inputs_not_from_mutated_row');
  });
  it('a read-modify-write bumpVersion fails version_counter_carveout', () => {
    const m = CANON.replace('return store.atomicIncrement(key, field, { updated_at: clock.now() });', 'const cur = store.getByKey(key); store.upsert(key, { ...cur, [field]: (cur[field]||0)+1 }); return store.getByKey(key);');
    expect(judgeSource(m).failed).toContain('version_counter_carveout');
  });
  it('an unordered scan read-back fails deterministic_readback', () => {
    const m = CANON.replace('return store.getByKey(JSON.stringify(keyVals));', 'return store.all().find((r) => r[keyCols[0]] === keyVals[0]);');
    expect(judgeSource(m).failed).toContain('deterministic_readback');
  });
  it('dropping the verify read-back fails verify_write_landed_fail_loud', () => {
    const m = CANON.replace(/const landed = store\.getByKey\(key\);[\s\S]*?return landed;/, 'return { ...row };');
    expect(judgeSource(m).failed).toContain('verify_write_landed_fail_loud');
  });
  it('reverting to an updated_at-equality verify fails verify_write_landed_fail_loud', () => {
    const m = CANON.replace('assertLanded(landed, row, key);', 'if (!landed || landed.updated_at !== row.updated_at) throw new Error("nope");');
    expect(judgeSource(m).failed).toContain('verify_write_landed_fail_loud');
  });
  it('removing the non-finite key guard fails nonfinite_key_fail_loud', () => {
    const m = CANON.replace("if (t === 'number' && !Number.isFinite(v)) {", 'if (false) {');
    expect(judgeSource(m).failed).toContain('nonfinite_key_fail_loud');
  });
  it('removing the empty-keyCols guard fails nonempty_keycols_fail_loud', () => {
    const m = CANON.replace('if (!Array.isArray(keyCols) || keyCols.length === 0) {', 'if (false) {');
    expect(judgeSource(m).failed).toContain('nonempty_keycols_fail_loud');
  });
  it('dropping the explicit updated_at fails explicit_updated_at', () => {
    const m = CANON.replace('const row = { ...record, updated_at: clock.now() };', 'const row = { ...record };');
    expect(judgeSource(m).failed).toContain('explicit_updated_at');
  });
  it('removing the null-key guard fails null_key_fail_loud', () => {
    const m = CANON.replace('if (v === null || v === undefined) {', 'if (false) {');
    expect(judgeSource(m).failed).toContain('null_key_fail_loud');
  });
  it('a module-level singleton store fails injected_store_clock', () => {
    const m = CANON.replace('function keyOf(', 'const store = {};\nfunction keyOf(');
    expect(judgeSource(m).failed).toContain('injected_store_clock');
  });
  it('a repo-relative import fails builtins_only_import', () => {
    const m = "import { x } from '../../lib/eva/post-build-verdict-engine.js';\n" + CANON;
    expect(judgeSource(m).failed).toContain('builtins_only_import');
  });
});
