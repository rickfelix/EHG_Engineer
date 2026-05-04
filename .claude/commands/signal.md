<!-- reasoning_effort: low -->

---
description: "Send a structured signal to the active coordinator. Use when stuck on a gate >2x, about to bypass, encountering protocol/spec friction, or recognizing a harness bug. Per SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-5a."
---

# /signal — Signal friction back to the coordinator

Worker → coordinator communication channel. Workers invoke `/signal <type> "<body>"` to surface mid-execution friction so the coordinator can aggregate recurring patterns into harness-backlog SDs.

## Quick Reference

```bash
/signal stuck "Gate failure on PLAN-TO-EXEC, GATE1_PRD_QUALITY scoring 30%, can't get above"
/signal need-sweep "claim_released msg unread for 8m, claim still attached"
/signal prd-ambiguous "PRD AC-3 contradicts AC-7"
/signal gate-bug "GATE_X validator returning falsy on score=0 — should pass"
/signal spec-conflict "Plan §4 says X, PRD §FR-2 says not-X"
/signal harness-bug "scripts/foo.js fails when env var Y missing — should be guarded"
/signal feedback "subagent-evidence rule cost 2 retries — handoff.js should print required agents"
/signal other "<short label>" --reason "<short label>"
```

Optional flags: `--severity low|medium|high|critical` (default: medium). `critical` bypasses the 3-occurrence aggregation threshold and goes straight to harness-backlog.

## When to send (FR-6 decision rule)

**Send when ANY:**
1. **Recurrence threshold met** — same tool failure 3+ times this session, same gate failed 2+ times no improvement, same RCA root cause hit twice, phase elapsed time exceeds 2× type-bucket median
2. **About to bypass / workaround** — 3rd-of-3 bypass quota, `--no-verify`, manual retry without root cause, mock instead of fix
3. **Protocol / spec friction** — PRD acceptance criteria contradict, sub-agent evidence ungeneratable without bypass, gate's pass criteria inconsistent with PRD, documented sub-agent doesn't exist
4. **Recognized harness bug observed** — about to invoke `node scripts/log-harness-bug.js`. Send signal too if other sessions likely hit it — log-harness-bug is local journaling; signal is coordinator-routable evidence
5. **Trend hint** — current friction looks like memory entries you just read

**Don't send when:**
- First-time issue, no recurrence (might be one-off; retry first, observe)
- Already an open SD or known harness-backlog entry (search `feedback` table first)
- Issue is purely local to your session (worktree corruption, etc.) — file as harness bug instead
- Rate-limited / token-constrained on tool calls

## Severity heuristic

| Level | Meaning |
|-------|---------|
| `low` | Single-cycle inconvenience, would be nice to fix |
| `medium` (default) | Recurring within session, costing meaningful time |
| `high` | Blocking your SD, requires bypass, or affects safety/data integrity |
| `critical` | DB inconsistency, gate fail-open, security implication — bypasses 3-occurrence threshold, goes straight to feedback |

## What happens after

1. Your signal lands in `session_coordination` with `target_session=<active coordinator session_id>` (or `broadcast-coordinator` sentinel if no live coordinator — re-targeted on next `/coordinator start`).
2. The coordinator sees it via `/coordinator inbox`.
3. If 3+ workers (by callsign) signal the same `signal_type + body fingerprint` within 60 minutes, the next `stale-session-sweep` cycle promotes it to a `feedback` row (`category=harness_backlog`) — visible in `node scripts/sd-from-feedback.js`.
4. When the resulting SD ships (status=`completed`), you get a `SIGNAL_RESOLVED` message in your inbox: *"your signal led to SD-X-001 (now shipped)"*.

## Implementation

This skill is a thin wrapper around the worker-signal CLI:

```bash
node scripts/worker-signal.cjs $ARGUMENTS
```

The CLI handles type vocabulary validation, secret-pattern redaction (M1 — AWS keys, GitHub tokens, JWTs, password=, etc.), 4096c body cap (M2), coordinator resolution (file-first via `lib/coordinator/resolve.cjs`, DB fallback, `broadcast-coordinator` buffer), and confirmation output.

**ARGUMENTS**: `$ARGUMENTS`
