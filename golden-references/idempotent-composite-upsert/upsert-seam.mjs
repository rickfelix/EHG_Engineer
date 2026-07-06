// Golden reference — idempotent composite-key upsert/write seam (REFERENCE ONLY, never wired).
// Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-G (the LAST family child).
//
// An idempotent write keyed on a COMPOSITE key is a documented recurring bug CLASS.
// Four hazards this reference hardens against:
//   h1  an unordered "limit 1" read returns a nondeterministic/stale row.
//   h2  updated_at relied on without a DB trigger (do NOT assume a trigger exists).
//   h3  the new value read FROM the row you are about to mutate (a racy read-modify-write).
//   h4  the client SILENTLY no-ops on a CHECK/enum violation (or a where-matches-nothing):
//       no error, no row change — a write that VANISHES.
//
// The estate is INTENTIONALLY MIXED — that mix IS the bug class (do not read it as a
// uniform pattern):
//   POSITIVE  lib/eva/post-build-verdict-engine.js upsertVerdict — full-key onConflict
//             (venture_id,artifact_type,claim_ref) + EXPLICIT updated_at + a verify read.
//   CAUTION   lib/coordinator/convergence-ledger.js upsertStage — no verify + no explicit
//             updated_at (only checks the error object -> misses h4).
//   CAUTION   lib/adam/task-ledger.js — verifies, but does not set updated_at explicitly.
//   CAUTION   lib/eva/archplan-upsert.js — version = existing.version + 1 read off the SAME
//             row it then upserts: h3 (racy read-modify-write) in the wild.
//
// CONTRAST with the -F capture seam (best-effort NEVER-throws): THIS seam must FAIL LOUD
// on a vanished write — the bug it fights is a write that disappears without an error.
//
// VERIFY mechanism: the estate BASELINE is a cardinality check (select().single() throws
// on 0/many rows; the client sets an error on a real constraint violation). This reference
// STRENGTHENS that (an improvement, not an estate description): it reads the row back BY THE
// FULL COMPOSITE KEY and fails loud if the write did not land — which is what catches h4's
// SILENT no-op, that the error/cardinality check alone does not.
//
// Four doctrines (each modeled + textual-lock + BEHAVIORALLY enforced):
//  1. IDEMPOTENT UPSERT ON THE FULL COMPOSITE KEY — two identical writes converge to ONE
//     row, and a later differing write converges to the LATEST value (not DO NOTHING). A
//     partial/wrong conflict key collapses distinct rows (data loss); insert-only duplicates.
//  2. INPUTS NOT DERIVED FROM THE MUTATED ROW (version-counter CARVE-OUT) — the new value is
//     a pure function of EXTERNAL inputs; never a racy read-modify-write off the mutated row.
//     An intentional monotonic counter is legitimate ONLY via a DB-atomic increment /
//     optimistic-lock / returning clause (modeled by store.atomicIncrement + bumpVersion),
//     never an app-side read-then-write.
//  3. DETERMINISTIC READ-BACK — read BY THE FULL COMPOSITE KEY (never an unordered scan/limit-1).
//  4. VERIFY THE WRITE LANDED + EXPLICIT updated_at, FAIL LOUD — confirm the write affected
//     the expected row (read back by full key) and THROW if it did not (h4); stamp updated_at
//     explicitly from the injected clock (h2). Also FAIL LOUD on a NULL/undefined key
//     component (NULL is distinct from NULL in a composite unique index, so a null key part
//     silently duplicates).

/** Structural composite key from the FULL keyCols — delimiter-safe (a JSON encoding so
 *  ["a|b","c"] and ["a","b|c"] never collide, unlike a string-join). FAILS LOUD on a
 *  null/undefined component (a null key part does not collide -> duplicate rows). */
function keyOf(keyCols, source) {
  const vals = keyCols.map((c) => {
    const v = source[c];
    if (v === null || v === undefined) {
      throw new Error(`[upsert-seam] composite key column "${c}" is ${String(v)} — a NULL/undefined key component does not collide (NULL is distinct from NULL) and silently duplicates; refuse to key on it`);
    }
    return v;
  });
  return JSON.stringify(vals); // structural, delimiter-safe
}

