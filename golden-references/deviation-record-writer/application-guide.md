# Application guide — deviation-record writer

Template-shaped for a delegate-tier session. You adapt `deviation-writer.mjs` to
record deviations and reconcile a scope for your own venture/build; you do not
need estate context beyond this folder.

## Inputs

- **Expected scope** — the list of planned referents (claims / stories / artifacts)
  you promised to deliver. Each is identified by a stable `artifactRef`.
- **Delivered** — the referents actually delivered.
- **Sink** — the injected append-only ledger (`makeSink()` here; a
  `venture_artifacts` adapter in an application). `recordDeviation` writes to it;
  `reconcile` reads a snapshot of it. It is a per-call value, never a singleton.
- **Deviation** — for each divergence, the four things that make it documented:
  `artifactRef` (which promise), `what`/`instead` (the expected/actual pair),
  `why` (the substantive reason), and `weight` (how big — the closed taxonomy).

## Adaptation points

1. Replace `artifactRef` values with YOUR stable referents (a story key, an
   artifact id) — the same identifiers you pass to `reconcile` as `expected`.
2. Fill `what`/`instead` with the concrete expected-vs-actual for the drop, and a
   substantive `why` (a thin placeholder will record but will NOT cover).
3. Choose a `weight` from `{minor, moderate, critical, declared-descope}` —
   `declared-descope` for a deliberate, documented drop.
4. Map `makeSink()` onto your durable ledger (append + read-back-by-referent);
   in the estate that is `deviation-ledger.js` over `venture_artifacts`.
5. Tune `qualifies` (the SENSIBLE gate) to your rubric — it distills the estate's
   `classifyDeviationReason` (length floor + causal marker + word count + not
   generic), not merely `findQualifyingDeviation`'s length floor.

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Write at divergence, referent-bound** — record the deviation at the moment you
  decide to diverge, BOUND to the specific `artifactRef` it explains. A record
  reconstructed after the walk, or bound to nothing, is narrative, not evidence.
- **Structured, not narrative** — the required trio is `artifactRef` + a non-empty
  `why` + a `weight` in the closed allowlist. A malformed or free-text-only record
  is REJECTED (thrown), never silently stored. This is the token-stuffing defense.
- **Closed weight taxonomy + reason-quality legality** — `weight` must be in
  `{minor, moderate, critical, declared-descope}`; `why` is required non-empty at
  write time (the ledger tier); but COVERAGE additionally requires a SENSIBLE `why`
  — one that clears a length floor AND carries a causal marker AND is not a bare
  restatement (the estate's `classifyDeviationReason` sense-making pass). Length is
  necessary, not sufficient: a long causal-less reason is THIN and does NOT cover,
  so token-stuffing cannot buy coverage. (A *short* reason fails the length floor; a
  *THIN* reason clears length but not sense-making — the estate scores both as
  gaps.) Do NOT rename `weight` to "disposition": that collides with
  `post_build_verdicts.disposition` (values `BUILT/PARTIAL/MISSING/DEVIATED_*`) and
  teaches a taxonomy the estate contradicts.
- **Reconcile defeats silent shrink** — an expected item is undocumented unless it
  was delivered OR a deviation is bound to THAT item AND carries a qualifying
  reason. Coverage is REFERENT-BOUND: a record for a different item, or a thin
  reason, does not cover. A reconcile that greens on the mere existence of some
  deviation is the self-mask hole (the -D lesson) — it must check the referent.

### Estate-anchor mapping

| reference field / behavior            | estate anchor                                                              |
|---------------------------------------|----------------------------------------------------------------------------|
| `recordDeviation({artifactRef,...})`  | `lib/eva/deviation-ledger.js` `recordDeviation` → `artifact_data`           |
| `artifactRef` binding                 | `readDeviations` reads back by `artifact_ref`                              |
| `weight` `{...declared-descope}`      | `DEVIATION_WEIGHTS` (chairman-ratified; `declared-descope` = documented skip)|
| `qualifies(why)` (SENSIBLE gate)      | `adherence-scorer.js` `classifyDeviationReason` (length + causal + words + not-generic); `findQualifyingDeviation` is the coarser length-only disposition split |
| `reconcile` → `undocumented`          | approximates `MISSING ∪ DEVIATED_UNDOCUMENTED`; the `post_build_verdicts` `MISSING OR (PARTIAL AND deviation_artifact_id IS NULL)=0` count is one venture's remediation pass condition, not a canonical gate |
| `reconcile` covered                   | verdict `DEVIATED_WITH_DOCUMENTED_REASON`                                   |
| **caveat**: `weight` ≠ `disposition`  | `post_build_verdicts.disposition` is a DIFFERENT column (`BUILT/PARTIAL/…`) |

## Acceptance (both directions)

Textual locks (`judgeSource` from `acceptance-locks.mjs`) are necessary but WEAK.
The behavioral contract is the real enforcement — especially the WRONG-REFERENT and
thin-reason checks no grep can prove — and it runs against YOUR module:

```
GOLDEN_REF_MODULE=<abs path to your deviation-writer.mjs> \
GOLDEN_REF_SRC=<abs path to your source> \
npx vitest run tests/unit/golden-references/deviation-writer-acceptance.test.js
```

- **Pass**: a documented `declared-descope` with a qualifying `why`, bound to the
  dropped referent, covers the drop (`undocumented` empty); all four weights are
  accepted; delivery alone empties the gap set.
- **Miss**: a drop with no record is surfaced; a record naming a DIFFERENT referent
  does not cover; a thin `why` records but does not cover; an unrecognized weight, a
  missing referent, or an empty `why` each throw. The suite also proves its own
  TEETH — an always-empty, existence-not-referent, or reason-blind reconcile is
  rejected by the portable contract checker, so a broken delegate copy is caught.
