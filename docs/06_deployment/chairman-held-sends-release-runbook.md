# Chairman Held-Send Release — Operational Runbook

## Metadata
- **Category**: Infrastructure
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001, SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002
- **Last Updated**: 2026-08-26
- **Tags**: chairman, solomon, consult, sms, cron, decision-lane, deployment

## Overview

A chairman-targeted send that hits the pre-send Solomon consult gate under timeout does not
auto-proceed and does not silently drop — `performBoundedConsult` (`lib/adam/should-consult-
solomon.js`) returns `hold-and-surface`, and `chairman-sms-gate/index.js` persists the held
decision into a new `chairman_held_sends` table (best-effort; a persistence failure never changes
the hold outcome, it only loses reconcilability). Before this SD, that hold had no release path:
a late Solomon verdict arriving after the live session ended could never un-stick the send.

This adds the release half: a 15-minute GHA cron sweep
(`scripts/cron/chairman-held-sends-release-sweep.mjs`, dispatched by
`.github/workflows/chairman-held-sends-release-cron.yml`) that finds `status='held'` rows and
attempts to release each one via `releaseHeldSend()` (`lib/adam/chairman-held-send-release.js`).

## Architecture

| | |
|---|---|
| Table | `chairman_held_sends` — migration `database/migrations/20260824_chairman_held_sends.sql` (+ `_DOWN.sql`) |
| Hold-time write | `lib/comms/adam-outbound/chairman-sms-gate/index.js`'s `hold-and-surface` branch — best-effort INSERT, try/catch, never blocks the (already-held) send outcome |
| Release mechanism | `lib/adam/chairman-held-send-release.js` — `resolveVerifiedAnswer` / `decideRelease` / `releaseHeldSend` |
| Release sweep | `scripts/cron/chairman-held-sends-release-sweep.mjs` |
| Workflow | `.github/workflows/chairman-held-sends-release-cron.yml`, `schedule: */15 * * * *` |
| Migration gate | Base table (`20260824_chairman_held_sends.sql`) is `@chairman-gated` and has been chairman-applied and live since 2026-08-25. The FR-3 reply-field columns (`database/migrations/20260826_chairman_held_sends_reply_fields.sql`) are a NEW, separate, self-applicable migration — bare nullable `ADD COLUMN`/`COMMENT ON COLUMN` only, no `@chairman-gated` header needed, applied directly at EXEC. |
| Retention | `lib/retention/policies.js` — `chairman_held_sends`, 90-day hot window, `mode: 'archive'` |
| Operator-contract cadence keys | `strategic_directives_v2.metadata.operator_capability_keys = ['gha_cron:chairman-held-sends-release-cron.yml', 'cron_script:chairman-held-sends-release-sweep.mjs']` |

## Migration status (as of SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002)

Both migrations are now live. The base table has been chairman-applied since 2026-08-25; the
FR-3 reply-field columns landed 2026-08-26. The fail-soft/unreachable behavior described in the
original (v1.0.0) version of this runbook was real for the pre-migration window but no longer
applies — the sweep's held-rows read no longer short-circuits on `table_not_yet_applied`, and
every `chairman_held_sends` call site in `releaseHeldSend()` (claim, unclaim, release-write) is
now genuinely reachable in production. `scripts/lint/schema-reference-allowlist.json`'s
`chairman_held_sends` entry (and its `_chairman_held_sends_note`) were removed as part of FR-7,
after `npm run schema:snapshot:lint` was re-run to pick up the new columns.

## Anti-forgery design (release verification)

A held send may only release on a **genuinely verified, non-negative Solomon verdict** —
`resolveVerifiedAnswer()` does one query against `session_coordination` for an answer row matching
`payload->>reply_to = correlationId AND payload->>kind = 'adam_advisory'`, then verifies the sender
via a layered check:

- **STRONG**: `isSolomonSession()` — the sender's *current* `claude_sessions.metadata.role` is
  `solomon` (fail-closed on any lookup error).
- **FALLBACK**: the answer row's write-time `sender_type === 'solomon'` attestation, guarded
  against forgery by requiring `sender_session` differ from both the asking session and the shared
  `CHAIRMAN_LANE_AUTOMATED_SENTINEL`. This closes a real gap the STRONG-only check left: 21 of 27
  genuine historical verdicts came from a Solomon session that had since rotated out of the
  `solomon` role and would otherwise be wrongly refused.

Even a verified-Solomon verdict is refused if it reads as a rejection or amendment
(`detectVerdictDelta()`, reused from `should-consult-solomon.js`) — a release is never a rubber
stamp on "someone answered."

## Dispatch-outcome handling

`releaseHeldSend()` claims the row (`status: 'held' -> 'releasing'`, single-row
`.eq('id',...).is('claimed_at', null)`), dispatches via `sendChairmanSMS` with the pre-send consult
lane short-circuited to the independently-verified verdict, and only marks `status: 'released'` if
`sendResult.sent === true`. Any other outcome — a thrown dispatch, or any of `sendChairmanSMS`'s
~8 distinct `sent:false` shapes — unclaims the row back to `held` (incrementing `attempts`,
recording `last_error`) rather than ever recording an undelivered message as sent. A failed
unclaim (0-row match) is surfaced via `unclaimError`/`strandedInReleasing` rather than silently
folded into "still held."

