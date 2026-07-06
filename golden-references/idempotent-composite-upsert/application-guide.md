# Application guide — idempotent composite-key upsert/write seam

Template-shaped for a delegate-tier session. You adapt `upsert-seam.mjs` to write a
composite-keyed row idempotently for your own venture/build; you do not need estate
context beyond this folder.

## Inputs

- **store** — the injected table adapter: `upsert(key, row)` (converge-to-latest on the
  full key), `getByKey(key)` (exact lookup), `atomicIncrement(key, field)` (a DB-atomic
  increment), `size()`, `all()`, `seed()`. In an application this is your DB client; here
  it is an in-memory demo. Replace it — do NOT model your table's unique index by
  string-joining key columns (that collides), key STRUCTURALLY on the tuple.
- **keyCols** — the FULL composite key columns (the exact columns of the table's unique
  index). A partial subset collapses distinct rows (data loss).
- **record** — the keyCols + payload; the new value comes from THIS external input, never
  from the row being mutated.
- **clock** — the injected time source; `updated_at` is stamped from it explicitly.

## Adaptation points

1. Replace `keyCols` with YOUR table's full composite-key columns (matching a real UNIQUE
   index); the seam's `onConflict` must match that index exactly.
2. Map `store` onto your DB adapter: `upsert` must DO UPDATE (converge), not `DO NOTHING`;
   `getByKey` must be an exact full-key lookup; `atomicIncrement` a DB-side increment /
   `RETURNING` / optimistic-lock — never an app-side read-then-write.
3. Keep the new value derived from `record` (external input); never read the mutated row to
   compute it.
4. Keep `updated_at` stamped explicitly from the clock — do NOT assume a DB trigger.

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Idempotent upsert on the FULL composite key** — two identical writes converge to ONE row
  and a later differing write converges to the LATEST value. A partial/wrong conflict key
  collapses distinct rows (data loss); insert-only duplicates; `ON CONFLICT DO NOTHING`
  silently drops updates.
- **Inputs not from the mutated row (version-counter carve-out)** — the new value is a pure
  function of external inputs. The ONLY legitimate monotonic counter is a DB-atomic increment
  / optimistic-lock (`... WHERE version = $expected`) / `RETURNING` — never an app-side
  `read → +1 → write` off the mutated row (it loses increments under interleaving). NOTE: the
  acceptance harness can only check this at the `bumpVersion` body layer (it forbids a
  `getByKey` there); it CANNOT see inside your DB adapter's `atomicIncrement`. Independently
  audit that your `atomicIncrement` is a single atomic statement, not a get-then-set hidden in
  the adapter — a racy counter buried in the adapter passes every automated check.
- **keyCols is an ORDERED tuple = the index definition** — the seam keys positionally, so
  `keyCols` must match your UNIQUE index's column order and be a FIXED per-table constant.
  Reordering it produces a distinct positional key (the demo store does not model an
  order-independent set-wise index).
- **Deterministic read-back** — read BY THE FULL COMPOSITE KEY (or an explicit `ORDER BY`);
  an unordered `limit 1` returns a nondeterministic/stale row (h1).
- **Verify the write landed (write-IDENTITY) + explicit `updated_at`, FAIL LOUD** — after the
  write, read the row back by the FULL key and confirm the INTENDED PAYLOAD is what landed;
  THROW on any mismatch (h4's silent no-op). Verify by the *payload*, NOT by `updated_at`
  equality alone: a silent drop-on-UPDATE can leave a stale row whose `updated_at` happens to
  equal this clock tick (h4 hiding under an h2 timestamp collision — real clocks collide at ms
  resolution under load), and an equality check FALSE-PASSES on it. Stamp `updated_at`
  explicitly from the clock (h2). (If your real table has an `updated_at` TRIGGER that owns the
  column, verify a per-write token / a `RETURNING` id instead of the stamped `updated_at`.)
  FAIL LOUD on an ILLEGAL key component — null/undefined (NULL is distinct from NULL, so a null
  part silently duplicates), a NON-FINITE number (NaN/Infinity JSON-serialize to `"null"` and
  forge a colliding key), a NON-SCALAR (serializes to a structure, not an index value), or a
  ZERO-COLUMN key (cannot discriminate rows -> over-merges every record into one). Contrast -F:
  this seam fails loud; it does not swallow.

### Estate-anchor mapping (positive vs cautionary — the estate is mixed)

| reference behavior                         | estate anchor                                                             |
|--------------------------------------------|---------------------------------------------------------------------------|
| full-key onConflict + explicit updated_at + verify | **POSITIVE** `post-build-verdict-engine.js` `upsertVerdict`        |
| no verify + no explicit updated_at         | **CAUTION** `convergence-ledger.js` `upsertStage` (misses h4)             |
| verify present, but no explicit updated_at | **CAUTION** `task-ledger.js`                                              |
| `version = existing.version + 1` (racy RMW)| **CAUTION** `archplan-upsert.js` — h3 in the wild                         |
| verify = read-back-by-full-key (identity)  | **strengthening** over the estate baseline `select().single()` (cardinality) |

## Acceptance (both directions)

Textual locks (`judgeSource` from `acceptance-locks.mjs`) are necessary but WEAK. The
behavioral contract is the real enforcement — especially the convergence, silent-drop
fail-loud, and partial-key checks no grep can prove — and it runs against YOUR module:

```
GOLDEN_REF_MODULE=<abs path to your upsert-seam.mjs> \
GOLDEN_REF_SRC=<abs path to your source> \
npx vitest run tests/unit/golden-references/upsert-seam-acceptance.test.js
```

- **Pass**: two identical writes leave one row; a later differing write wins; a null key
  component throws; distinct full keys stay distinct (structural keying); read-back by full
  key is exact and a miss returns null; an atomic version counter advances; `updated_at`
  advances with the clock.
- **Miss**: a silent-drop store makes the seam THROW; a drop-on-UPDATE store (INSERT lands, the
  UPDATE silently no-ops) with a COLLIDING timestamp still THROWS (write-identity, not
  updated_at-equality); a payload-dropped store THROWS; NaN/Infinity/empty-keyCols THROW; and
  the portable `upsertContract` ACCEPTS the golden seam (positive control) while REJECTING every
  broken copy — DO-NOTHING, SELF-READ, PARTIAL-KEY, NO-VERIFY, STALE-UPDATED-AT, NULL-KEY-UNSAFE,
  WEAK-VERIFY (updated_at-equality only), NAN-KEY-UNSAFE — so a broken delegate copy is caught.
