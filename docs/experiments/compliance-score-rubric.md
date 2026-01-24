# LEO Protocol Compliance Score Rubric

**Experiment**: SD-LEO-REFAC-COMPLIANCE-EXP-001
**Date**: 2026-01-24
**Version**: 1.0

---

## Compliance Score Components (100 points total)

The LEO Protocol Compliance Score measures adherence across 5 dimensions:

### 1. Protocol File Reading (20 points)

| Checkpoint | Points | Criteria |
|------------|--------|----------|
| LEAD phase file read | 5 | CLAUDE_LEAD.md read at session start or LEAD phase entry |
| PLAN phase file read | 5 | CLAUDE_PLAN.md read before PRD creation |
| EXEC phase file read | 5 | CLAUDE_EXEC.md read before implementation |
| CORE file read | 5 | CLAUDE_CORE.md read at session initialization |

**Measurement**: Check evidence of file reads in session log or via hooks

---

### 2. Handoff Execution (25 points)

| Checkpoint | Points | Criteria |
|------------|--------|----------|
| LEAD-TO-PLAN handoff | 5 | Handoff script executed (not bypassed) |
| PLAN-TO-EXEC handoff | 5 | Handoff script executed with PRD validation |
| EXEC-TO-PLAN handoff | 5 | Verification handoff executed |
| PLAN-TO-LEAD handoff | 5 | Final approval handoff executed |
| Handoff validation gates | 5 | All gates passed (or documented exceptions) |

**Measurement**: Query `sd_phase_handoffs` table for `created_by = 'UNIFIED-HANDOFF-SYSTEM'`

---

### 3. Context Continuity (20 points)

| Checkpoint | Points | Criteria |
|------------|--------|----------|
| Session state saved | 5 | `.claude/unified-session-state.json` updated |
| Context summary accurate | 5 | Key decisions preserved across compaction |
| SD state preserved | 5 | Current SD and phase carried forward |
| Work-in-progress tracked | 5 | `is_working_on` flag maintained correctly |

**Measurement**: Compare pre/post compaction state files

---

### 4. Sub-Agent Invocation (20 points)

| Checkpoint | Points | Criteria |
|------------|--------|----------|
| Required sub-agents run | 10 | REGRESSION for refactor, VALIDATION for all |
| Sub-agent results logged | 5 | Results recorded in `sub_agent_execution_results` |
| Sub-agent findings addressed | 5 | Issues from sub-agents resolved before completion |

**Measurement**: Query `sub_agent_execution_results` for SD children

---

### 5. Workflow Integrity (15 points)

| Checkpoint | Points | Criteria |
|------------|--------|----------|
| PRD created (if required) | 5 | PRD exists in `product_requirements_v2` for refactor type |
| Gate threshold met | 5 | ≥80% gate pass rate for refactor type |
| Evidence collected | 5 | Validation evidence in `validation_evidence` table |

**Measurement**: Query PRD and validation tables

---

## Scoring Calculation

```
Total Score = Protocol Files (20) + Handoffs (25) + Context (20) + Sub-Agents (20) + Workflow (15)
```

### Score Interpretation

| Score Range | Rating | Interpretation |
|-------------|--------|----------------|
| 90-100 | Excellent | Full protocol compliance |
| 80-89 | Good | Minor gaps, acceptable |
| 70-79 | Fair | Significant gaps, needs improvement |
| 60-69 | Poor | Major compliance failures |
| <60 | Critical | Protocol largely bypassed |

---

## Per-Child Tracking Template

For each of the 10 children, track:

```
Child: SD-LEO-REFAC-XXX-001
File: path/to/file.js

Protocol Files:
  [ ] CLAUDE_CORE.md read
  [ ] CLAUDE_LEAD.md read
  [ ] CLAUDE_PLAN.md read
  [ ] CLAUDE_EXEC.md read

Handoffs:
  [ ] LEAD-TO-PLAN executed
  [ ] PLAN-TO-EXEC executed
  [ ] EXEC-TO-PLAN executed
  [ ] PLAN-TO-LEAD executed

Context:
  [ ] Session state preserved across compaction
  [ ] SD context carried forward

Sub-Agents:
  [ ] REGRESSION invoked
  [ ] VALIDATION invoked
  [ ] Results logged

Workflow:
  [ ] PRD created
  [ ] Gates passed (rate: __%/80%)
  [ ] Evidence collected

SCORE: __/100
```

---

## Experiment Success Criteria

| Metric | Target | Actual |
|--------|--------|--------|
| Average compliance score | ≥85 | ___ |
| Children with score ≥80 | 10/10 | ___ |
| Total handoffs created | 40+ | ___ |
| Context carryover rate | 100% | ___ |
| Protocol file reads | 40+ | ___ |

---

## Automated Tracking Query

```sql
-- Compliance Score Query (run after experiment)
WITH child_metrics AS (
  SELECT
    sd.id,
    sd.title,
    (SELECT COUNT(*) FROM sd_phase_handoffs h WHERE h.sd_id = sd.id AND h.created_by = 'UNIFIED-HANDOFF-SYSTEM') as handoff_count,
    (SELECT COUNT(*) FROM product_requirements_v2 p WHERE p.sd_id = sd.id) as prd_count,
    (SELECT COUNT(*) FROM sub_agent_execution_results s WHERE s.sd_id = sd.id) as subagent_count,
    (SELECT COUNT(*) FROM validation_evidence v WHERE v.sd_id = sd.id) as evidence_count
  FROM strategic_directives_v2 sd
  WHERE sd.parent_sd_id = 'SD-LEO-REFAC-COMPLIANCE-EXP-001'
)
SELECT
  id,
  title,
  handoff_count,
  prd_count,
  subagent_count,
  evidence_count,
  -- Simplified score calculation
  (LEAST(handoff_count, 4) * 6.25 +   -- 25 points max
   LEAST(prd_count, 1) * 5 +           -- 5 points max
   LEAST(subagent_count, 2) * 10 +     -- 20 points max
   LEAST(evidence_count, 1) * 5        -- 5 points max
  ) as partial_score
FROM child_metrics
ORDER BY id;
```

---

## Hook-Based Tracking (For Protocol File Reads)

To track CLAUDE.md file reads, we can use Claude Code hooks:

```javascript
// .claude/hooks/track-protocol-reads.js
module.exports = {
  onToolUse: async ({ toolName, params }) => {
    if (toolName === 'Read' && params.file_path) {
      const protocolFiles = [
        'CLAUDE_CORE.md',
        'CLAUDE_LEAD.md',
        'CLAUDE_PLAN.md',
        'CLAUDE_EXEC.md'
      ];

      for (const pf of protocolFiles) {
        if (params.file_path.includes(pf)) {
          // Log to tracking table
          await logProtocolFileRead(pf, getCurrentSD());
        }
      }
    }
  }
};
```

---

## Manual Observation Checklist

During the experiment, observe and record:

1. **At session start**: Was CLAUDE_CORE.md read?
2. **Before each handoff**: Was the phase-appropriate CLAUDE_*.md read?
3. **After compaction**: Was context properly restored?
4. **For each child**: Were all mandatory sub-agents invoked?
5. **At completion**: Were all handoffs created via scripts (not bypassed)?

---

*This rubric should be used to evaluate each child SD and calculate the overall experiment compliance score.*
