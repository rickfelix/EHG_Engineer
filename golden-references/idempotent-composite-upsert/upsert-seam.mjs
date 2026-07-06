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
// STRENGTHENS that (an improvement, not an estate description): after the write it reads the
// row back BY THE FULL COMPOSITE KEY and confirms the INTENDED PAYLOAD is what landed
// (write-IDENTITY), failing loud on any mismatch — which is what catches h4's SILENT no-op
// that the error/cardinality check alone does not.
//   Why identity, not just updated_at: verifying only `landed.updated_at === row.updated_at`
//   FALSE-PASSES a silent drop-on-UPDATE whenever the stale row already bears this clock tick
//   (h4 hiding under an h2 timestamp collision — real clocks collide at ms resolution under
//   load). The verify therefore compares the payload, not a single timestamp field. (If your
//   real table has an updated_at TRIGGER that owns the column, the seam's explicit stamp does
//   not apply — verify a per-write token / a RETURNING id instead of the payload's updated_at.)
//
// Four doctrines (each modeled + textual-lock + BEHAVIORALLY enforced):
//  1. IDEMPOTENT UPSERT ON THE FULL COMPOSITE KEY — two identical writes converge to ONE
//     row, and a later differing write converges to the LATEST value (not DO NOTHING). A
//     partial/wrong conflict key collapses distinct rows (data loss); insert-only duplicates.
//     keyCols is an ORDERED tuple matching the table's UNIQUE index definition (a fixed
//     per-table constant) — reordering it produces a distinct positional key.
//  2. INPUTS NOT DERIVED FROM THE MUTATED ROW (version-counter CARVE-OUT) — the new value is
//     a pure function of EXTERNAL inputs; never a racy read-modify-write off the mutated row.
//     An intentional monotonic counter is legitimate ONLY via a DB-atomic increment /
//     optimistic-lock / returning clause (modeled by store.atomicIncrement + bumpVersion),
//     never an app-side read-then-write. NOTE: the harness can only enforce this at the
//     bumpVersion body layer — it cannot see INSIDE your DB adapter's atomicIncrement, so you
//     must independently audit that it is a single atomic statement (UPDATE ... SET n=n+1
//     RETURNING, or WHERE version=$expected), not a get-then-set hidden in the adapter.
//  3. DETERMINISTIC READ-BACK — read BY THE FULL COMPOSITE KEY (never an unordered scan/limit-1).
//  4. VERIFY THE WRITE LANDED (write-identity) + EXPLICIT updated_at, FAIL LOUD — read the row
//     back by full key and confirm the INTENDED PAYLOAD is what landed; THROW if it did not
//     (h4); stamp updated_at explicitly from the injected clock (h2). Also FAIL LOUD on an
//     ILLEGAL key component: NULL/undefined (NULL is distinct from NULL in a composite unique
//     index, so a null key part silently duplicates), a NON-FINITE number (NaN/Infinity
//     JSON-serialize to "null" and forge a colliding key), a NON-SCALAR (an object/array
//     serializes to a structure, not a real index value), or a ZERO-COLUMN key (cannot
//     discriminate rows -> over-merges every record into one).

/** Deep-ish equality for a read-back payload field. Scalars compare by ===; nested values by
 *  a stable JSON encoding (both operands come from the same shaped record, so key order is
 *  consistent). Sufficient for the reference; a production verify would use the DB's own
 *  RETURNING row or a per-write token. CAVEAT for a real table: this is order-sensitive and
 *  exact, so a column the DB TRANSFORMS on read-back — jsonb re-sorted by key, undefined->null,
 *  a numeric returned as a string, a timestamptz normalized — would false-throw on a LEGITIMATE
 *  write. For such columns verify a per-write token / RETURNING id, not a payload deep-equal. */
function deepEq(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } // e.g. a BigInt payload -> fall back to !== (fail loud)
}

