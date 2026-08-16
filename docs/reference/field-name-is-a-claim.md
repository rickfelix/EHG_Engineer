---
category: Reference
status: Approved
version: 1.0.0
author: QF-20260728-720
last_updated: 2026-08-15
tags: [fleet-state, testing, reliability, observability]
---

# A Field's Name Is a Claim, and a Claim Needs a Negative Test

**QF-20260728-720.** Six fleet-state fields were measured whose NAME asserts one thing
and whose IMPLEMENTATION measures something cheaper that correlates with it under
normal conditions — and **decouples exactly under the conditions the field was built
to detect.** That is why several of these failed on the same evening rather than on
an ordinary day: they are fine until something is wrong, which is the only time
anyone reads them.

## The class

| Field | Name asserts | Implementation actually measures |
|---|---|---|
| `commits_since_claim` | this seat's work | repository-wide commits since `claimed_at` (`git log --since`, no `--author`, no branch restriction) — rises when *other* workers commit |
| `acknowledged_at` | the message was answered | a stamp written on the **sender's own row**, which the sender never reads |
| `last_tool_at` | progress | activity — advances on any tool call, so a seat re-checking its own blocked state satisfies it forever |
| `loop_state='awaiting_tick'` | a wakeup is pending and will clear when it fires | ~~a one-way latch cleared ONLY by the `SessionStart` hook~~ — **fixed since** by `SD-LEO-INFRA-LOOP-STATE-AWAITING-001`: `scripts/hooks/loop-state-resume-clear.cjs`, a `UserPromptSubmit` hook (fires on every turn, including a wakeup that resumes an already-running session with no `SessionStart`) |
| `delivered_at` | the SMS reached the handset | when a reconciler sweep happened to run — with delivery callbacks disabled, observed sent→delivered lag ranged from 906s to 42,362s (11.8h) |
| `loop_state='exited'` | the worker's loop ended (a worker-side decision) | the sweep released this session during a cycle — conflates "coordinator released me" with "I deliberately wound down"; today nothing writes the deliberate-exit case at all |

## The executable form

The first formulation — *"what would this field read if the thing it names were
FALSE?"* — tests the **author's model**, not the field. An author who believes the
thing works answers correctly under their own model and ships. It only fires for
someone who already suspects the divergence, which is the population that doesn't
need it.

**The replacement: construct the false state and assert the field does not claim
truth.** One test per field:

| Field | Negative test recipe | Status |
|---|---|---|
| `commits_since_claim` | Freeze "this seat" (zero commits since claiming); have a *different* author commit in the same window; assert the field stays 0. | **Implemented**, `it.fails` (live defect — companion fix QF-20260728-430, open) — `tests/unit/hooks/post-tool-clear-telemetry-commits-since-claim-negative.test.js` |
| `acknowledged_at` | Never answer a signal/message; assert `acknowledged_at` does not stamp on the row a reader would actually query. | Recipe only — deferred. The write-site survey for this QF did not converge on a single canonical "was my message answered" read/write pair within scope; several legitimate same-row claim-marker usages of `acknowledged_at` exist (e.g. `lib/coordinator/relay-queue.cjs` drain-claim, `lib/coordinator/signal-router.cjs` route-ack) that are NOT instances of this defect. Follow-up: identify the specific sender-row-vs-reader-row mismatch before writing the test, rather than testing the wrong site. |
| `last_tool_at` | Have a seat re-check its own blocked state; assert the "progress" reading does not advance. | **Recipe only, by design** — the QF's own text: "this one likely requires renaming the field rather than testing it." `last_tool_at` accurately measures activity; the mismatch is the NAME implying progress, not a code defect. Rename is a separate, larger, cross-consumer change (many readers), out of scope here. |
| `loop_state='awaiting_tick'` | Fire a wakeup inside an already-running session; assert `awaiting_tick` clears. | **Already implemented, passes** — `tests/unit/hooks/loop-state-resume-clear.test.js` (12 tests, including one literally titled "the hook is REGISTERED on the event that actually fires per turn... in the UserPromptSubmit group, not SessionStart"). **Correction to an earlier version of this doc**: a first pass here checked only `scripts/hooks/session-register.cjs` (the `SessionStart`-only clearer) and concluded the gap was still live — it missed that `SD-LEO-INFRA-LOOP-STATE-AWAITING-001` had already shipped a second, `UserPromptSubmit`-registered clearer (`scripts/hooks/loop-state-resume-clear.cjs`) specifically to close this exact gap. Lesson: checking one writer/clearer site is not the same as checking whether the gap has a fix anywhere — verify against current `main` and the SD's own completion, not just the mechanism named in the original finding. QF-20260728-338 (a separate, narrower fix) remains escalated/unfixed, but is superseded for this specific negative test by the SD above. |
| `delivered_at` | Disable delivery callbacks; send; assert `delivered_at` stays NULL (not "delivered early" via a stale reconciler read). | Recipe only — deferred. Requires mocking the Twilio/messaging-provider seam and the reconciler sweep together; the existing `sms_reply_matchable` work this session (SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001) touched an adjacent but distinct path (decision staging, not delivery-status reconciliation). |
| `loop_state='exited'` | Have a worker end its loop WITHOUT the sweep releasing it; assert `loop_state` reads `'exited'`. Today nothing writes it on that path. | **Implemented**, structural census, passes today (honestly documents the gap) — `tests/unit/hooks/loop-state-exited-negative.test.js`. Asserts the ONLY write site repo-wide is the sweep's bulk release-update; a second writer appearing forces this test to be revisited. |

## How to apply

- **Never treat a name as a contract.** Read the writer before quoting the field.
  Every row above was settled by reading the producing code, not by reasoning about
  the schema or the column name.
- **A missing value is not a negative result.** `delivered_at` reading NULL at 13
  minutes is *below the observed minimum lag* and means nothing — measure the lag
  distribution before treating an absence as a failure.
- **A field with no negative test is a check that cannot fail, at the storage
  layer.** A positive test ("after work happens, the field is non-empty") passes for
  every field in this table and is what most of them have. Only the negative test
  distinguishes a field that measures the named thing from one that merely
  correlates with it under normal conditions.
- **When a recipe is deferred, say why and where the ambiguity is** — "no test" and
  "investigated, ambiguous, deferred with a specific open question" are different
  states; only write the ledger to look like the former when it's actually the
  latter.
- **A single confirmed writer/clearer is not proof there is only one.** The
  `awaiting_tick` row in this table was first marked "confirmed still live" after
  reading exactly one clearer (`session-register.cjs`, `SessionStart`-only) and
  concluding the gap was unchanged — without checking whether a *different* fix had
  landed elsewhere. It had (`loop-state-resume-clear.cjs`, `UserPromptSubmit`).
  Grep for every write site before asserting a gap is still open, the same way this
  document already asks you to grep for every write site before trusting a field's
  name.

## Provenance

Named after `delivered_at` made it five (2026-07-28); the executable form is a
refutation-driven correction of the original introspective formulation. The sixth
field (`loop_state='exited'`) was found live by a separate fleet seat the same
evening, after three earlier candidates were rejected against this same test.
Filed as QF-20260728-720; this document and its two implemented tests are that
QF's "record the class" deliverable.
