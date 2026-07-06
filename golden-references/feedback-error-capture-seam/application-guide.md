# Application guide — feedback/error capture seam

Template-shaped for a delegate-tier session. You adapt `capture-seam.mjs` to wrap a
risky operation for your own venture/build; you do not need estate context beyond
this folder.

## Inputs

- **op** — the risky operation to run. If it RETURNS (even a falsy value), that is a
  success. If it THROWS, that is a failure to capture.
- **sink** — the injected durable ledger: `append(entry)` writes a row,
  `findByHash({ category, dedup_hash })` returns an existing row or falsy. In an
  application this is the `feedback` table via `emit-feedback.js`; here it is an
  in-memory object.
- **logger** — the injected stderr sink: `error(line)`. Kept separate from the row so
  a failure is both durable (row) and immediately visible (stderr).
- **clock** — the injected time source: `now()` returns epoch ms. Injected so the
  per-UTC-day dedup boundary is deterministic (never `Date.now()` inside the seam).
- **category / type / source / severity** — the routing + identity of the failure;
  `source` and the error's `symptom` (message) form the stable dedup identity.

## Adaptation points

1. Replace `op` with your risky operation; keep the discrimination throw-vs-return
   (do NOT test the return value for truthiness — a valid `0`/`''`/`false`/`null`
   return is a success).
2. Map `sink` onto your durable channel (`append` + a `findByHash` co-scoped by
   `category` + `dedup_hash`); in the estate that is `emit-feedback.js` over `feedback`.
3. Map `logger` onto your stderr writer.
4. Choose `category`/`type`/`severity` for your routing; `source` should be stable per
   call site so recurrences dedup.
5. Keep `symptom` derived safely from the thrown value (a non-`Error` throw must not
   break the coercion).

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Capture at the boundary, never swallow** — a failure records a structured,
  schema-shaped entry to the sink. An empty `catch` that discards the error is the
  anti-pattern; a guessed column that silently no-ops is its schema cousin.
- **Best-effort but never silent** *(seam-design hardening — see the note below)* — the
  seam NEVER throws (returns `{ ok:false, error }` so the caller is not broken) AND, on a
  first capture, emits BOTH a durable row AND a stderr line. Critically, the capture
  itself is best-effort: a throwing `sink.append` or `logger.error` is caught, so the
  anti-swallow seam never becomes a swallow footgun. An UNGUARDED sink call is exactly
  that footgun.
- **Dedup on stable fields only, per-UTC-day, category-scoped** — `dedup_hash =
  sha256(utcDay::symptom::source)` over STABLE fields; `emitted_at` is stored on the row
  but MUST NOT join the hash, or identical failures flood. Dedup is per-UTC-day and
  co-scoped by `category`; a recurrence across a UTC-day boundary, or under a different
  category, is intentionally a fresh row. A deduped recurrence writes NO new row AND NO
  new stderr — re-emitting is the flood.
- **Healthy path is silent** — a success writes no row and emits no stderr.

> **Hardening note (attribution honesty)**: the never-throw and the per-capture stderr
> are deliberate seam-design choices, NOT distilled from `emit-feedback.js` (which throws
> on insert/validation and is silent on success; `log-harness-bug.js` uses stdout). The
> estate's `console.warn` enrichment paths and `console.error` dual-write path are the
> "never fully silent" seed this reference composes into a per-capture guarantee.

### Estate-anchor mapping

| reference field / behavior            | estate anchor                                                              |
|---------------------------------------|----------------------------------------------------------------------------|
| `sink.append(entry)`                  | `lib/governance/emit-feedback.js` `emitFeedback` → `feedback` row           |
| `symptom`                             | `feedback` *description* (the stable dedup component)                       |
| `dedup_hash = sha256(utcDay::symptom::source)` | `sha256(today::description::dedup_key)`, `today` = UTC day        |
| `findByHash({category, dedup_hash})`  | dedup CHECK co-scoped by `(category, metadata->>dedup_hash)`               |
| `emitted_at` stored, excluded from hash | volatile row metadata; `source_id`/`status`/`notes` excluded from hash    |
| never-throw + per-capture stderr      | **hardening** — cited from `_autoFillDeferredFromSdKey` + the dual-write catch/warn |

## Acceptance (both directions)

Textual locks (`judgeSource` from `acceptance-locks.mjs`) are necessary but WEAK. The
behavioral contract is the real enforcement — especially the throwing-sink/logger and
swallow checks no grep can prove — and it runs against YOUR module:

```
GOLDEN_REF_MODULE=<abs path to your capture-seam.mjs> \
GOLDEN_REF_SRC=<abs path to your source> \
npx vitest run tests/unit/golden-references/capture-seam-acceptance.test.js
```

- **Pass**: a planted throw yields `ok:false` + exactly one row + at least one stderr
  line and does not throw; a falsy-but-valid return is a silent success; an identical
  recurrence dedups (no new row, no new stderr); a day boundary or a new category makes
  a fresh row.
- **Miss**: a swallow (no row + no stderr), a throw-through, an always-write, a
  dedup-break (volatile field in the hash), and an unguarded sink (propagates on
  `sink.append` failure) are each REJECTED by the portable `captureContract` checker —
  so a broken delegate copy is caught.