/** Guard a single composite-key component. FAILS LOUD on every value that cannot be a real
 *  scalar unique-index key: null/undefined, a non-finite number, or a non-scalar. Centralized
 *  so keyOf, readBack and bumpVersion all key through the SAME guard (no hole in one path). */
function assertKeyComponent(v, label) {
  if (v === null || v === undefined) {
    throw new Error(`[upsert-seam] ${label} is ${String(v)} — a NULL/undefined key component does not collide (NULL is distinct from NULL) and silently duplicates; refuse to key on it`);
  }
  const t = typeof v;
  if (t === 'number' && !Number.isFinite(v)) {
    throw new Error(`[upsert-seam] ${label} is ${String(v)} — a non-finite number serializes to "null" and forges a colliding key; refuse to key on it`);
  }
  if (t !== 'string' && t !== 'number' && t !== 'boolean') {
    // bigint is a scalar but JSON.stringify throws on it (an opaque failure) — a delegate with a
    // bigint id must stringify it first; reject here with the guided message rather than let the
    // key encoder throw a bare TypeError.
    throw new Error(`[upsert-seam] ${label} is a ${t} — a composite key component must be a JSON-encodable scalar (string/number/boolean); a non-scalar (or a BigInt) serializes to a structure / throws and silently mis-keys`);
  }
}

/** Assert the FULL keyCols is a usable ordered tuple (a zero-column key cannot discriminate
 *  rows and silently over-merges every record into one). */
function assertKeyCols(keyCols) {
  if (!Array.isArray(keyCols) || keyCols.length === 0) {
    throw new Error('[upsert-seam] keyCols must be a NON-EMPTY ordered tuple (the table\'s FULL composite unique-index columns) — a zero-column key cannot discriminate rows and silently over-merges every record into one');
  }
}

/** Structural composite key from the FULL keyCols — delimiter-safe (a JSON encoding so
 *  ["a|b","c"] and ["a","b|c"] never collide, unlike a string-join). FAILS LOUD on an illegal
 *  key component (see assertKeyComponent) or a zero-column key. */
function keyOf(keyCols, source) {
  assertKeyCols(keyCols);
  const vals = keyCols.map((c) => {
    const v = source[c];
    assertKeyComponent(v, `composite key column "${c}"`);
    return v;
  });
  return JSON.stringify(vals); // structural, delimiter-safe
}

/** VERIFY the write landed by write-IDENTITY: `landed` must exist AND every field of the
 *  intended `expected` row must be present and equal in it (a superset is fine — a DB may add
 *  generated columns like id). Comparing the PAYLOAD, not merely updated_at, is load-bearing:
 *  a silent drop-on-UPDATE can leave a stale row whose updated_at collides with this clock
 *  tick and false-pass an equality check (h4 hiding under h2). FAILS LOUD on any mismatch. */
function assertLanded(landed, expected, key) {
  if (!landed) {
    throw new Error(`[upsert-seam] write did not land for key ${key} — a silent no-op (CHECK/enum violation or where-matches-nothing) must FAIL LOUD, never be trusted`);
  }
  for (const c of Object.keys(expected)) {
    if (!deepEq(landed[c], expected[c])) {
      throw new Error(`[upsert-seam] write did not land for key ${key}: column "${c}" read back as ${JSON.stringify(landed[c])}, expected ${JSON.stringify(expected[c])} — a silent no-op / partial write (h4) must FAIL LOUD (verify write-IDENTITY, not just updated_at equality)`);
    }
  }
}

/**
 * Idempotent upsert on the FULL composite key. `record` carries the keyCols + payload; the
 * new value IS `record` (external input) — never read from the mutated row (h3). Stamps
 * updated_at from the injected clock (h2), upserts (converge-to-latest), then reads the row
 * back BY FULL KEY and FAILS LOUD unless the intended payload is what landed (h4).
 *
 * @param {{ upsert: Function, getByKey: Function }} store  injected table adapter.
 * @param {string[]} keyCols  the FULL composite key columns (ordered tuple = index definition).
 * @param {object} record  keyCols + payload (external input).
 * @param {{ clock: { now: () => number } }} opts  injected clock.
 * @returns {object} the row that landed.
 */
