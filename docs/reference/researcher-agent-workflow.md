# Researcher Agent Workflow


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, api, migration, schema

**Version**: 1.0
**Date**: 2025-12-28
**Status**: Active

---

## Overview

The Researcher Agent Workflow handles Strategic Directives that produce decisions and documents rather than code. This workflow applies to SD types that emerged from the runtime audit triangulation:

- `discovery_spike` - Time-boxed first-principles investigation
- `architectural_review` - Cross-cutting themes requiring holistic analysis
- `strategic_observation` - Chairman insights about product direction
- `product_decision` - Decisions needed before implementation

---

## When to Use

| SD Type | Trigger | Output |
|---------|---------|--------|
| `discovery_spike` | Audit finding says "first principles rethink" | Decision document |
| `architectural_review` | Multiple issues share a root cause | Architecture decision |
| `strategic_observation` | Chairman makes strategic comment | Product direction memo |
| `product_decision` | Implementation blocked by unclear requirements | Decision record |

---

## Key Differences from Implementation SDs

| Aspect | Implementation SD | Researcher SD |
|--------|-------------------|---------------|
| Output | Working code | Document |
| PRD Required | Yes | Optional |
| Time Box | Sprint-based | Hours (2-8) |
| Success Criteria | Tests pass | Decision made |
| Deliverable | Pull Request | Markdown document |
| EXEC Phase | Write code | Write analysis |

---

## Workflow Phases

### 1. LEAD Phase

Same as implementation SDs:
- Review SD description
- Confirm scope and boundaries
- Identify stakeholders for decision

### 2. PLAN Phase

**Different from implementation:**
- No PRD required (unless complex)
- Define research questions
- Identify information sources
- Set time box

**Research Plan Template:**
```markdown
## Research Plan: [SD Title]

### Questions to Answer
1. [Specific question 1]
2. [Specific question 2]
3. [Specific question 3]

### Information Sources
- Codebase: [files to examine]
- Database: [tables to query]
- External: [docs, APIs, etc.]

### Time Box
- Maximum: [X hours]
- Checkpoint: [halfway point]

### Decision Criteria
- If [condition A]: recommend [option 1]
- If [condition B]: recommend [option 2]
```

### 3. EXEC Phase

**Instead of writing code, write analysis:**

1. Gather information from defined sources
2. Analyze options
3. Evaluate trade-offs
4. Make recommendation
5. Document decision

**Decision Document Template:**
```markdown
# [Decision Title]

## Context
[What prompted this decision? Link to original audit finding.]

## Options Considered

### Option A: [Name]
**Pros:**
- [Pro 1]
- [Pro 2]

**Cons:**
- [Con 1]

**Effort:** [Low/Medium/High]

### Option B: [Name]
...

## Recommendation
[Which option and why]

## Implementation Path
[If approved, what are the next steps?]

## Appendix
[Supporting data, code snippets, diagrams]
```

---

## Time Boxes by Type

| SD Type | Time Box | Checkpoint |
|---------|----------|------------|
| `discovery_spike` | 2-4 hours | 1 hour |
| `architectural_review` | 4-8 hours | 2 hours |
| `strategic_observation` | 1-2 hours | 30 min |
| `product_decision` | 1-2 hours | 30 min |

**At checkpoint:**
- Review progress
- Decide: continue, pivot, or escalate
- If blocked, create follow-up SD

---

## Deliverables

### Discovery Spike
```
docs/decisions/[date]-[topic]-discovery-spike.md
```

Contents:
- Problem statement (from audit finding)
- Investigation approach
- Findings
- Options evaluated
- Recommendation
- Next steps

### Architectural Review
```
docs/decisions/[date]-[topic]-architectural-review.md
```

Contents:
- Theme description (from grouped audit findings)
- Current state analysis
- Proposed architecture
- Migration path
- Risks and mitigations
- Decision

### Strategic Observation
```
docs/decisions/[date]-[topic]-strategic-memo.md
```

Contents:
- Chairman's original observation (verbatim)
- Context and implications
- Recommended direction
- Impact on roadmap
- Action items

### Product Decision
```
docs/decisions/[date]-[topic]-product-decision.md
```

Contents:
- Decision needed
- Options
- Trade-offs
- Recommendation
- Approval (Chairman/stakeholder)

---

## SD Completion Criteria

| Criterion | Implementation SD | Researcher SD |
|-----------|-------------------|---------------|
| Tests pass | Required | N/A |
| Document exists | N/A | Required |
| PRD completed | Required | Optional |
| Handoff accepted | Required | Required |
| Decision made | N/A | Required |
| Next steps defined | Optional | Required |

---

## Integration with LEO Protocol

### Handoffs

Researcher SDs use the same handoff mechanism:

```javascript
// PLAN → EXEC handoff
{
  transition_type: 'PLAN_TO_EXEC',
  research_questions: [...],
  time_box_hours: 4,
  checkpoint_after_hours: 2
}

// EXEC → PLAN handoff (completion)
{
  transition_type: 'EXEC_TO_PLAN',
  decision_document: 'docs/decisions/...',
  recommendation: '...',
  next_steps: [...]
}
```

### Sub-Agents

Researcher SDs typically use:
- **ARCHITECT** - For architectural_review type
- **DATABASE** - If decision involves schema
- **SECURITY** - If decision involves permissions
- **RETRO** - After completion (always)

---

## Examples

### Example 1: Discovery Spike

**Original audit finding:**
> NAV-17: Page needs first principles rethink

**SD Created:**
```javascript
{
  id: 'SD-SPIKE-ANALYTICS-001',
  sd_type: 'discovery_spike',
  title: 'First Principles Rethink: Analytics Page',
  metadata: {
    original_issue_ids: ['NAV-17'],
    chairman_verbatim_text: 'Page needs first principles rethink',
    sd_output_type: 'decision_document'
  }
}
```

**Output:**
`docs/decisions/2025-12-28-analytics-discovery-spike.md`

### Example 2: Architectural Review

**Original audit findings (theme):**
> NAV-14, NAV-18, NAV-19, NAV-25: Mock data inconsistency

**SD Created:**
```javascript
{
  id: 'SD-THEME-MOCKDATA-001',
  sd_type: 'architectural_review',
  title: 'Mock Data Strategy - Central Data Policy',
  metadata: {
    original_issue_ids: ['NAV-14', 'NAV-18', 'NAV-19', 'NAV-25'],
    chairman_verbatim_text: 'Some pages show mock data, others show empty real data. Need central strategy.'
  }
}
```

**Output:**
`docs/decisions/2025-12-28-mock-data-architectural-review.md`

---

## Decision Storage

Decisions from researcher SDs should be:

1. **Stored in markdown** - `docs/decisions/` directory
2. **Linked in SD metadata** - `metadata.decision_document`
3. **Indexed in database** (future) - Decision search capability

---

## Related Documentation

- [Audit-to-SD Pipeline](./audit-to-sd-pipeline.md) - How audit findings become SDs
- [Audit Format Spec](./audit-format-spec.md) - Markdown file format

---

*Created: 2025-12-28*
*Based on triangulated recommendations (Claude + OpenAI + Antigravity)*
