# Chairman Held-Send Release — Operational Runbook

## Metadata
- **Category**: Infrastructure
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001
- **Last Updated**: 2026-08-24
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
| Migration gate | **`@chairman-gated`** — deliberately has no `@approved-by` line. Requires the chairman to add one matching their git config email and run `node scripts/apply-migration.js database/migrations/20260824_chairman_held_sends.sql --prod-deploy` with a single-use token. **Not yet applied as of this writing.** |
| Retention | `lib/retention/policies.js` — `chairman_held_sends`, 90-day hot window, `mode: 'archive'` |
| Operator-contract cadence keys | `strategic_directives_v2.metadata.operator_capability_keys = ['gha_cron:chairman-held-sends-release-cron.yml', 'cron_script:chairman-held-sends-release-sweep.mjs']` |

## Pre-migration behavior (current state)

Every call site that reads or writes `chairman_held_sends` is fail-soft or unreachable while the
table does not exist, verified by direct source read (not assumed):

- The hold-persist INSERT (`chairman-sms-gate/index.js`) is wrapped in a try/catch that never
  re-throws — a missing-table error is loud-logged only; the SMS send is correctly held either
  way.
- The sweep's held-rows read pattern-matches PostgREST's `schema cache`/`does not exist` wording
  and returns `exitCode: EXIT_OK` with `summary.tableApplied: false` **before** the per-row loop
  ever runs. This means the sweep does not go CI-red every 15 minutes pre-migration.
- Because of that short-circuit, `releaseHeldSend()`'s three `chairman_held_sends` call sites
  (claim, unclaim, release-write) are **unreachable**, not merely fail-soft, until the migration
  lands — they are only invoked from the sweep's per-row loop.

`scripts/lint/schema-reference-allowlist.json`'s `_chairman_held_sends_note` documents this in
detail and names the removal condition.

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

## After the chairman applies the migration

1. Apply: `node scripts/apply-migration.js database/migrations/20260824_chairman_held_sends.sql --prod-deploy` (requires an `@approved-by` line added by the chairman first).
2. Remove `chairman_held_sends` from `scripts/lint/schema-reference-allowlist.json`'s `tables` array and its `_chairman_held_sends_note`, then re-run `npm run schema:snapshot:lint`.
3. Confirm the sweep reports `summary.tableApplied: true` on its next run (`gh run list --workflow=chairman-held-sends-release-cron.yml`).
