# Context-ceiling enforcement (SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001)

## What this replaces

Predecessor SD-LEO-INFRA-COORDINATOR-CRON-LIFECYCLE-001 shipped a role-aware compaction
threshold (`.claude/compaction-thresholds.cjs`), but it was consumed only by the statusline
display path — never read by a role seat's own tick loop. Compaction only happened when a
human typed `/compact`. This SD makes the threshold enforced, not merely classified.

## How it works

`lib/fleet/context-ceiling-checker.cjs`'s `checkContextCeiling({role, sessionId, deps})` reads
the seat's latest context-usage snapshot, classifies it against the existing role-aware
threshold config, and — only when a threshold is crossed — prints a `QUIET_TICK_CONTEXT_CEILING`
HARD line, invokes the compact action, and persists a before/after ceiling event.

**Enforcement is gated behind `COORD_CONTEXT_CEILING_ENFORCE_V1`, default OFF** — a separate flag
from `COORD_COMPACTION_THRESHOLD_V2` (which only picks the threshold *profile*).

**Important limit**: `.claude/commands/context-compact.md` is plain markdown for an interactive
agent turn — there is no CLI/API entrypoint a background script can call. The `QUIET_TICK_CONTEXT_CEILING`
line is the actual enforcement primitive. For a role seat that invokes its own tick script via
Bash as part of its own live turn, that line lands directly in that turn's tool result, and the
seat's own protocol is expected to react to it by calling the compact skill immediately.

## Wired seats

- **Adam** — `scripts/adam-quiet-tick.mjs` calls `checkContextCeiling` natively each pass, using
  the session id from `.claude/active-adam.json` (the marker `writeAdamMarker()` stamps at
  startup).
- **Coordinator** — `scripts/coordinator-quiet-tick.mjs` calls it natively each pass, using
  `process.env.CLAUDE_SESSION_ID` directly.
- **Solomon** — no dedicated tick script exists in this repo (confirmed by search at this SD's
  LEAD-TO-PLAN); Solomon's role-seat loop runs as a `/loop`-driven prompt, the same shape as a
  fleet worker's own loop directive. Use the role-agnostic CLI instead:

  ```bash
  node scripts/context-ceiling-check.mjs --role solomon --session-id "$CLAUDE_SESSION_ID"
  ```

  **This is a code artifact, not yet a live wiring** — getting Solomon's actual running loop to
  call it every pass is a protocol-distribution step (the same kind of step that put the
  `/checkin` cadence into `docs/protocol/fleet-worker-loop-directive.md` for workers), not a code
  change this SD can make unilaterally from this repo. Whoever authors Solomon's next seat
  session/relaunch packet should add this call to Solomon's per-pass instructions, the same way
  workers are told to run `/checkin` each pass.

## Rollback

Flip `COORD_CONTEXT_CEILING_ENFORCE_V1` back off (or leave it unset — default is off). No code
revert is required; the seat reverts instantly to pre-SD advisory-only behavior.
