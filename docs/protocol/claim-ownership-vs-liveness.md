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

## Known threshold divergence (out of scope for SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001)

That SD fixed 5 recommendation-surface bugs that read the WRONG column for an
ownership question (`sd:next`, `/checkin`, and the fallback queue silently trusting a
cache-column view alias or an unscoped multi-row query instead of
`claiming_session_id`/the full liveness ladder). It deliberately did not touch the
following 4 pre-existing items — disclosed here rather than silently dropped, each with
an owner and a concrete next step:

1. **The 300/600/900s threshold divergence itself.** Three independently-drifted
   staleness thresholds answer "is this session alive" across the fleet: 300s in
   `lib/claim/stale-threshold.js` and `lib/fleet/session-liveness.cjs`, 600s baked into
   `v_active_sessions`'s `computed_status` CASE logic, and 900s in
   `lib/claim-validity-gate.js`'s `CLAIM_TTL_MS` and the `claim_sd` RPC. Both LEAD-phase
   sub-agents (validation-agent, testing-agent) plus two independent teammate sweeps
   live-measured zero incidents in the disputed 300–900s band at authoring time — the
   divergence is real but not currently causing harm.
   **Owner**: whichever SD next touches liveness thresholds fleet-wide (a dedicated
   unification SD, not a rider on an unrelated fix). **Next step**: before unifying,
   re-measure the 300–900s band for live incidents; a coincidental zero today is not
   evidence the gap is safe tomorrow.
2. **`lib/fleet/session-liveness.cjs` is not unified with `lib/claim-validity-gate.js`.**
   The former is the READ-TIME 5-signal ladder consumed by display/worker-checkin
   surfaces (this SD's FR-5 fixed one caller's incomplete column select against it); the
   latter is the AUTHORITATIVE reap/liveness gate for claim TTL enforcement. They are
   separate implementations of "is this session alive", not one shared code path.
   **Owner**: fleet-infra track (same owner as item 1 — the two are coupled, since
   unifying the ladder implementations would be the natural place to also unify the
   thresholds). **Next step**: a narrow-waist refactor that has `claim-validity-gate.js`
   call into `session-liveness.cjs`'s ladder (or vice versa) rather than maintaining two
   independent liveness computations.
3. **`lib/claim/stale-threshold.js`'s 300 constant was deliberately left untouched.**
   `scripts/modules/sd-next/display/quick-fixes.js` derives its own threshold as `*3`
   off this constant, while `stale-session-sweep.cjs` independently inlines its own
   `300` literal (not synced — verified during this SD's investigation, `stale-session-sweep.cjs:788`).
   Changing the constant alone would silently desync the derived `quick-fixes.js` value
   from the un-synced sweep literal, trading one known divergence for a worse, harder-to-notice one.
   **Owner**: same fleet-infra track as items 1–2. **Next step**: before changing the
   constant, first make `stale-session-sweep.cjs` read the shared constant instead of
   inlining its own literal, so there is one source instead of two-and-a-derivation.
4. **The gate's "uncleanly-killed session pins claim forever" design gap.**
   `lib/claim-validity-gate.js`'s multi-signal check (`is_alive`/`status`/`heartbeat_at`/
   PID-marker escape hatch/armed-silence honor) has a known edge: a session killed
   uncleanly (no graceful release, and one of the escape-hatch signals stays stale-true)
   can pin its claim past the nominal 900s TTL indefinitely. This is a pre-existing gap
   in the gate's own design, not something this SD's recommendation-surface fixes touch
   or worsen. **Owner**: whoever owns `lib/claim-validity-gate.js` (the fleet-infra
   claim-lifecycle track). **Next step**: add a hard ceiling (e.g. a max claim age
   independent of the escape-hatch signals) so an uncleanly-killed session's claim
   eventually lapses even if every soft signal stays ambiguous.
