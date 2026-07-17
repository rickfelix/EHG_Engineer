# RCA hash-collision digest fix — distinct RCAs must not collapse to one digest

## Type
bugfix

## Target Repos
EHG_Engineer

## Summary
Coordinator belt-low #3 remainder 2026-07-17 (Golf-verified): the RCA digest/hash collides for distinct root-cause analyses, so two different RCAs map to the same digest — deduping or overwriting a genuinely distinct RCA, or mis-attributing a recurrence count. This corrupts the RCA recurrence signal the protocol uses to decide systemic-fix escalation.

## Functional Requirements
### FR-1: Reproduce the collision
Use Golf's verified case to reproduce two distinct RCAs producing the same digest. Identify the digest input set — the fix is almost certainly that the hash omits a discriminating field (symptom location, failing step, SD/phase) or over-normalizes before hashing. Confirm the exact dropped discriminant.
### FR-2: Widen the digest input to the true identity
Include the discriminating field(s) in the hash so distinct RCAs get distinct digests, while genuinely-identical recurrences still collide (that collision is desired — it drives recurrence counting). Preserve backward behavior for true duplicates; only split the false-merge cases.
### FR-3: Test both directions
Test: Golf's two distinct RCAs now yield distinct digests; two genuinely-identical RCAs still yield the same digest (recurrence still counts). Test must fail pre-fix on the distinct-case.

## Success Metrics
- metric: distinct RCAs sharing a digest; target: 0
- metric: genuine recurrences still collapsing to one digest (recurrence counting intact); target: preserved

## Smoke Test Steps
1. instruction: Run the digest on Golf's two RCAs; expected_outcome: two different digests.
2. instruction: Run the digest on two identical RCAs; expected_outcome: one shared digest (recurrence detection preserved).

## Sizing / Notes
Tier 1-2. SOURCE-AND-GO. Premise Golf-verified; FR-1 still reproduces before editing. RCA-integrity, Wave-1 foundation. No security/schema keywords.
