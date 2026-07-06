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
- **The legality boundary is REASON QUALITY, not a category**
  (`lib/eva/post-build-verdict-engine.js`): `computeDisposition` splits
  `DEVIATED_WITH_DOCUMENTED_REASON` from `DEVIATED_UNDOCUMENTED` via
  `findQualifyingDeviation` — a reason qualifies by substance (length threshold),
  not by which weight it carries. `lib/eva/adherence-scorer.js` and
  `journey-evidence-merge.js` read the `disposition` + `deviation_artifact_id`
  linkage on the verdict side.
- **The real silent-shrink reconcile query** (over `post_build_verdicts`): the
  count of `disposition='MISSING'` OR (`disposition='PARTIAL'` AND
  `deviation_artifact_id IS NULL`) must be ZERO — an undocumented gap is a MISSING
  or PARTIAL claim with no qualifying deviation linked to it. This reference
  distills that query into a pure `reconcile()` set difference.

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
