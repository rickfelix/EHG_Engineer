# /rca - Root Cause Analysis with 5-Whys + Investigation

When a handoff, validation, or sub-agent fails, use this root cause analysis pattern instead of simple retry-then-skip. Combines progressive 5-Whys diagnosis with GStack-inspired investigation techniques (structured hypotheses, evidence collection, anti-confirmation-bias).

## RCA Levels

### Level 1: Initial Failure
Standard attempt failed. Log the failure and proceed to Level 2.

### Level 2: First 5-Whys (Diagnose)
Launch an explorer agent to ask 5 progressive "why" questions:

```
Why #1: What specifically failed? (error message, blocker name)
Why #2: Why did that component fail? (missing data, config, dependency)
Why #3: Why is that missing/wrong? (not implemented, misconfigured, stale)
Why #4: Why wasn't it caught earlier? (gap in validation, missing test)
Why #5: What's the root cause pattern? (process gap, design flaw, edge case)
```

**Explorer Agent Prompt:**
```
Analyze this failure for SD {SD_ID}:
- Failure type: {FAILURE_TYPE}
- Error: {ERROR_MESSAGE}

Ask 5 progressive "why" questions to find root cause.
For each why, search the codebase for evidence.
Return: root_cause, quick_fix (if <10 min), pattern_to_log
```

### Level 2.5: Investigation Deepening (GStack Patterns)

Before jumping to fixes, apply these investigation techniques to avoid premature conclusions:

#### Competing Hypothesis Generation

Generate **at least 3 competing explanations** before narrowing:

```
Hypothesis A (Obvious): [The most apparent cause — first instinct]
Hypothesis B (Systemic): [A deeper process/architecture issue]
Hypothesis C (Environmental): [External factors — config, dependencies, timing]
```

**Forced Questions** (answer ALL before choosing a hypothesis):
- "What evidence would DISPROVE my leading hypothesis?"
- "Has this exact failure happened before? What was the ACTUAL cause last time?"
- "If I'm wrong about the cause, what's the most expensive consequence?"

#### Evidence Collection Framework

Systematically gather evidence across these categories before concluding:

| Category | Check | Tool |
|----------|-------|------|
| **Error context** | Full stack trace, not just message | Read error logs |
| **Recent changes** | Commits in last 24h touching related files | `git log --since=24h` |
| **State** | Database records, config values at failure time | Supabase query |
| **Dependencies** | Upstream service health, package versions | `npm ls`, API checks |
| **Patterns** | Similar failures in `issue_patterns` table | Database query |

**Anti-Confirmation-Bias Prompt:**
> Before concluding, explicitly search for evidence that CONTRADICTS your hypothesis. If you cannot find disconfirming evidence after 2 minutes of searching, note this as a confidence factor, not proof.

#### Root Cause Tree

Map contributing factors as a tree rather than a single chain:

```
Root Failure: [symptom]
├── Factor A: [contributing cause] (severity: H/M/L)
│   └── Sub-factor: [deeper cause]
├── Factor B: [contributing cause] (severity: H/M/L)
│   └── Sub-factor: [deeper cause]
└── Factor C: [environmental] (severity: H/M/L)
    └── Sub-factor: [deeper cause]

Primary root cause: [Factor with highest severity × likelihood]
Contributing factors: [Other factors that amplified the failure]
```

Combine with 5-Whys: each branch of the tree can have its own "why" chain.

---

### Level 3: Targeted Fix Attempt
Based on Level 2 findings:
- If quick_fix identified and <10 min effort → Implement fix
- If configuration issue → Adjust config
- If false positive → Document and bypass
- If real blocker requiring >10 min → Skip with intelligence

### Level 4: Second 5-Whys (If Level 3 Fix Failed)
Launch deeper explorer agent:

```
Why #1: Why didn't the fix work?
Why #2: What assumption was wrong?
Why #3: Is there a deeper systemic issue?
Why #4: What else depends on this?
Why #5: Is this a known pattern we've seen before?
```

