## Incidental (FR-4): the captures are double-counting themselves in the queue

Found while checking consumers of the view, not looked for.

`chairman_all_decision_signals` has a feedback-sourced branch keyed on
`severity='high' AND status='new' AND resolved_at IS NULL`, with **no category filter** — a
constraint already documented at `lib/governance/chairman-override-record.js:86-91`, where an audit
record is deliberately written as `severity:'medium', status:'resolved'` precisely to stay out of it.

The capture rows do not follow that precedent. Three of the four are `severity='high'`,
`status='new'`, so they surface as **pending decisions awaiting the chairman**, titled
`CAPTURED VERBAL DECISION: reject …` / `… approve …`. Measured: **3 of 4 present in the queue**
(the fourth, the hold ratification, is `severity='medium'` and so misses the predicate).

The effect is that every unresolvable decision is counted twice: the original row, still pending
because `fn_chairman_decide` cannot resolve it, **and** a capture of the chairman's own answer to
it, also pending. He is being re-asked a question he already answered, next to the question itself.

**Self-corrects on apply, deliberately not before.** `scripts/apply-chairman-decision-captures.mjs`
sets `feedback.status='resolved'` on each capture it applies, which drops it out of the predicate.
So the duplicates clear as part of FR-4 running post-ceremony. Their severity is **not** being
rewritten now: that is a production write to the chairman's queue outside the sequencing FR-4
states, and the noise is visible rather than harmful. Recorded here so it is a known state with a
known clearing condition, not a surprise.

> Method note: the first pass of this measurement keyed on `context.session_id` and reported "zero
> identity recorded". That was a **wrong-key artefact** — `session_id` is not a field on these rows.
> A control query enumerating the keys actually present surfaced `sender_session` and `raised_by`
> and corrected the finding to the one above. The zeros only became evidence once the key names
> were verified against the data instead of guessed.

## Metadata

- **Category**: Architecture
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003
- **Last Updated**: 2026-08-04
- **Tags**: chairman, decision-queue, fr-6, measured-finding
