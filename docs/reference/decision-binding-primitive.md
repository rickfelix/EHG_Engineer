# Decision-Binding Disposition Primitive

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: Claude (EXEC, SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001)
**Last Updated**: 2026-07-08
**Tags**: decision-binding, disposition, question_key, system_events, ratification, consult-answer

## Problem

A gating decision (a chairman ratification, a Solomon/Adam consult answer)
historically lived in an ephemeral, session-addressed message — a
`session_coordination` row, an unmerged docs branch, a visual-only HTML
button with no capture path — while the blocking state it controls lived in
`strategic_directives_v2` metadata. The binding between the two was lost
across session succession, and dedup keyed on `correlation_id` could not see
a re-asked question because that key rotates per session.

## The primitive

`lib/decision-binding/disposition.js` exposes a durable
record-and-state-machine over any gating decision:

```
awaiting_disposition -> dispositioned -> consumed
```

Every disposition is keyed on a `question_key` — a `sha256` hash derived
**purely from decision content** (`computeQuestionKey(decisionType, subject)`),
never from `correlation_id` or `message_id`. This is the actual fix: a
question re-asked in a brand-new session, with a brand-new correlation id,
still hashes to the same key and dedups against the existing row.

### API

| Function | Purpose |
|---|---|
| `computeQuestionKey(decisionType, subject)` | Derive the content-hash key. `decisionType` is one of `ratification`, `consult_answer`, `dispatch_auth`. |
| `recordDisposition(supabase, { decisionType, subject, decisionKey, authority, answerPayload, status })` | Create a disposition (or return the existing one on dedup — never overwrites). |
| `getDisposition(supabase, questionKey)` | Read back a disposition. Returns `null` (never throws) when absent — fail-closed. |
| `getDispositionBySubject(supabase, decisionType, subject)` | Convenience wrapper that computes the key for you. |
| `updateDispositionStatus(supabase, questionKey, newStatus, opts)` | Transition `dispositioned -> consumed`, etc. |
| `listAwaitingDisposition(supabase, decisionType)` | Raw queue of awaiting rows for a consumer to render. No formatting logic lives in the primitive. |

### Storage (non-DDL, Phase 1)

Dispositions are stored as rows in the existing `system_events` table
(`event_type='DECISION_DISPOSITION'`), not a new table. `idempotency_key` is
set to the `question_key`; `system_events.idempotency_key` already carries a
`UNIQUE` constraint, which gives **database-enforced** dedup for free — a
race between two concurrent writers on the same `question_key` is caught via
a Postgres `23505` unique-violation and resolved by reading back the winning
row (see `recordDisposition`'s error handler).

## Consumers

### 1. Ratification capture — `scripts/apa-fixture-ratification-capture.mjs`

The APA fixture review packet's Confirm/Flag-for-swap buttons are
client-side only (the Artifact publishing surface's CSP blocks all
fetch/XHR, so a button click cannot reach a network endpoint). This script is
the actual capture path — run it after the chairman states his decisions in
conversation:

```bash
node scripts/apa-fixture-ratification-capture.mjs \
  --fixture-set apa-calibration-2026-07-08 \
  --confirmed G1,G2,G4,D1,D2,D3,D4,D6,B1,B2,I1,I2 \
  --flagged G3,D5,B3,I3 \
  --authority chairman
```

Keyed on `(fixture_set_id, fixture_id)`. Idempotent — re-running dedups. If a
re-run's intended verdict **contradicts** the already-stored one (e.g. a
previously-flagged fixture re-submitted as confirmed), the script reports the
**actual stored verdict**, not the caller's intent, and flags the
contradiction — `recordDisposition` never silently overwrites a prior
decision.

### 2. Consult-answer binding — `scripts/consult-answer-bind.mjs`

Closes Solomon's Mode-B "ANSWER-DELIVERED-not-CONSUMER-UNBLOCKED" finding: a
consult answer is recorded as a disposition **and** the named
`strategic_directives_v2.metadata` blocked-state field is flipped to
unblocked in the same call, so "answered" and "unblocked" can no longer
silently diverge.

```bash
node scripts/consult-answer-bind.mjs \
  --sd-key SD-XXX-001 \
  --blocked-state-key blocked_on_solomon_consult \
  --question "Should Solomon own the belt-tiering rollback?" \
  --answer "Yes, Solomon owns it." \
  --authority solomon
```

`question_key` is scoped to `(sdKey, blockedStateKey, questionText)` — two
different SDs asking an identically-worded question do not collide onto the
same disposition row. The metadata update verifies at least one row was
actually affected (`.select()` + length check) rather than trusting a bare
absence-of-error, closing a known `supabase-js` false-success gap where a
stale/mismatched `sd_key` can otherwise silently no-op.

## Future consumer (not built in this SD)

`dispatch_auth` is a named decision type reserved for the handoff
dispatch-authorization state machine (a separate, chairman-gated SD). It is
not wired here.

## Related

- SD: `SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001`
- Tests: `tests/unit/decision-binding-disposition.test.js`,
  `tests/unit/apa-fixture-ratification-capture.test.js`,
  `tests/unit/consult-answer-bind.test.js`
