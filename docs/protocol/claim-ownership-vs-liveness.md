# Claim ownership vs. liveness — the two-surface precedence rule

*Ratified by SD-LEO-INFRA-PARKED-WORKER-CLAIM-LAPSE-001 (FR-5).*

Two columns describe a worker's relationship to an SD, and code across the fleet
disagreed about which one "wins". The disagreement was real and it caused harm: it is
the ambiguity underneath this SD's root-cause chain, where a live worker's claim was
released out from under it and its SD was then re-advertised for auto-claim.

The disagreement was never resolvable as stated, because **the two columns answer two
different questions.** Neither is a cache of the other.

## The rule

| Question | Authoritative surface |
|---|---|
| **Who OWNS this SD?** Who holds the right to it, who may release it, who must not be displaced. | `strategic_directives_v2.claiming_session_id` |
| **Is a worker CURRENTLY BUILDING this SD?** Is someone live and active on it right now. | `claude_sessions.sd_key` (+ a fresh `heartbeat_at`) |

Ask an ownership question, read SDv2. Ask a liveness/activity question, read the
session row. Do not describe either as "the source of truth" without naming the
question — that phrasing is what produced the contradiction.

## They diverge legitimately, in BOTH directions

This is normal and transient. Code must not treat divergence as corruption:

- **Claim set, `sd_key` NULL** — the SD is owned but nobody is building it this instant:
  a parked worker between turns, a session that has not yet re-attached its worktree,
  or the window right after a sweep touched the session surface. Observed live during
  this SD: the coordinator's roster showed this worker idle while `quick_fixes` and
  SDv2 still recorded its claims.
- **`sd_key` set, claim NULL** — a worker is still building an SD whose claim was
  cleared underneath it. This is precisely the root cause chain of this SD
  (`103260605b3`), and the reason `coordinator-email-summary.mjs` derives the real
  builder from the session surface rather than from SDv2.

## Consequences for guards

A guard must read the surface matching its question, and **fail closed when that
surface cannot be read at all**:

- An **empty** result is a real answer ("nobody is building"). Act on it.
- A **failed** query is not an answer. Do not let it collapse into "empty" and drive a
  destructive branch. Reading a discarded error as "no rows" is the proven production
  root cause behind this SD.

Because the surfaces diverge in both directions, a guard that consults only one of them
is incomplete by construction. The claim-lapse chain needed BOTH: SDv2 to decide
ownership, and `claude_sessions.sd_key` to confirm nobody was mid-build.

## Call sites bound by this rule

- `scripts/worker-checkin.cjs` — `findOwnSdClaim` asks an OWNERSHIP question → SDv2.
- `scripts/coordinator-email-summary.mjs` — asks who is BUILDING → session `sd_key`.
- `scripts/hooks/coordination-inbox.cjs` — `selectAvailableSds` asks whether a live
  worker is mid-build before advertising an SD → session `sd_key` + `heartbeat_at`.
- `lib/claim-validity-gate.js` — peer `sd_key` drift asks whether the peer has MOVED ON
  (a liveness question), while `claiming_session_id` decides whose claim it is.
