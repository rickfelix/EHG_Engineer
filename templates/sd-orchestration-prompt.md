# Continuous LEO Protocol - SD Orchestration Template

## Parent/Orchestrator Strategic Directive: {{SD_ID}}

---

## Pre-Execution Discovery (Parallel Exploration)

Launch 3 explorer agents IN PARALLEL to establish full context:

### 1. Context Agent
**Focus:** Review CLAUDE.md and the CLAUDE_*.md family (CORE, LEAD, PLAN, EXEC)
- Understand current protocol requirements
- Identify active sub-agents and their triggers
- Note any recent protocol changes

### 2. SD Agent
**Focus:** Load the target SD and map its complete hierarchy
- Query parent → children → grandchildren relationships
- Identify dependencies between SDs
- Check current status of each SD in hierarchy
- Build depth-first execution order

### 3. Protocol Agent
**Focus:** Review LEO Protocol phases and sub-agent capabilities
- LEAD phase requirements and gates
- PLAN phase validation criteria
- EXEC phase completion standards
- Available specialized sub-agents

---

## Execution Requirements

### Phase Sequence
For each SD in the hierarchy, follow LEO Protocol phases:
1. **LEAD** - Approve/reject using LEAD criteria (autonomous)
2. **PLAN** - Generate PRD with validation
3. **EXEC** - Implement with quality gates

### Traversal Order
- **Depth-first**: Complete ALL children before marking parent complete
- **Sibling order**: Process siblings by sequence_rank, then created_at
- **Dependency respect**: Verify blocked_by SDs are complete before starting

### Sub-Agent Utilization
Leverage ALL sub-agents per their trigger keywords:
- **DATABASE**: query, select, insert, supabase, fetch from database
- **TESTING**: coverage, E2E, playwright, unit tests, vitest
- **DESIGN**: component, UI, styling, tailwind, accessibility
- **SECURITY**: authentication, authorization, RLS, permissions
- **PERFORMANCE**: optimization, caching, query performance
- **API**: endpoint, REST, GraphQL, controller
- (See CLAUDE.md for full trigger list)

### Gate Enforcement
- All gates must pass before phase transition
- Quality gate target: 85% (varies by SD type)
- Failed gates trigger root cause resolution

---

## Checkpoint Protocol

At EACH phase transition or handoff:

### 1. Protocol Refresh
```
Re-read: CLAUDE.md, CLAUDE_CORE.md, CLAUDE_{PHASE}.md
```
Ensures you have the latest protocol requirements.

### 2. Validation Check
Validate current work against LEO requirements:
- [ ] Phase-specific gates passed
- [ ] Handoff documentation complete
- [ ] No orphaned changes
- [ ] Tests passing (if applicable)

### 3. Document Handoff
Before proceeding to next phase:
- Log checkpoint to `sd_checkpoint_history`
- Record validation results
- Note any deviations or issues

---

## Issue Resolution Protocol

When encountering failures, blocks, or quality gate rejections:

### Step 1: Root Cause Analysis
Launch 4 explorer agents IN PARALLEL to investigate:

1. **Code Explorer**: Examine failing code, recent changes, test failures
2. **Log Explorer**: Review error logs, stack traces, console output
3. **Dependency Explorer**: Check external dependencies, API responses, database state
4. **Context Explorer**: Review related SDs, protocol requirements, known patterns

### Step 2: Synthesize Root Cause
Combine findings from all 4 explorers to identify the ACTUAL root cause.
Ask "why" 5 times to get to the fundamental issue.

### Step 3: Systematic Resolution
- Fix the ROOT CAUSE, not symptoms
- Avoid workarounds that mask the underlying issue
- Prioritize quality and correctness over speed
- Ensure the fix prevents recurrence

### Step 4: Retry or Skip
- If fix succeeds: Continue execution
- If fix fails: Log detailed reason, skip SD, continue to next

---

## Completion Criteria

### Per-SD Completion
- [ ] LEAD phase complete (approved or auto-approved)
- [ ] PLAN phase complete (PRD generated and validated)
- [ ] EXEC phase complete (implementation passing all gates)
- [ ] Checkpoint logged to database

### Hierarchy Completion
- [ ] ALL children SDs reach EXEC-complete status
- [ ] ALL grandchildren SDs complete (if any)
- [ ] Parent SD marked complete only after ALL descendants complete
- [ ] `is_sd_hierarchy_complete(parent_id)` returns TRUE

### Auto-Advance Trigger
When hierarchy is complete:
1. Log completion to `continuous_execution_log`
2. Query next parent SD from baseline
3. Load new orchestration context
4. Begin new hierarchy execution

---

## Todo List Management

Maintain a THOROUGH and COMPREHENSIVE todo list throughout:

```
Example structure:
[in_progress] Execute SD-PARENT-001 hierarchy
  [in_progress] Child: SD-CHILD-001
    [completed] LEAD phase
    [in_progress] PLAN phase - generating PRD
    [pending] EXEC phase
  [pending] Child: SD-CHILD-002
  [pending] Parent completion
```

Update todos in REAL-TIME:
- Mark complete IMMEDIATELY after finishing
- Add new items as discovered
- Track blockers and dependencies

---

## Session Commands

### Monitor Progress
```bash
npm run leo:status              # View current SD progress
npm run sd:status               # Detailed SD status
```

### View Continuous Execution Log
```sql
SELECT * FROM continuous_execution_log
WHERE session_id = 'current-session'
ORDER BY created_at DESC;
```

### Check Hierarchy Completion
```sql
SELECT * FROM get_sd_children_depth_first('{{SD_ID}}');
SELECT is_sd_hierarchy_complete('{{SD_ID}}');
```

---

## Remember

1. **Never stop** until ALL SDs in hierarchy are complete or explicitly skipped
2. **Follow LEO Protocol diligently** at every step
3. **Leverage sub-agents** - they have specialized knowledge
4. **Quality over speed** - fix root causes, not symptoms
5. **Document everything** - checkpoints, issues, resolutions
6. **Re-read CLAUDE.md** at each transition - protocol may have updated

---

*Template Version: 1.0.0*
*Compatible with LEO Protocol v4.3.3+*
