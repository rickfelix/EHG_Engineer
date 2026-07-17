# Loop-closure predicate template — mandatory freshness window + evidence provenance

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Solomon chairman-approved Mode-C hand-off item 2 (ledger 98c683c3, 2026-07-16): before the remaining ~31 loop evidence-collectors are authored, bake two rules into the collector/closure-predicate TEMPLATE — retrofitting after the collectors exist costs ~31×. Every closure predicate MUST: (a) require evidence within a FRESHNESS WINDOW re-evaluated each verifier tick — a closed-once loop must DECAY, never a permanent CLOSE from stale evidence; (b) declare evidence PROVENANCE — which process/role is authorized to write the evidence rows the predicate reads, so a maker can never author its own closure evidence (maker/checker separation at the evidence layer).

## Functional Requirements
### FR-1: Freshness window in the predicate template
The closure-predicate template requires a freshness window (max evidence age); the verifier re-evaluates each tick and REOPENS a loop whose supporting evidence has aged past the window. No permanent CLOSE. Default window configurable per loop class.
### FR-2: Evidence provenance declaration
The template requires each predicate to declare the authorized writer (process/role) of the evidence rows it reads; the verifier rejects/ignores evidence written by a non-authorized source (a maker cannot satisfy its own closure). Relates the hold-state-contract provenance idea + verifier-read-credential (item 3).
### FR-3: Apply to the template BEFORE the 31 remaining collectors
Land as a template/docs change so the retention collector (GT-1) and the RETRO->LEARN collector (#2) and all subsequent collectors inherit it. Add a test asserting a stale-evidence predicate reopens and a maker-authored-evidence predicate is rejected.

## Success Metrics
- metric: closure predicates that can CLOSE permanently on stale evidence; target: 0 (all decay)
- metric: predicates lacking a declared evidence-writer provenance; target: 0
- metric: retrofit cost avoided; target: applied before the ~31 remaining collectors

## Smoke Test Steps
1. instruction: Close a loop, then age its evidence past the freshness window and run the verifier; expected_outcome: loop reopens (no permanent CLOSE).
2. instruction: Write closure evidence from a non-authorized (maker) role; expected_outcome: predicate does not accept it as closure.

## Sizing / Notes
Tier 1-2 (template/docs + verifier tick logic + test). SOURCE-AND-GO (Solomon-diagnosed, chairman-approved). Timing-critical: cheapest BEFORE the 31 collectors are authored. Relates SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (provenance/decay siblings) + the verifier-only read credential (hand-off item 3, folds into SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001).