## Verification chain (six sub-agent passes, all evidence-backed)

1. LEAD-phase prospective TESTING caught the fail-open persistence design before code existed.
2. EXEC-phase mutation testing (evidence `9cc5057d`) caught two dispatch-outcome bugs (D1: an
   unconditional `released` write regardless of send success; D2: a dispatch-throw stranding the
   row in `releasing` forever, plus a single poison row aborting the whole sweep batch).
3. SECURITY review (evidence `8c9d89bd`) found the anti-forgery mechanism itself was structurally
   inert (S-1: any answer treated as approval; S-2: the self-answer check was a denylist that a
   shared sentinel trivially bypassed; S-3: a two-query TOCTOU).
4. A follow-up VALIDATION pass (evidence `d09978d0`) measured the S-2 fix against live production
   data and found it too narrow (V-1: would refuse 78% of genuine historical verdicts).
5. REGRESSION review (evidence `c5b820af`) caught a stale comment claiming no Supabase client is
   ever constructed for held sends — false once the hold branch persists.
6. `OPERATOR_CONTRACT` gate review required the full CREATOR/CONSUMER/CADENCE/REAPER operator
   triple before PLAN-TO-LEAD would pass — the cron workflow, retention policy entry, and
   `operator_capability_keys` metadata all trace back to that gate.

## Post-migration checklist (completed)

1. ~~Apply the base migration~~ — done, chairman-applied 2026-08-25.
2. ~~Remove `chairman_held_sends` from the schema-reference-lint allowlist~~ — done at FR-7
   (SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002), after re-running `npm run schema:snapshot:lint`.
3. Confirm the sweep reports `summary.tableApplied: true` on its next run:
   `gh run list --workflow=chairman-held-sends-release-cron.yml`.

## SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 — 7 defects fixed post-migration

Once the base table was live, five defects surfaced that the pre-migration fail-soft paths had
been masking, plus two operational gaps. All seven were fixed in one SD, each independently
verified by at least one sub-agent pass (Explore + VALIDATION at LEAD; TESTING + SECURITY at
EXEC; VALIDATION + REGRESSION at PLAN_VERIFICATION — 8 findings total across those passes, all
closed, two confirmed via self-administered mutation tests):

1. **Consult insert never readback-verified (FR-1)** — `lib/adam/presend-consult-lane.cjs` now
   requests `{select:'id', single:true}` on the pre-send consult insert and forwards the row id
   as `consultRowId` through `performBoundedConsult`'s hold-and-surface arm into
   `chairman_held_sends.consult_row_id` — the column existed since the base migration but was
   never written.
2. **Release sweep never supplied a clock (FR-2)** — `scripts/cron/chairman-held-sends-release-sweep.mjs`
   now defaults `context.now = Date.now()`, MERGED (not default-only) into `releaseDeps.context`,
   so the rubric's quiet-hours check evaluates instead of throwing `gate_unavailable` on every
   release attempt.
3. **Schema missing the rubric-required reply fields (FR-3)** — new migration
   `database/migrations/20260826_chairman_held_sends_reply_fields.sql` adds `reply_instruction`,
   `reply_id` (singular — the rubric reads `message.replyId`, one string, never an array), and
   `no_reply_consequence` (all nullable, no CHECK). Hold-time insert persists them; release-path
   reconstruction restores them.
4. **Double-composed SMS body on release (FR-4, CRITICAL)** — `sendChairmanSMS` unconditionally
   re-composes the body from `options`/`replyInstruction`/`noReplyConsequence` on every call. A
   held row's body is ALREADY composed at hold time, so re-dispatching it through the same gate on
   release without a guard would fold those fields in a SECOND time — a visibly duplicated message
   to the chairman. Caught at LEAD by VALIDATION before any code existed; fixed with
   `opts.skipCompose`, which `releaseHeldSend()` always sets and no other caller can reach.
5. **Non-UUID `--decision-id` silently dropped a hold (FR-5)** — `scripts/adam-chairman-decision.mjs`
   now UUID-validates `--decision-id` before any write (a mistyped id previously failed the insert
   with Postgres 22P02, caught-but-silent). Live execution is gated behind `isMainModule()` so the
   validator (`parseDecisionArgs`) is unit-testable without side effects.
6. **No detection for a stranded hold (FR-6)** — the existing `v_chairman_held_sends_unreconcilable`
   view is db-tier-only and blind for a row's first 24h. A new, unit-testable JS function
   (`detectOrphanedHeldSends`, in the sweep script) additionally flags `consult_row_id IS NULL`
   (with a correlation id present), `attempts > 0`, and rows stuck in `status='releasing'` past one
   sweep cadence. Two confirmed-dead historical rows (their underlying `chairman_decisions` row no
   longer existed) were voided to `status='abandoned'` with documented provenance
   (`scripts/one-off/void-stranded-chairman-held-sends-decision-002.mjs`).
7. **Stale lint allowlist (FR-7)** — see "Migration status" above.

Full detail, including the 8 sub-agent findings and how each was verified (not just re-read), is
in the SD's retrospective: `retrospectives.id = cfbcd122-0ed6-406e-9819-fe9cfbf26d27`.
