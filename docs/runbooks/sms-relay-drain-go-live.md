# SMS Relay Drain — Go-Live Runbook

**Category**: Runbook
**Status**: Approved
**Version**: 1.2.0
**Author**: SD-LEO-INFRA-COMPLETE-SMS-RELAY-001 (Alpha-4); parking behavior added by
SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001; stale-escalation + audit added by
SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001
**Last Updated**: 2026-08-21
**Tags**: chairman-comms, sms, drain, go-live, cutover, parking

---

## What this is

The chairman SMS relay drain (`scripts/sms-relay-drain.cjs` → `drainSmsRelayStaging` in
`lib/chairman/sms-bridge.js`) moves inbound chairman SMS replies out of `sms_relay_staging`
into `chairman_decisions`, and the Adam quiet-tick surfaces an undrained reply as a **hard
interrupt** (`QUIET_TICK_SMS_INBOUND`) so the chairman is answered within one tick.

The whole path is **inert until `SMS_RELAY_DRAIN_ENABLED` is truthy**. Flipping it is a
**production go-live of a chairman-facing channel** — that GO belongs to the chairman, routed
via Adam as a labeled decision (the coordinator hands Adam the decision text once the FR-1
exactly-once fix has merged). This runbook is the exact, ordered procedure for whoever performs
the flip. **Completing SD-LEO-INFRA-COMPLETE-SMS-RELAY-001 does NOT make the channel live** —
it makes the cutover *safe and performable*; this document is the remaining human step.

## Precondition (must already be true)

- **FR-1 exactly-once drain claim is merged.** `drainSmsRelayStaging` claims each staging row
  with an atomic conditional UPDATE (`SET drained_at = now() WHERE id = ? AND drained_at IS NULL`)
  and processes only the row it claimed. This makes the drain exactly-once even when the 5-min
  cron and an Adam-tick-triggered manual drain run concurrently — without it, a re-drained row
  could double-increment the FR-4 unmatched auto-suspend counter against the chairman's number.
  (A double *reply* was already prevented one layer down by the decision-level atomic claim in
  `handleInboundSmsReply`; FR-1 closes the residual side-effect double-count.)
- Inbound chairman SMS is landing in `sms_relay_staging` (the Twilio webhook is cut over). Verify
  with a recent `received_at` row before flipping.

## Go-live steps (in order)

1. **Set the GitHub repo variable** `SMS_RELAY_DRAIN_ENABLED = true`.
   - Repo → Settings → Secrets and variables → Actions → Variables → `SMS_RELAY_DRAIN_ENABLED`.
   - This is what `.github/workflows/sms-relay-drain-cron.yml` reads (`vars.SMS_RELAY_DRAIN_ENABLED`);
     it arms the every-5-minutes cron drainer. The cron is `concurrency`-guarded, so it never
     races itself — and with FR-1 it is safe even racing a manual seat drain.

2. **Set the seat env on the designated drain seat(s)** — add `SMS_RELAY_DRAIN_ENABLED=true` to the
   root `.env` of the seat that runs the Adam quiet-tick.
   - New worktrees created by that seat inherit it automatically (the worktree provisioning path
     copies `.env` verbatim — FR-2). **Existing worktrees do not** — they hold a `.env` snapshot
     taken at creation, so either re-provision them or set the variable in their environment
     directly if a live worktree must drain before its next re-creation.
   - This is what flips the quiet-tick emission from `QUIET_TICK_SMS_SUPPRESSED` (informational,
     not an interrupt) to `QUIET_TICK_SMS_INBOUND` (the hard interrupt that tells Adam to drain +
     reply). The emission gate and the interrupt allowlist are already wired — setting the value
     is the only action.

3. **Canary (immediately after the flip).** Stage one inbound row (or wait for a real chairman
   reply) and confirm:
   - The next Adam quiet-tick prints `QUIET_TICK_SMS_INBOUND` (not `QUIET_TICK_SMS_SUPPRESSED`).
   - A drain run stamps `drained_at` on the row **exactly once** and the reply lands in
     `chairman_decisions` (or the correct non-answer outcome is logged once, e.g. `no_match`).
   - `sms_relay_staging` has no growing undrained backlog (the drain's `checkBacklogStall`
     signal stays quiet).

