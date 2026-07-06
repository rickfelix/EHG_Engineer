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
  `read → +1 → write` off the mutated row (it loses increments under interleaving).
- **Deterministic read-back** — read BY THE FULL COMPOSITE KEY (or an explicit `ORDER BY`);
  an unordered `limit 1` returns a nondeterministic/stale row (h1).
- **Verify the write landed + explicit `updated_at`, FAIL LOUD** — confirm the write affected
  the expected row by reading it back by full key and THROW if it did not (h4's silent no-op);
  stamp `updated_at` explicitly from the clock (h2); and FAIL LOUD on a null/undefined key
  component (NULL is distinct from NULL in a composite index, so a null key part silently
  duplicates). Contrast -F: this seam fails loud; it does not swallow.

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
- **Miss**: a silent-drop store makes the seam THROW; and the portable `upsertContract`
  ACCEPTS the golden seam (positive control) while REJECTING every broken copy — DO-NOTHING,
  SELF-READ, PARTIAL-KEY, NO-VERIFY, STALE-UPDATED-AT, NULL-KEY-UNSAFE — so a broken delegate
  copy is caught.