**Explorer Agent Prompt:**
```
The initial fix for SD {SD_ID} failed.
Previous diagnosis: {LEVEL_2_FINDINGS}
Attempted fix: {FIX_ATTEMPTED}
Result: {FIX_RESULT}

Perform deeper 5-whys analysis. Check:
- Similar past failures in retrospectives
- Sub-agent configuration issues
- Missing infrastructure/dependencies
Return: deeper_root_cause, alternative_fix, skip_recommendation
```

### Level 5: Intelligent Skip
If still failing after Level 4:
1. **Log detailed findings** to `continuous_execution_log` table:
   - SD ID
   - Failure type
   - Both 5-whys analyses
   - Attempted fixes
   - Root cause identified
   - Recommended follow-up

2. **Create backlog item** (if pattern warrants):
   ```sql
   INSERT INTO strategic_backlog_items (sd_id, title, description, priority)
   VALUES ('{SD_ID}', 'Fix: {ROOT_CAUSE}', '{DETAILED_FINDINGS}', 'medium');
   ```

3. **Tag for learning**:
   - Add to `issue_patterns` if new pattern
   - Link to existing pattern if known

4. **Move to next SD** via `npm run sd:next`

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

**Note**: `/rca` is typically invoked when handoffs or sub-agents fail, requiring progressive diagnosis and remediation.

---

## Time Budgets

| Level | Max Time | Action if Exceeded |
|-------|----------|-------------------|
| 2 (First 5-Whys) | 3 min | Proceed with partial findings |
| 3 (Targeted Fix) | 10 min | Skip fix, go to Level 4 |
| 4 (Second 5-Whys) | 3 min | Skip with available findings |
| Total RCA | 20 min | Force skip, log timeout |

## Integration with Continuous Mode

When in continuous mode (`npm run leo:prompt`), failures automatically trigger this RCA:

```javascript
// Pseudo-code for continuous mode
async function handleFailure(sd, failureType, error) {
  // Level 2: First 5-Whys
  const diagnosis = await runExplorerAgent('5-whys-diagnose', { sd, error });

  if (diagnosis.quick_fix && diagnosis.effort_minutes < 10) {
    // Level 3: Attempt fix
    const fixResult = await attemptFix(diagnosis.quick_fix);
    if (fixResult.success) return retry(sd);

    // Level 4: Deeper analysis
    const deeperDiagnosis = await runExplorerAgent('5-whys-deeper', {
      sd, diagnosis, fixResult
    });

    if (deeperDiagnosis.alternative_fix) {
      const altResult = await attemptFix(deeperDiagnosis.alternative_fix);
      if (altResult.success) return retry(sd);
    }
  }

  // Level 5: Intelligent skip
  await logFindings(sd, diagnosis, deeperDiagnosis);
  await createBacklogItem(sd, diagnosis.root_cause);
  return skipToNext();
}
```

## Example Usage

```
User: The EXEC-TO-PLAN handoff failed for SD-NAMING-ENGINE-001

Claude (Level 2 - First 5-Whys):
Launching explorer agent to diagnose...

Why #1: GITHUB and TESTING sub-agents returned BLOCKED
Why #2: TESTING requires E2E tests; none exist for naming-engine
Why #3: SD was implemented without corresponding E2E test coverage
Why #4: PRD didn't specify E2E test requirements explicitly
Why #5: Root cause: Feature SDs should auto-generate E2E test stubs

Quick fix identified: Create minimal E2E smoke test (~8 min)

Claude (Level 3 - Attempting fix):
Creating tests/e2e/naming-engine.spec.ts with basic smoke test...
[Fix implemented]
Retrying handoff...

[If still fails, proceeds to Level 4, then Level 5]
```

## Logging Schema

```sql
-- Findings logged to continuous_execution_log
{
  "sd_id": "SD-XXX",
  "failure_type": "HANDOFF_BLOCKED",
  "rca_level_reached": 4,
  "first_5_whys": { ... },
  "second_5_whys": { ... },
  "fixes_attempted": [ ... ],
  "root_cause": "Missing E2E tests for feature SD",
  "pattern_tag": "missing-e2e-feature-sd",
  "backlog_item_created": "BI-XXX",
  "skipped_at": "2026-01-04T..."
}
```
