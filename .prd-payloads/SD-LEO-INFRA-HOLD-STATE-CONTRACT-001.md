# Hold-state CONTRACT — every hold/fence/floor = enforceable lifecycle state + mandatory {reason,owner,review_at,release_condition} stamp

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Solomon MODE-B systemic finding 2026-07-16 (ledger a94e3f65, propose-only, chairman escalate=false; capture below). The harness expresses holds/fences/floors on TWO divergent layers — advisory METADATA (semantics, no enforcement) and LIFECYCLE STATE (enforcement, no semantics) — and every divergence becomes a fence-with-no-teeth OR a park-with-no-explanation. Four witnessed incidents are ONE class: (1) exec_fence metadata had "no teeth" — completion machinery advanced past it (fixed one-off by parking TWO-WAY-CHAIRMAN at pending_approval); (2) INVERSE — 5 ApexNiche children aged 3-4 days at pending_approval with ALL hold flags null (hard state, zero machine-readable reason/owner/review_at → no sweeper could tell parked-on-purpose from stuck); (3) min_tier_rank floor silently bypassed by self-claim when belt_tiering_active=false (twice-witnessed mis-claims); (4) comms layer — the chairman SMS consult sat read-but-unACKed on a retired session and EXPIRED invisibly (state present, disposition contract absent). SEED: SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 (28d35a3b) already proves this exact shape on the gauge-finding surface — this GENERALIZES it (consider making 28d35a3b the seed rather than net-new scaffolding).

## Functional Requirements
### FR-1: Enumerate hold surfaces first (verification-before-sourcing, Solomon-specified)
Grep the five flag names + exec_fence + min_tier_rank: lead_final_blocker, human_action_required, awaiting_chairman, needs_coordinator_review, review_hold_reason, exec_fence, min_tier_rank. Confirm each maps to the contract OR gets an explicit documented exemption. Sanity-check whether the ApexNiche park was a deliberate out-of-band chairman hold (if so, it STRENGTHENS the mandatory-reason requirement — out-of-band context evaporates across session succession).
### FR-2: One shared hold-writer lib + write-time validation
Any hold/fence/floor MUST be written via one shared writer that enforces BOTH: (a) a lifecycle state the machinery physically cannot advance past, AND (b) a mandatory {reason, owner, review_at, release_condition} stamp. Validate at WRITE time — REJECT a stateless fence (semantics without enforcement) AND a reasonless park (enforcement without semantics). Generalize the 28d35a3b known-state-ack shape rather than reinventing.
### FR-3: Past-review_at sweeper lane
A sweeper surfaces any hold whose review_at has passed, so parked ≠ forgotten (coordinator-owned lane). Distinguishes intentionally-parked from stuck via the stamp.
### FR-4: Retrofit four surfaces
Retrofit: SD parks (pending_approval), exec fences, tier floors (min_tier_rank), QF defer/reopen. Each either adopts the contract or carries a documented exemption.

## Success Metrics
- metric: reasonless parks writable (hard state, null reason/owner/review_at); target: 0 (rejected at write)
- metric: stateless fences (metadata hold with no lifecycle backing); target: 0 (rejected at write)
- metric: past-review_at holds surfaced within one sweep cycle; target: 100%

## Smoke Test Steps
1. instruction: Attempt to write an ApexNiche-style park (pending_approval, null hold-stamp); expected_outcome: rejected — reason/owner/review_at/release_condition required.
2. instruction: Attempt an exec_fence as metadata-only (no lifecycle state); expected_outcome: rejected — must bind a non-advanceable lifecycle state.
3. instruction: Set a hold with review_at in the past, run the sweeper; expected_outcome: surfaced within one cycle.

## Sizing / Notes
Tier 3 (touches SD lifecycle / claim / fence machinery — dispatch-adjacent → COORDINATOR review before dispatch; the sweeper lane is coordinator-owned). Solomon-diagnosed (reasoning done); confidence high on the pattern, MEDIUM on retrofit scope — FR-1 enumeration bounds scope before building. DEDUP: seed from SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 (28d35a3b); if a ONE-PLAN-OF-RECORD consolidation already audits fences, FOLD there instead of filing separately (coordinator to check at materialization). Full capture: ledger a94e3f65 / Solomon b1f789ea. Meta/harness-systemic — flagged for ratio honesty.