/**
 * Idempotent upsert on the FULL composite key. `record` carries the keyCols + payload; the
 * new value IS `record` (external input) — never read from the mutated row (h3). Stamps
 * updated_at from the injected clock (h2), upserts (converge-to-latest), then reads the row
 * back BY FULL KEY and FAILS LOUD if the write did not land (h4).
 *
 * @param {{ upsert: Function, getByKey: Function }} store  injected table adapter.
 * @param {string[]} keyCols  the FULL composite key columns.
 * @param {object} record  keyCols + payload (external input).
 * @param {{ clock: { now: () => number } }} opts  injected clock.
 * @returns {object} the row that landed.
 */
export function upsertByKey(store, keyCols, record, opts = {}) {
  const clock = (opts && opts.clock) || { now: () => 0 };
  const key = keyOf(keyCols, record);                 // fail-loud on null-in-key
  const row = { ...record, updated_at: clock.now() };  // explicit updated_at (h2); value = external input (h3)
  store.upsert(key, row);                              // converge-to-latest on the full key (DO UPDATE)
  const landed = store.getByKey(key);                 // VERIFY by read-back on the full key (h4)
  if (!landed || landed.updated_at !== row.updated_at) {
    throw new Error(`[upsert-seam] write did not land for key ${key} — a silent no-op (CHECK/enum violation or where-matches-nothing) must FAIL LOUD, never be trusted`);
  }
  return landed;
}

/** Deterministic read-back BY THE FULL composite key (never an unordered scan). Returns null
 *  for a non-existent key (deterministically; does NOT throw — over-eager fail-loud would
 *  break legitimate misses). FAILS LOUD only on a null/undefined key component. */
export function readBack(store, keyCols, keyVals) {
  if (keyVals.length !== keyCols.length) {
    throw new Error('[upsert-seam] readBack requires a value for every key column (the FULL key)');
  }
  keyVals.forEach((v, i) => {
    if (v === null || v === undefined) {
      throw new Error(`[upsert-seam] readBack key column "${keyCols[i]}" is ${String(v)} — read by the FULL non-null composite key`);
    }
  });
  return store.getByKey(JSON.stringify(keyVals));
}

/** The version-counter CARVE-OUT (doctrine 2): a monotonic counter done RIGHT — a DB-atomic
 *  increment, NOT an app-side read-modify-write off the mutated row. Survives interleaving. */
export function bumpVersion(store, keyCols, keyVals, field, opts = {}) {
  const clock = (opts && opts.clock) || { now: () => 0 };
  const key = JSON.stringify(keyVals);
  return store.atomicIncrement(key, field, { updated_at: clock.now() }); // atomic; never read-then-write
}

/**
 * A DEMO in-memory store adapter modeling a real table with a UNIQUE INDEX over the full
 * composite key (delegates replace this with their DB adapter). Modes let the acceptance
 * suite make each hazard REAL:
 *   silentDrop: upsert returns success-looking but writes NOTHING (models h4).
 *   insertOnly: a second write to an existing key raises a unique-index violation (models a
 *               seam using insert instead of upsert).
 */
export function makeStore(opts = {}) {
  const { silentDrop = false, insertOnly = false } = opts;
  const rows = new Map(); // structural key -> row
  return {
    upsert(key, row) {
      if (silentDrop) return { landed: false };                 // h4: silent no-op
      if (insertOnly && rows.has(key)) {
        throw new Error('[store] unique-index violation: insert on an existing composite key (use upsert)');
      }
      rows.set(key, { ...row });                                 // DO UPDATE: converge to latest
      return { landed: true };
    },
    getByKey(key) { return rows.has(key) ? { ...rows.get(key) } : null; },
    atomicIncrement(key, field, extra = {}) {                    // models a DB-side atomic increment / returning
      const cur = rows.get(key) || {};
      const next = { ...cur, ...extra, [field]: (cur[field] || 0) + 1 };
      rows.set(key, next);
      return { ...next };
    },
    all() { return [...rows.values()].map((r) => ({ ...r })); }, // an UNORDERED scan (a limit-1 misuse target)
    size() { return rows.size; },
    seed(key, row) { rows.set(key, { ...row }); },               // test seeding (poison-row, adversarial ordering)
  };
}
