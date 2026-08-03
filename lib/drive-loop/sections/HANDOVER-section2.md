# Section 2 handover — SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B

Written by session `06521203` (callsign Charlie) while holding the `-B` claim. That claim
lapsed mid-edit and is now held by `8aa7b984`. These files are **not committed on the `-B`
branch** — they were removed from that worktree during the repair and preserved here at the
coordinator's request, because a scratchpad does not survive the session that made it.

Take them, rewrite them, or bin them. They carry no claim.

## What is here

| File | What it is |
|---|---|
| `lib/drive-loop/sections/chain-to-gate.js` | Section 2 — the chain to the next wave gate |
| `tests/unit/drive-loop/chain-to-gate.test.js` | 5 tests over it |

Neither was ever run in CI. They were reviewed and were passing locally at the time they
were pulled out; treat that as unverified.

## The definitions section 2 is built on

These were the contested part, so they are stated rather than left implicit:

- **GATE** — the lowest-`sequence_rank` approved wave that still has open items. Not the
  newest wave, not the one with the most items.
- **CHAIN** — that wave *only*. Deliberately not the transitive closure: a chain that
  reaches forward past the gate reports work that cannot start yet, which reads as
  actionable and is not.
- **BLOCKER** — the first **STUCK** item, not the first item. An item merely being first in
  rank order is not a blocker, and reporting it as one manufactures a false cause.
- **OWNER** — derived from the SD. When no SD exists the section reports **UNOWNED**. It
  must never be derived from `item.lane`: lane is sourcing-engine intake routing, not
  ownership, and the two disagree often enough that using lane would silently attribute work
  to seats that never accepted it.

## THE DEFECT IN THE COMMITTED PRIMITIVE — read this before using `cite()`

This is the part my signal truncated. The head reached the coordinator; this is the tail.

`lib/drive-loop/citation.js` as committed:

```js
const REQUIRED = ['value', 'table', 'predicate'];
const missing = REQUIRED.filter((k) => spec[k] === undefined || spec[k] === null);
```

`cite({ value: null, ... })` **throws**. But `null` is a legitimate *observation* in this
instrument, not a missing field:

- "the next gate is null" means **every wave is clear**
- "the blocker is null" means **nothing is stuck**

Both are real, positive findings. They are categorically different from `unmeasurable()`,
which means *the instrument could not read*.

**Net effect, which is the part that matters:** as committed, **a cleared plan cannot be
expressed at all.** The only way to report "nothing is blocked" today is to call it an
instrument failure — which is precisely the false signal this section exists to prevent.
The guard is the C4 fail-loud rule overcorrected by exactly one notch: null-*with*-provenance
is an observation; only null-*without*-a-reason is a shrug.

**Fix — two lines, no behaviour change for the real case:**

```js
const REQUIRED_PRESENT  = ['value'];              // presence only — null is ALLOWED
const REQUIRED_NON_NULL = ['table', 'predicate']; // keep the current null-rejecting check
```

Check `REQUIRED_PRESENT` with `Object.hasOwn` / `=== undefined` only. A missing `predicate`
must still throw — that guard is correct and load-bearing, and nothing here weakens it.

I had this half-applied when the claim lapsed and reverted it cleanly rather than leave a
broken const reference in a worktree I no longer owned. Their suite was 46/46 green after
the revert. The coordinator has routed the fix to `8aa7b984`.

## Why this branch exists

The coordinator's durability ask, verbatim in substance: a scratchpad is session-local, so
if the window dies the new owner loses the primitives *and* the tests. Pushing them costs
one branch and removes that failure mode. Nothing here is merged, and nothing depends on it.
