# FR-6 — Who consumes a resolved venture-less chairman decision?

**SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 · measured 2026-08-04 against the live production database**

FR-6 requires naming the consumer of a resolved venture-less decision, **or stating plainly that
none exists, so the gap is visible rather than assumed closed.**

## Answer: for a venture-less decision, there is no consumer. Nothing wakes.

Stated plainly because the alternative — shipping FR-1 and letting "it resolves now" imply "and
therefore something happens" — is the exact class FR-6 exists to prevent.

FR-1 is still worth applying. It converts a decision that **cannot be resolved** into one that
**resolves and is recorded**. That is a real improvement, and it is the whole of the improvement.
It does not deliver an answer to whoever asked.

## For a venture-JOINED decision the consumer is real

`trg_chairman_decision_unblock` (AFTER UPDATE, `WHEN new.status IN ('approved','rejected') AND
old.status IS DISTINCT FROM new.status`) → `trg_chairman_approval_unblock_orchestrator()`:

```sql
UPDATE ventures SET orchestrator_state = 'idle'
WHERE id = NEW.venture_id AND orchestrator_state = 'blocked';
```

A blocked orchestrator goes idle and is re-picked. That is a genuine wake.

## For a venture-LESS decision, three candidate consumers — all measured, all miss

### 1. The unblock trigger fires, and updates zero rows

The trigger's `WHEN` clause carries **no `venture_id` predicate**, so it fires for venture-less
rows exactly as it does for venture-joined ones. Then the body filters `WHERE id = NEW.venture_id`
— and `id = NULL` matches nothing.

> Measured: `SELECT count(*) FROM ventures WHERE id IS NULL` → **0**. No venture can ever match, so
> this is structural, not a data gap.

This is worse than an absent consumer. A consumer that fires and no-ops is why the wake looks
handled: the trigger is *right there* in the schema, named for the thing it is not doing.

### 2. & 3. The only application readers of a resolved row both SUPPRESS, and neither reaches these rows

`lib/adam/stall-alert.js` holds the only code that reads `chairman_decisions` filtered on a
resolved status. Both paths stop something; neither starts anything:

| path | what it does | can it see a venture-less row? |
|---|---|---|
| `isCorrelationTerminal` (:111) | stops a stall alert once the correlation is closed | **No** — keys on `brief_data->context->>correlation_id`; **0 of 354** venture-less resolved rows carry it |
| `findRecentlyDismissedStallDigest` (:170) | applies a re-escalation cooldown | **No** — keys on `summary LIKE '<stall digest>%'`; **0** venture-less resolved rows match |

So even the suppression paths never reach them.

## Identity is recorded, but it is not an address

The rows are not anonymous, which makes the gap easier to miss:

- `brief_data.raised_by` present on **225 of 231** resolved venture-less `session_question` rows
- but its value is a **role**, not a session: `adam` on **336 of 354** (then `null` ×12,
  `periodic-liveness-watcher` ×3, `fleet-worker:Charlie` ×1, and two more one-offs)
- `brief_data.context.sender_session` — the ephemeral session UUID that *would* be routable — is
  present on **0** of them. It lives on `session_coordination` rows, not here.
- `lib/chairman/record-pending-decision.mjs:279` is the only site that touches
  `raised_by` on this table, and it **writes**. Nothing reads it back.

## The outcome, measured end-to-end

Of **231** resolved venture-less `session_question` rows, **227 have no answer recorded on the row
at all** (`chairman_answer` / `resolved_answer` absent). Four do.

231 questions were asked. 4 answers came back to the record. That is
decision-recorded-nothing-consumes-it, counted.

## What this SD does and does not close

**Closes:** the decision can now be resolved (FR-1), it renders truthfully instead of as a
`[critical] Stage 0 Chairman Approval` that was three hardcoded constants (FR-3), a park reads as
HELD instead of REJECTED in both branches, and semantics follow `decision_type` rather than
venture-nullability (FR-2/FR-5).

**Does not close:** no wake path for a venture-less resolve. A routing mechanism (capture a routable session id at record time, then notify on resolve) is new
behaviour, not null-safety, and bundling it into a chairman-gated DDL migration would put a
feature inside a ceremony scoped to a bug fix.

**Not filed — and the wording matters.** An earlier draft said "filed rather than fixed", which
was untrue. This finding is *recorded* in three places that all depend on this SD: this document,
the SD's `metadata.fr6_consumer_finding`, and the PR body. A worker cannot materialise an SD, so
it has been surfaced to the coordinator for sourcing. Until it is sourced, the gap lives only
inside an SD that is itself parked awaiting a chairman ceremony — the parked-work-is-invisible
shape, one level up. Calling it "filed" would have made a gap look tracked when nothing tracks
it, in the document whose entire subject is things recorded and never consumed.

**Reproduce:** `.claude-work/fr6-find-consumer.mjs`, `.claude-work/fr6-measure-consumers.mjs`,
`.claude-work/fr6-remeasure.mjs` — all read-only.

---

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