## Chairman-number parking (SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001)

The drain's `no_match`/`rate_limited` outcomes (step 3's canary bullet, "the correct
non-answer outcome is logged once") are no longer purely terminal for the **verified chairman
number**. As of this SD, `drainSmsRelayStaging` additionally stamps `sms_relay_staging.parked_at`
on a claimed row when BOTH: the outcome is `no_match` or `rate_limited`, AND
`phoneKey(row.from_phone) === phoneKey(CHAIRMAN_PHONE)`. `drained_at` is untouched — parking is a
second, orthogonal marker, not a substitute for the exactly-once claim this runbook's precondition
describes.

A parked row (`parked_at IS NOT NULL AND resolved_at IS NULL`) re-fires
`QUIET_TICK_SMS_PARKED` on **every** Adam quiet-tick — unlike `QUIET_TICK_SMS_INBOUND` above,
this one is not gated on `SMS_RELAY_DRAIN_ENABLED` and has no suppressed/informational variant,
since resolving it is a plain CLI script rather than something waiting on the drain cutover. Once
addressed, disposition it explicitly with
`node scripts/resolve-parked-chairman-sms.cjs <sms_relay_staging-row-id>` (sets `resolved_at`,
idempotent — a second call on an already-resolved row is a no-op) or the interrupt keeps firing.

Operational implication for this runbook's canary step: after the go-live flip, a chairman-number
message that resolves `no_match` or `rate_limited` will show up TWICE in tick output — once as
`QUIET_TICK_SMS_INBOUND` while still undrained (pre-drain), and, once drained-but-unmatched, as a
persistent `QUIET_TICK_SMS_PARKED` until someone runs the resolve script. Seeing the row disappear
from `QUIET_TICK_SMS_INBOUND` alone is NOT the end state to look for — confirm it either answered
(no `QUIET_TICK_SMS_PARKED` line) or is parked-and-later-resolved.

### Stale-parked escalation (SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001)

A parked row that has sat unresolved for `>= 24h` (`isStaleParkedSms` in
`lib/governance/parked-sms-stall.mjs`) additionally emits `QUIET_TICK_SMS_PARKED_STALE` on the
same tick, right after its routine `QUIET_TICK_SMS_PARKED` line — the distinct tag exists so a
genuinely-overdue row is grep-able instead of indistinguishable from routine parked traffic (356
parked-unmatched real chairman texts had accumulated silently before this was added). It carries
no new remediation of its own: disposition via `resolve-parked-chairman-sms.cjs` as above, just
prioritize the `_STALE` rows first.

### One-time / retroactive backlog audit

`node scripts/audit-parked-chairman-sms.mjs [--dry-run] [--include-resolved]` batch-dispositions
parked rows via `classifyParkedSmsDisposition` (`lib/chairman/parked-sms-audit.mjs`) — it only
trusts a LATER same-phone `sms_inbound_log` row with `outcome=answered` as evidence a message was
actually handled (never `matched_decision_id` alone, per the 2026-08-19 migration's diagnostic-only
caveat for rows before 2026-08-21). Each row gets one `feedback` table entry
(`category=chairman_sms_parked_audit`, disposition `EVIDENCE_HANDLED` or `NEEDS_ADAM_REVIEW`) —
chairman SMS body content is never written to a git-tracked file. Default scope is
`resolved_at IS NULL`; pass `--include-resolved` to retroactively audit the full historical
population instead of only the currently-unresolved backlog.

## Rollback

Set `SMS_RELAY_DRAIN_ENABLED` back to unset/`false` (repo variable + seat env). The runner and
the quiet-tick emission return to inert/informational immediately; no data migration is involved.
The FR-1 atomic claim and the provisioning path are behaviour-neutral while the flag is off, so
they stay in place.

## Why the flip is not an SD deliverable

Per coordinator ruling 31b25783 (Option A): the flip is a chairman-facing production go-live and
must be a labeled chairman decision routed via Adam, not a worker action. Wording the SD's
completion as "channel live" would claim a live channel that is fenced on a pending chairman GO —
the exact completed-while-inert class this project guards against (see VENTURE-DEMAND). Completion
asserts only that this runbook exists and the cutover is performable.
