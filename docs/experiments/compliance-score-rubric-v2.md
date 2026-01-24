# LEO Protocol Compliance Score Rubric v2 (TYPE-AGNOSTIC)

**Version**: 2.0
**Date**: 2026-01-24

---

## Overview

The Type-Agnostic Compliance Score dynamically adjusts requirements based on each SD's `sd_type`. This ensures fair scoring across different work types.

---

## SD Type Requirements Matrix

| SD Type | PRD | Min Handoffs | Gate % | Required Sub-Agents | E2E |
|---------|-----|--------------|--------|---------------------|-----|
| `feature` | ✓ | 4 | 85% | RISK, VALIDATION, STORIES | ✓ |
| `infrastructure` | ✓ | 3 | 80% | RISK, GITHUB, REGRESSION | ✗ |
| `enhancement` | ○ | 2 | 75% | VALIDATION | ✗ |
| `fix` / `bugfix` | ✗ | 1 | 70% | RCA | ✗ |
| `documentation` | ✗ | 1 | 60% | DOCMON | ✗ |
| `refactor` | ✓ | 3 | 80% | REGRESSION, VALIDATION | ✓ |
| `database` | ✓ | 4 | 85% | DATABASE, SECURITY | ✓ |
| `security` | ✓ | 4 | 90% | SECURITY, RISK | ✓ |
| `orchestrator` | ✓ | 4 | 85% | VALIDATION | ✗ |
| `performance` | ○ | 2 | 75% | PERFORMANCE | ✗ |
| `library` | ○ | 2 | 75% | DEPENDENCY | ✗ |

Legend: ✓ = Required, ○ = Optional, ✗ = Not Required

---

## Compliance Score Components (100 points)

### 1. Protocol File Reading (20 points)

Points awarded based on phase progression (proxy for file reads):

| Phase Reached | Points | Files Expected to Read |
|---------------|--------|------------------------|
| LEAD_APPROVAL | 0 | CLAUDE_CORE.md |
| PLAN_PRD | 5 | + CLAUDE_LEAD.md |
| EXEC_IMPLEMENTATION | 10 | + CLAUDE_PLAN.md |
| PLAN_VERIFY | 15 | + CLAUDE_EXEC.md |
| LEAD_FINAL_APPROVAL | 20 | All files |

---

### 2. Handoff Execution (25 points)

**Type-Adjusted Calculation**:
```
Points per handoff = 25 / min_handoffs_for_type
Score = MIN(valid_handoffs × points_per_handoff, 25)
```

| SD Type | Min Handoffs | Points per Handoff |
|---------|--------------|-------------------|
| feature | 4 | 6.25 |
| infrastructure | 3 | 8.33 |
| enhancement | 2 | 12.5 |
| fix/bugfix | 1 | 25 |
| documentation | 1 | 25 |
| refactor | 3 | 8.33 |
| database | 4 | 6.25 |
| security | 4 | 6.25 |

**Validation**: Only handoffs with `created_by = 'UNIFIED-HANDOFF-SYSTEM'` count.

---

### 3. Context Continuity (20 points)

| Progress | Points |
|----------|--------|
| completed (100%) | 20 |
| 80-99% | 16-19 |
| 50-79% | 10-15 |
| 25-49% | 5-9 |
| 1-24% | 1-4 |
| 0% | 0 |

---

### 4. Sub-Agent Invocation (20 points)

**Type-Adjusted Calculation**:
```
Points per required sub-agent = 20 / required_sub_agents_count
Score = MIN(matched_sub_agents × points_per_agent, 20)
```

| SD Type | Required Sub-Agents | Points Each |
|---------|---------------------|-------------|
| feature | RISK, VALIDATION, STORIES | 6.67 |
| infrastructure | RISK, GITHUB, REGRESSION | 6.67 |
| refactor | REGRESSION, VALIDATION | 10 |
| fix/bugfix | RCA | 20 |
| documentation | DOCMON | 20 |
| database | DATABASE, SECURITY | 10 |
| security | SECURITY, RISK | 10 |

---

### 5. Workflow Integrity (15 points)

| Component | Points | Condition |
|-----------|--------|-----------|
| PRD | 5 | Created if required by type, OR not required |
| Gate Threshold | 5 | Handoff count ≥ type minimum |
| Evidence | 5 | Records in `validation_evidence` table |

---

## Scoring Formula

```
Total = Protocol Files (20) + Handoffs (25) + Context (20) + Sub-Agents (20) + Workflow (15)
```

### Pass/Fail Determination

**PASS**: Score ≥ Type's Gate Threshold

| SD Type | Must Score |
|---------|------------|
| feature | ≥ 85 |
| infrastructure | ≥ 80 |
| enhancement | ≥ 75 |
| fix/bugfix | ≥ 70 |
| documentation | ≥ 60 |
| refactor | ≥ 80 |
| database | ≥ 85 |
| security | ≥ 90 |

---

## Example: Mixed-Type Experiment

If an orchestrator has children of different types:

```
Children:
  - SD-FEAT-001 (feature) → threshold 85%
  - SD-FIX-001 (fix) → threshold 70%
  - SD-DOC-001 (documentation) → threshold 60%
  - SD-INFRA-001 (infrastructure) → threshold 80%

Average Type Threshold = (85 + 70 + 60 + 80) / 4 = 73.75%

Experiment PASS if:
  1. Average score ≥ 73.75%
  2. Each SD meets its own type threshold
  3. Total handoffs ≥ (4 + 1 + 1 + 3) = 9
```

---

## Running the Type-Agnostic Tracker

```bash
# For orchestrator with children
node scripts/compliance-score-tracker-v2.js SD-LEO-REFAC-COMPLIANCE-EXP-001

# For single SD
node scripts/compliance-score-tracker-v2.js SD-FIX-BUG-001
```

---

## Output Interpretation

```
SD-LEO-REFAC-DATABASE-SUB-001 [refactor]
  ████████████████░░░░ 80.0/100 (Good)
  ├─ Protocol Files: 20.0/20
  ├─ Handoffs: 25.0/25 (3/3 req)     ← Type requires 3
  ├─ Context: 20.0/20
  ├─ Sub-Agents: 10.0/20 (1/2 req)   ← Type requires REGRESSION, VALIDATION
  └─ Workflow: 5.0/15 (PRD: ✓)       ← PRD required for refactor
```

---

## Comparison: v1 vs v2

| Aspect | v1 (Fixed) | v2 (Type-Agnostic) |
|--------|------------|-------------------|
| Handoff threshold | Always 4 | Based on sd_type |
| PRD scoring | Always required | Based on sd_type |
| Sub-agent scoring | Fixed 2 | Based on sd_type |
| Gate threshold | Fixed 85% | Based on sd_type |
| Mixed-type support | ✗ | ✓ |

---

## Database Support

The tracker queries:
- `strategic_directives_v2` - SD metadata and type
- `sd_phase_handoffs` - Handoff records
- `product_requirements_v2` - PRD records
- `sub_agent_execution_results` - Sub-agent invocations
- `validation_evidence` - Evidence collection

---

*This rubric supports all SD types in the LEO Protocol.*
