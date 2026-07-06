# Problem — deviation-record writer

**Domain**: while building, you *stray* from a planning artifact — a promised item
is dropped, reduced, or substituted. Straying is allowable; building sharpens the
picture. What is NOT allowable is UNDOCUMENTED drift — a promise that vanishes with
no record. The deviation record is the honesty control: a structured, referent-bound
note written AT the divergence that makes the drop reconcilable later.

**Reuse evidence** (why this domain earned a golden reference):

- **The silent scope-shrink / token-stuffing class**: the estate's post-build
  verdict walk once classified artifacts by name-token grep, so "gap" artifacts
  passed on collision noise. The REFERENT-AUDIT finding on that walk is explicit —
  *"deviation records are the honest control and token-stuffing is the failure mode
  to police."* A narrative that merely names a claim, without a structured record,
  is not documentation; it is drift dressed up as prose.
- **The estate's real deviation ledger** (`lib/eva/deviation-ledger.js`) shows the
  canonical shape: `recordDeviation({ artifactRef, what, instead, why, weight })`
  writes an append-only record BOUND to `artifactRef`; `readDeviations` reads it
  back by that referent. Its own docstring is the thesis: *straying from a planning
  artifact is allowable — what the rubric penalizes is UNDOCUMENTED drift, not
  documented, sensible deviation.* `why` is REQUIRED non-empty for EVERY weight,
  including `declared-descope`.
- **Reason quality is TWO-TIER, and length is necessary-not-sufficient**: the
  ledger (`lib/eva/deviation-ledger.js`) enforces only a NON-EMPTY `why`;
  `lib/eva/post-build-verdict-engine.js` `findQualifyingDeviation` applies a coarse
  length floor (`>=15`) to split `DEVIATED_WITH_DOCUMENTED_REASON` from
  `DEVIATED_UNDOCUMENTED` at the disposition level; but the ACTUAL anti-token-
  stuffing judgment is `lib/eva/adherence-scorer.js` `classifyDeviationReason`
  (SENSIBLE vs THIN: length floor AND a causal marker AND a word-count floor AND
  not a bare generic restatement). The source is explicit that length is
  *"necessary, not sufficient"* — a THIN reason (long but causal-less) is scored
  as a GAP. This reference's `qualifies()` distills the SENSIBLE gate, so coverage
  genuinely resists token-stuffing, not merely short text. `adherence-scorer.js` +
  `journey-evidence-merge.js` also read the `disposition` + `deviation_artifact_id`
  linkage on the verdict side.
- **A concrete silent-shrink pass condition** (one venture's remediation triage,
  NOT a canonical system gate): over `post_build_verdicts`, the count of
  `disposition='MISSING'` OR (`disposition='PARTIAL'` AND `deviation_artifact_id
  IS NULL`) must be ZERO. This reference distills the *shape* of that check into a
  pure `reconcile()` set difference; the reference's `undocumented` set is roughly
  `MISSING ∪ DEVIATED_UNDOCUMENTED` (it also surfaces THIN-reason gaps), so the
  correspondence is approximate, not verbatim.

**Vocabulary caveat** (do not miscopy): the categorical field here is `weight`
`{minor, moderate, critical, declared-descope}` — the estate's real, closed,
chairman-ratified taxonomy, where `declared-descope` IS the documented-skip
primitive (folded INTO the weight taxonomy, not a separate field). It is NOT the
`post_build_verdicts.disposition` column, whose values are `BUILT / PARTIAL /
MISSING / DEVIATED_*`. Naming your field "disposition" collides with a real column
of different values and teaches a taxonomy that contradicts the estate.

The record shape here (`{artifactRef, what, instead, why, weight}`) is a
DISTILLATION of `deviation-ledger.js`'s `artifact_data`, not a new invention —
`artifactRef` is the binding that makes coverage referent-bound; `why` is the
substance that makes a drop legal; `weight` is the closed taxonomy.

**Task shape a delegate will face**: record deviations for a new set of claims and
reconcile a planned scope against what was delivered, so that every drop is either
delivered or explained by a qualifying, referent-bound record — and a silent shrink
cannot pass.
