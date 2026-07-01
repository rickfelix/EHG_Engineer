<!-- reasoning_effort: low -->

---
description: "Check in with the active coordinator: one deterministic handshake that resolves to claim / self-claim / idle, THEN re-loops. Use when a worker session starts, finishes an SD, or is told to 'check in'. Per SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 + SD-LEO-INFRA-FLEET-WAKE-UNDER-001."
---

# /checkin — Deterministic worker check-in handshake (self-sustaining)

The worker-PULL counterpart to coordinator-PUSH. One verb that ALWAYS resolves to a single action and **never** waits on a human. Use it when:
- a worker session starts and needs work,
- a worker finishes an SD and needs the next one,
- the operator says "check in with the coordinator".

## ⚠️ Check-in is a `/loop` STEP, never a one-shot

`/checkin` is **not a terminal handshake** — it is one iteration of a self-sustaining loop.
A coordinator **cannot** fire an idle worker's next turn; only the worker's own
`ScheduleWakeup` (or a human) re-invokes it. So the worker is solely responsible for
re-arming itself, every single turn.

**THE INVARIANT — never just stop; always `ScheduleWakeup`:** every `/checkin` turn must
END by arming a `ScheduleWakeup` and re-running the check-in/claim cycle. **Never end a
turn in a way that leaves you idle-forever while the queue is non-empty.** Use
`ScheduleWakeup(~900s ≈ 15min)` when you have or can pull work (promptly grab the next SD),
`ScheduleWakeup(~1200s ≈ 20min)` when idle. A turn that ends without a `ScheduleWakeup`
armed is a SILENT incognito exit — the #1 confirmed fleet-attrition cause.

**Preferred form:** run `/checkin` *under* `/loop` (`/loop /checkin`, or the canonical
fleet-worker directive in `docs/protocol/fleet-worker-loop-directive.md`, which leads with
`/loop` and polls the inbox as step 1). `/loop` self-paces the re-fire so you cannot fall
asleep after one pass. If you are NOT already under `/loop` when told to "check in", launch
it: `/loop /checkin` — do not run a single bare `/checkin` that terminates.

**Anti-pattern (do NOT do this):** hand-rolling a bounded `Bash` poll loop
(`while sleep …`) to wait for an assignment. Bounded Bash polls overshoot the 120000ms
default Bash timeout and die with **exit-143**; the `/loop` + `ScheduleWakeup` cadence is
the correct re-poll mechanism. Poll the inbox as a `/loop` step, then arm a wakeup — never
block a Bash call waiting.

## Run it

```bash
node scripts/worker-checkin.cjs
```

(Equivalent: `npm run checkin`. No `--env-file` needed — the CLI self-loads `.env` via `lib/fleet/worker-status.cjs`. `CLAUDE_SESSION_ID` comes from the SessionStart hook.)

The CLI prints **one JSON object** describing the resolved action. It does the whole handshake itself: resolve the active coordinator (`lib/coordinator/resolve.cjs`), confirm callsign, register availability with an idempotent `payload.kind=roll_call` row (off the friction channel), then resolve work.

### `--model` / `--effort` (SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B)

Self-report your model/effort at check-in so the fleet's automatic tier ladder can rank
you against the live fleet:

```bash
node scripts/worker-checkin.cjs --model sonnet --effort xhigh
```

- `--model`: one of `haiku`, `sonnet`, `opus`, `fable` (unrecognized values map conservative-UP to `fable`).
- `--effort`: one of `low`, `medium`, `high`, `xhigh` (the legacy `max` spelling is folded into `xhigh`; unrecognized values map conservative-UP to `xhigh`).
- Both flags are **optional** — omitting either (or both) is byte-identical to running `worker-checkin.cjs` with no flags at all (no-op).
- The merge is **idempotent**: running the same flags again produces the same `metadata.model`/`metadata.effort`/`metadata.tier_rank`, not a duplicate or drifted value.
- A chairman/coordinator-set `metadata.effort_source` (anything other than `worker_self_report`) **always wins** over your `--effort` flag — effort is not reliably self-detectable by the worker LLM, so an authoritative external stamp is never silently overwritten. `--model` has no equivalent protection (models ARE reliably self-reportable).
- `metadata.model` is also captured automatically at `SessionStart` (a secondary, lower-priority auto-source) — `--model` at check-in is the more explicit, authoritative signal.

## Act on the result (NEVER stop to ask the human)

