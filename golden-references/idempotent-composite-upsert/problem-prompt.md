# Problem — idempotent composite-key upsert/write seam

**Domain**: you must write a row keyed on a COMPOSITE key so that repeating the write is
safe (idempotent) and the write is never silently lost. This is a documented recurring bug
CLASS, not a one-off. Four hazards recur:

- **h1 — unordered "limit 1" read**: reading a row back with an unordered `limit 1` returns a
  nondeterministic/stale row when more than one matches.
- **h2 — `updated_at` without a trigger**: relying on `updated_at` to reflect a write when the
  table has no trigger to set it (many do not).
- **h3 — read-modify-write off the mutated row**: computing the new value by reading the same
  row you are about to write (racy; loses updates under interleaving).
- **h4 — the silent no-op**: the client swallows a CHECK/enum violation (or a
  where-matches-nothing) as *no error, no row change* — a write that VANISHES.

**Reuse evidence** — and the estate is INTENTIONALLY MIXED; that mix IS the bug class (do not
read it as a uniform pattern):

- **POSITIVE exemplar** — `lib/eva/post-build-verdict-engine.js` `upsertVerdict`: a full-key
  `onConflict` (`venture_id,artifact_type,claim_ref`) + an EXPLICIT `updated_at` + a verify read
  (`select('id').single()`). This is the shape the doctrines prescribe.
- **CAUTIONARY exemplars** (real estate the doctrines harden AGAINST):
  - `lib/coordinator/convergence-ledger.js` `upsertStage` — upserts on `run_id,stage` but does
    NOT verify and does NOT set `updated_at` explicitly (only inspects the error object → misses h4).
  - `lib/adam/task-ledger.js` — verifies, but does not stamp `updated_at` explicitly.
  - `lib/eva/archplan-upsert.js` — `version = existing.version + 1`, read off the SAME `plan_key`
    row it then upserts: **h3 in the wild** (a racy read-modify-write).

**VERIFY mechanism** — the estate BASELINE is a *cardinality* check (`select().single()` throws
on 0/many rows; the client sets an error on a real constraint violation). This reference
STRENGTHENS that (an improvement, labeled — not an estate description): it reads the row back BY
THE FULL COMPOSITE KEY and fails loud if the write did not land — which is what catches h4's
SILENT no-op that the error/cardinality check alone does not.

**Contrast with the -F capture seam**: that seam is best-effort and NEVER throws; THIS seam must
**fail loud** on a vanished write. Idempotency here means repeat identical writes CONVERGE to one
row (and a later differing write converges to the LATEST) — not that errors are swallowed, and
not `ON CONFLICT DO NOTHING`.

**Task shape a delegate will face**: write a row keyed on a composite key so two identical writes
leave one row, a later differing write wins, a null key component is refused, the write is read
back by the full key and fails loud if it did not land, and a monotonic counter (if any) uses a
DB-atomic increment rather than a read-modify-write.
