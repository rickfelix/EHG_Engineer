# Problem — stage-gate check

**Domain**: a venture lifecycle stage needs a *gate check*: a decision that says
whether the stage may advance, with a reason and evidence, evaluated the same
way at every call site.

**Reuse evidence** (why this domain earned a golden reference):
- **Rank-1 hotspot**: `lib/eva/stage-execution-worker.js` tops the churn×complexity
  ledger (composite 0.9985) — stage logic is the estate's most-touched surface,
  and every stage needs gate decisions.
- **The predicate-schism class**: two *different* predicates deciding the same
  question at different call sites (`isBlocking` vs `stage_creates_decision`)
  diverged and produced gates that agreed with neither. One decision, one
  authoritative predicate function.
- **Throw ≠ pass class**: one estate gauge family treats a thrown detector as
  advisory (an exception silently reads as pass), and one forward-gate swallows
  every throw and fails open. An exception during evaluation is a BLOCK with a
  reason, never a pass.
- **Fail-open-by-truthiness class**: missing/undefined inputs falling through
  JS truthiness to a default-pass. Input presence is validated explicitly,
  first, and missing inputs BLOCK with the missing names in the reason.

**Task shape a delegate will face**: build the gate check for a new stage
(different inputs, different decision rule), preserving every invariant in the
application guide.