| `action` | What the CLI did | What you do next | Then |
|----------|------------------|------------------|------|
| `resume` | You already claim `sd` | Run `node scripts/sd-start.js <sd>` to (re)attach the worktree, then continue that SD. | On completion, re-run `/checkin`. |
| `resume_final` | Re-claimed an SD **stranded** at `pending_approval/LEAD_FINAL` (claim was cleared — one handoff from shipped). | Run `node scripts/sd-start.js <sd>` to re-attach the worktree, then `node scripts/handoff.js execute LEAD-FINAL-APPROVAL <sd>` (Bash `timeout: 300000` — the final gate is slow). If `PR_MERGE_VERIFICATION` blocks, merge the PR first (`gh pr merge <#> --squash --admin`), then re-run. Then run the post-completion tail. **NOT** a full rebuild — the SD is already built, gated, and retro'd; it only needs the final approval handoff. | On completion, re-run `/checkin`. |
| `resume_orphan` | Adopted an **orphaned** `in_progress` SD (zero active claims — prior session reaped mid-build; worktree/commits likely intact). Orchestrator parents, test fixtures, human-action SDs and live-held SDs are never adopted. | Run `node scripts/sd-start.js <sd>` — it re-attaches the existing worktree (or resumes from the pushed branch) and reads the SD's live `current_phase`. Load that phase's context and **continue the handoff chain from where the prior session left off** (the message names the phase as a hint; sd-start is authoritative). NOT a restart — keep existing commits/PRD/handoffs. | On completion, re-run `/checkin`. |
| `claimed_assignment` | Claimed the coordinator's assigned `sd` via `claim_sd` | Run `node scripts/sd-start.js <sd>`, load phase context, build it. | On completion, re-run `/checkin`. |
| `self_claimed` | No assignment, so claimed the top of `sd:next` (`sd`) | Run `node scripts/sd-start.js <sd>`, load phase context, build it. | On completion, re-run `/checkin`. |
| `self_claimed_qf` | No claimable SD, so self-claimed an open quick-fix (`qf`) from the open-QF queue | Run `node scripts/read-quick-fix.js <qf>`, then the `/quick-fix` workflow (implement ≤50 LOC on branch `qf/<qf>`, run tests, then `node scripts/complete-quick-fix.js <qf>`) — **NOT** `sd-start.js` (it only knows `strategic_directives_v2` and would exit "SD not found" for a QF id). | On completion, re-run `/checkin`. |
| `idle` | Nothing claimable right now | Call `ScheduleWakeup(delaySeconds=recommended_wakeup_seconds)` (~1200s) and proceed — do **not** wait on a human. | On the next wake, re-run `/checkin`. |
| `error` | `CLAUDE_SESSION_ID` missing or DB unavailable | Report the `error` field; do not loop blindly. | Fix the cause, then re-run `/checkin`. |

This is an autonomous-fleet contract: a `/loop` worker must keep moving. Decide from the JSON, act, and proceed. Never end a check-in by asking the operator what to do (no human watches the loop window).

**Prior wind-down (SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001):** when the JSON carries a non-null `prior_wind_down` (`{reason, at, had_claim}` — captured by the Stop hook when you last stopped: `signaled` | `second_stop` | `no_claim_idle`), briefly surface it before acting, e.g. *"you previously stopped because `<reason>` at `<at>` — confirm or correct"*. If the inferred reason is wrong, send the correction via `/signal feedback "wind-down reason was actually <X>, not <reason>"` so the fleet-wide stop-reason data (feedback `category='wind_down_survey'`) stays accurate. This is a one-line surface, not a pause — proceed to act on `action` in the same turn.

**The cycle never terminates on its own.** For `resume` / `resume_final` / `resume_orphan` / `claimed_assignment` /
`self_claimed`: build the SD through completion (for `resume_final`, just run the final
LEAD-FINAL-APPROVAL handoff + post-completion tail), then **re-run `/checkin`** to pull the next
one — if you instead just stop after finishing the SD, the loop never fires again and you go
incognito with a non-empty queue. For `self_claimed_qf`: work the quick-fix through the
`/quick-fix` workflow to completion (`complete-quick-fix.js`), then **re-run `/checkin`** —
same rule, just `read-quick-fix.js` instead of `sd-start.js`. For `idle`: you MUST have armed a
`ScheduleWakeup(~1200s)` before ending the turn. **Under `/loop` the re-fire is automatic
(step 1 polls the inbox / runs the check-in cycle each pass); the table above is what you do
inside each pass.** Running `/checkin` bare (not under `/loop`)? Then arm the `ScheduleWakeup`
yourself at the end of EVERY action above (~900s when you have/can-pull work, ~1200s when
idle) so the cycle re-fires. Never just stop.

## Two-way (optional)

When `COORDINATOR_TWOWAY_V2=on` (set in `.claude/settings.json` env), you can also ask the coordinator a question and await a reply:

```bash
node scripts/worker-signal.cjs request "<question>" --timeout 30000
```

## What it writes

A single `session_coordination` row, `message_type=INFO`, `payload.kind=roll_call` (deliberately **no** `payload.signal_type` / `intent_action`, so the friction signal-router and the deconfliction sweep never scoop it). Re-running within 5 minutes is a no-op (idempotent).

## Implementation

Thin wrapper around the worker-checkin CLI:

```bash
node scripts/worker-checkin.cjs
```

## Metadata

- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.1.0
- **Last Updated**: 2026-06-08
- **Tags**: fleet, worker, checkin, self-claim, recovery
- **Author**: SD-FDBK-FIX-RECURRING-2ND-OCCURRENCE-001

---