export function upsertByKey(store, keyCols, record, opts = {}) {
  const clock = (opts && opts.clock) || { now: () => 0 };
  const key = keyOf(keyCols, record);                 // fail-loud on illegal key component
  const row = { ...record, updated_at: clock.now() };  // explicit updated_at (h2); value = external input (h3)
  store.upsert(key, row);                              // converge-to-latest on the full key (DO UPDATE)
  const landed = store.getByKey(key);                 // VERIFY by read-back on the full key (h4)
  assertLanded(landed, row, key);                     // fail loud unless the INTENDED payload landed (write-identity)
  return landed;
}

/** Deterministic read-back BY THE FULL composite key (never an unordered scan). Returns null
 *  for a non-existent key (deterministically; does NOT throw — over-eager fail-loud would
 *  break legitimate misses). FAILS LOUD only on an illegal key component. */
export function readBack(store, keyCols, keyVals) {
  assertKeyCols(keyCols);
  if (keyVals.length !== keyCols.length) {
    throw new Error('[upsert-seam] readBack requires a value for every key column (the FULL key)');
  }
  keyVals.forEach((v, i) => assertKeyComponent(v, `readBack key column "${keyCols[i]}"`));
  return store.getByKey(JSON.stringify(keyVals));
}

/** The version-counter CARVE-OUT (doctrine 2): a monotonic counter done RIGHT — a DB-atomic
 *  increment, NOT an app-side read-modify-write off the mutated row. Survives interleaving.
 *  (The harness cannot verify atomicity INSIDE your adapter — audit atomicIncrement is a
 *  single atomic DB statement, not a get-then-set.) */
export function bumpVersion(store, keyCols, keyVals, field, opts = {}) {
  const clock = (opts && opts.clock) || { now: () => 0 };
  assertKeyCols(keyCols);
  if (keyVals.length !== keyCols.length) {
    throw new Error('[upsert-seam] bumpVersion requires a value for every key column (the FULL key)');
  }
  keyVals.forEach((v, i) => assertKeyComponent(v, `bumpVersion key column "${keyCols[i]}"`));
  const key = JSON.stringify(keyVals);
  return store.atomicIncrement(key, field, { updated_at: clock.now() }); // atomic; never read-then-write
}

/**
 * A DEMO in-memory store adapter modeling a real table with a UNIQUE INDEX over the full
 * composite key (delegates replace this with their DB adapter). Modes let the acceptance
 * suite make each hazard REAL:
 *   silentDrop:    upsert returns success-looking but writes NOTHING, always (models h4).
 *   dropUpdates:   INSERT (new key) lands, but any UPDATE (existing key) silently no-ops —
 *                  h4 on the UPDATE path only (the realistic case: a CHECK/enum on the new
 *                  value, a partial index, or a where-matches-nothing on an existing row).
 *   timestampOnly: writes ONLY updated_at, dropping the payload — a PARTIAL silent write (h4).
 *   insertOnly:    a second write to an existing key raises a unique-index violation (models a
 *                  seam using insert instead of upsert).
 */
export function makeStore(opts = {}) {
  const { silentDrop = false, insertOnly = false, dropUpdates = false, timestampOnly = false } = opts;
  const rows = new Map(); // structural key -> row
  return {
    upsert(key, row) {
      if (silentDrop) return { landed: false };                 // h4: silent no-op (always)
      if (insertOnly && rows.has(key)) {
        throw new Error('[store] unique-index violation: insert on an existing composite key (use upsert)');
      }
      if (dropUpdates && rows.has(key)) return { landed: false }; // h4: silent no-op on UPDATE only
      rows.set(key, timestampOnly ? { updated_at: row.updated_at } : { ...row }); // DO UPDATE: converge to latest
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
