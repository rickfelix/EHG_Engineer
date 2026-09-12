## ❌ Anti-Patterns from Retrospectives (EXEC Phase)

**Source**: Analysis of 175 high-quality retrospectives (score ≥60) (provenance: PROVENANCE § Retrospective anti-patterns — evidence quotes)

These patterns have caused significant time waste. **AVOID them.**

### 1. Manual Test Creation (2-3 hours waste per SD)
**Pattern**: Writing tests manually instead of delegating to testing-agent

**Fix**: Always use Task tool with `subagent_type: "testing-agent"`
```
Task(subagent_type="testing-agent", prompt="Create E2E tests for [feature] based on PRD acceptance criteria")
```

---

### 2. Skipping Knowledge Retrieval (4-6 hours rework)
**Pattern**: Starting implementation without querying retrospectives/patterns

**Fix**: Run before EXEC starts:
```bash
node scripts/automated-knowledge-retrieval.js <SD-ID>
```
If `research_confidence_score = 0.00`, you skipped this step.

---

### 3. Workarounds Before Root Cause (2-3x time multiplier)
**Pattern**: Working around issues instead of fixing root causes

**Fix**: Before implementing a workaround, ask:
- [ ] Have I identified the root cause?
- [ ] Is this a fix or a workaround?
- [ ] What is the time multiplier? (typical: 2-3x)

---

### 4. Accepting Environmental Blockers Without Debug
**Pattern**: Accepting "it's environmental" without investigation

**Fix**: 5-step minimum debug before accepting as environmental:
1. Check logs for specific error
2. Verify credentials/tokens
3. Test in isolation (curl, manual browser)
4. Check network/ports
5. Compare with known working state

---

### 5. Manual Sub-Agent Simulation (15% quality delta)
**Pattern**: Manually creating sub-agent results instead of executing tools

**Fix**: Sub-agent results MUST have:
- `tool_executed: true`
- Actual execution timestamp
- Real output (not simulated)

---


### 6. Reinventing Existing Deletion Primitives (repeats a fixed hazard class)
**Pattern**: Writing new worktree-adjacent file-deletion logic without first checking for an existing primitive

**Fix**: Before writing ANY worktree-adjacent file-deletion code, grep for the existing chokepoint first:
```bash
grep -rn "rmSync\|junction\|safeRecursiveRm" lib/worktree-manager.js
```
Route the delete through `safeRecursiveRm` (lib/worktree-manager.js) rather than a fresh `fs.rmSync`/raw recursive delete -- it is the one place this repo's junction-safe deletion policy is maintained, and a second unreviewed implementation is a second unreviewed policy.

### Quick Reference

| Anti-Pattern | Time Cost | Fix |
|--------------|-----------|-----|
| Manual test creation | 2-3 hours | Use testing-agent |
| Skip knowledge retrieval | 4-6 hours | Run automated-knowledge-retrieval.js |
| Workarounds first | 2-3x multiplier | Fix root cause |
| Accept environmental | Hours of idle | 5-step debug minimum |
| Simulate sub-agents | 15% quality loss | Execute actual tools |
| Reinvent deletion primitive | Repeat of a fixed hazard class | grep for safeRecursiveRm first |

**Pattern References**: PAT-RECURSION-001 through PAT-RECURSION-005