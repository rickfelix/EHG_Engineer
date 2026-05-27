### Orchestrator Parent Lifecycle (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001)

Parent orchestrator SDs follow a distinct lifecycle from standalone or child SDs because their **implementation lives in CHILD branches**, not in the parent's own branch. The standard EXEC-TO-PLAN and PLAN-TO-LEAD gates were designed for standalone SDs and produce hard-fails when applied unchanged to parents. The rows below codify the parent-aware behavior.

| Parent Phase | Gate Behavior | Verdict | What This Means |
|--------------|---------------|---------|-----------------|
| **LEAD-TO-PLAN** | Standard | PASS | Parent approved; PRD authoring begins (orchestrator-format PRD with decomposition) |
| **PLAN-TO-EXEC** | Reduced set: PARENT_PRD_EXISTS + CHILDREN_STRUCTURE_VALID | PASS | Parent's children are spawned and structurally valid; no DESIGN/DATABASE sub-agents (delegated to children) |
| **EXEC-TO-PLAN** | Reduced set: **PARENT_DELEGATED_COMPLETION only** | PASS | Parent EXEC = "delegated completion" — children carry implementation work. SCOPE_COMPLETION_VERIFICATION is SKIPPED (would otherwise hard-fail because parent branch holds none of the deliverables listed in arch plan) |
| **PLAN-TO-LEAD** (children incomplete) | PREREQUISITE_HANDOFF_CHECK → **wait verdict** | **WAIT** | Parent blocked until all children reach status=completed. Recorded as blocked + metadata.wait=true. **retry_count NOT incremented**; **rejection_reason NULL**; **no RCA trigger**. Operator sees WAITING badge in fleet-dashboard distinct from BLOCKED |
| **PLAN-TO-LEAD** (children complete) | Standard | PASS | All children completed; parent advances to LEAD-FINAL approval |
| **LEAD-FINAL-APPROVAL** | Standard | PASS | Parent approval = approval of children's collective delivery (parent did not ship its own code) |

**Concurrent children execution**: While a parent is in EXEC, **children may be claimed and run independently**. Each child runs its own full LEAD→PLAN→EXEC→...→LEAD-FINAL cycle in its own worktree. The parent only blocks at its own PLAN-TO-LEAD until all children reach `completed` status.

**Parent detection**: A SD is a "parent orchestrator" if EITHER `metadata.is_parent === true` OR `strategic_directives_v2` contains rows where `parent_sd_id` matches the SD's id. The unified helper `lib/handoff/parent-detection.js#isParentOrchestrator(sd, supabase)` OR-merges both signals. This eliminates the dual-detection drift that previously caused F6/F7/F8 (CronGenius pilot 2026-05-27).

**WAIT vs FAIL discriminator**: A gate result with `wait: true` indicates "blocked but not a validation failure". The handoff executor (BaseExecutor.js + ValidationOrchestrator.js) propagates this as `results.waitVerdict = true`, HandoffOrchestrator.js routes to `recorder.recordWait()` (not `recordFailure()`), and the recorded row has `status='blocked'` + `metadata.wait=true` instead of `status='rejected'` + `rejection_reason`. **No retry budget burn**; **no handoff_fail_count increment**.

**CronGenius pilot worked example**: The CronGenius parent SD attempted EXEC-TO-PLAN, hit SCOPE_COMPLETION_VERIFICATION which scanned the parent's branch for child deliverables (the parent's worktree never holds them — they're in child branches), and required `--bypass-validation` to advance, burning 1/3 SD bypass quota. After SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 ships, that same handoff routes to the PARENT_DELEGATED_COMPLETION gate and passes cleanly without bypass. Similarly, the parent's PLAN-TO-LEAD (while Child A is still in EXEC) returns WAIT (not FAIL), preserving retry budget.

