# Comms send-time TARGET-ROLE drain-set validation — kill the kind-vs-target orphan class

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Solomon MODE-B systemic finding 2026-07-17 (ledger facdb265): session_coordination send-time validation checks the GLOBAL kind vocabulary but never whether the TARGET role's inbox actually DRAINS that kind — so a validly-typed message can land as an orphan the receiver surfaces-but-never-consumes. FOUR documented instances of the one class: (i) TODAY: Adam's good-morning comms canary to Solomon went out as kind=adam_advisory — Solomon auto-drains only DIRECTIVE_KINDS+solomon_consult, so it orphaned (loop closed only by a live Solomon manually acking; the chairman's good-morning protocol makes this leg load-bearing DAILY); (ii) PRIOR FATAL: the chairman_directive silent-death (lib/fleet/worker-status.cjs L95-102 records it) — generic drain consumed it before any role acted, Solomon ran 2h non-compliant; (iii) the Adam inbox classifier burying chairman directives (known memory class); (iv) every inbox has independently grown its own orphan-warn patch — N receiver-side re-derivations of one missing send-side check.

## Functional Requirements
### FR-1: Export per-role DRAIN_SETS from the canonical kinds module
The per-role drained-kind sets already exist in code but are receiver-private. Export them from the canonical kinds module (the COMMS-DELIVERY-CONTRACT-001 vocabulary SSOT) so senders can consult them.
### FR-2: Send-time target-role validation (warn-first)
Extend COMMS-DELIVERY-CONTRACT-001 FR-2: at send time, validate the kind against the TARGET role's DRAIN_SET, not just the global vocabulary. Ship WARN-FIRST (log a loud send-side warning naming the orphan risk + the target's drained kinds); tighten to reject after a burn-in window with zero false positives (observe-only-first default for new enforcement).
### FR-3: Canaries ride the purpose-built machinery
Instance-level fix now: Solomon/coordinator-directed comms canaries use the dedicated comms_check/canary_request kinds (responders exist) — never default adam_advisory. Update the good-morning canary path accordingly.
### FR-4: Test
Tests: a send whose kind is outside the target role's drain set warns (then rejects post-burn-in); a comms_check canary to Solomon round-trips via the dedicated responder; the exported DRAIN_SETS match each receiver's actual drain filters (parity assertion so they cannot re-drift).

## Success Metrics
- metric: validly-typed sends orphaning in a target inbox; target: 0 (send-time caught)
- metric: receiver-side orphan-warn re-derivations needed; target: retired (one send-side check)
- metric: good-morning canary round-trip via dedicated machinery; target: yes, daily

## Smoke Test Steps
1. instruction: Send kind=adam_advisory targeted at Solomon; expected_outcome: send-side WARN naming Solomon's drained kinds (post-burn-in: reject).
2. instruction: Run the good-morning canary via comms_check; expected_outcome: auto-drained round-trip, no orphan.

## Sizing / Notes
Tier 2 QF (export + one send-path check + canary re-route + parity tests). Solomon-diagnosed with 4 documented instances; extends the shipped COMMS-DELIVERY-CONTRACT-001 (extend-not-greenfield). Warn-first per the observe-only-first enforcement default. Comms-integrity: protects the chairman-directive and good-morning legs specifically. SOURCE-AND-GO.
