# Amend mission principle 4 — "compute is not a constraint" → decision-quality-per-capacity (chairman-ratified)

## Type
documentation

## Target Repos
EHG_Engineer

## Summary
Chairman ruling 2026-07-17 evening (verbal, attested in-session; relayed via Solomon 287ed704 — this releases the P4 hold from the mission-principle ownership audit). The audit found principle 4 ("compute is not a constraint") CONTRADICTED-IN-OPERATION: the fleet demonstrably rations capacity (account rotations, staggered renewals, Fable lockouts, budget caps). The chairman ratified AMENDING the principle rather than funding it true. Substance (his words): "get maximum decision quality out of the capacity we have."

## Functional Requirements
### FR-1: Amend the canonical doc
Update `docs/vision/ehg-mission-vision-canonical.md` (How-EHG-Operates #4) with the proposed replacement text: **"Maximize decision quality and learning speed within the capacity we have. Allocate compute by expected value — never token thrift for its own sake, never waste; capacity constraints are managed facts, not design assumptions."** Exact wording gets the chairman's nod on the PR (normal channel) — chairman verbal ratification of the SUBSTANCE is already attested.
### FR-2: Sweep stale quotes (same SD)
Grep the estate for quotes of the old principle ("compute is not a constraint" and close variants) — Solomon notes his own contract + several docs quote it — and update each to the amended principle (or a pointer to the canonical doc). Enumerate the hit list in the PR description so the sweep is verifiable.
### FR-3: Verify
Post-merge: no doc/contract asserts the retired "compute is not a constraint" as current doctrine; the canonical doc carries the amended text.

## Success Metrics
- metric: canonical doc carries the amended principle; target: yes (chairman nod on PR)
- metric: stale quotes of the old principle remaining; target: 0 (enumerated sweep)

## Smoke Test Steps
1. instruction: Read How-EHG-Operates #4 in the canonical doc post-merge; expected_outcome: amended capacity-aware text.
2. instruction: Grep for "compute is not a constraint"; expected_outcome: no live-doctrine assertions remain (historical/changelog references okay).

## Sizing / Notes
Tier 1-2 (doc amendment + quote sweep). Chairman-ratified substance; PR is the wording-nod surface — flag the PR to the chairman when open. Constitution/vision-adjacent: this is the CHAIRMAN'S OWN ratified change, executed by a worker via the normal PR channel (not an agent editing vision unilaterally). Provenance: mission-principle ownership audit (CAPTURE-SOLOMON-MISSION-PRINCIPLE-OWNERSHIP-AUDIT.md) + Solomon relay 287ed704.
