# Triangulation Prompt: Self-Improvement Loop Focus

## Instructions

**Send to**: Third AI or separate session
**Focus**: Governance and safety of self-modifying systems

---

## PROMPT TO SEND (Copy below this line)

---

# Design Review: Self-Improving Protocol System

## Context

I have a governance protocol (LEO) that orchestrates AI-assisted software development. The protocol includes:
- Validation rules and quality gates
- Rubrics for scoring deliverables
- Routing logic for which AI sub-agent handles which task
- Prompts/instructions for sub-agents

Currently, the protocol is **versioned in a database** with full history:

```sql
CREATE TABLE leo_protocols (
  id VARCHAR(50) PRIMARY KEY,
  version VARCHAR(50) UNIQUE,  -- e.g., '4.3.3'
  status VARCHAR(20),          -- 'active', 'superseded', 'draft'
  content TEXT,                -- Full protocol markdown
  superseded_by VARCHAR(50),   -- Points to newer version
  created_at TIMESTAMPTZ
);

-- Only one active at a time
CREATE UNIQUE INDEX ON leo_protocols(status) WHERE status = 'active';
```

The system also has a **learning mechanism**:

```sql
-- Patterns extracted from past issues
CREATE TABLE issue_patterns (
  id UUID PRIMARY KEY,
  pattern_id VARCHAR(20),      -- 'PAT-001', 'PAT-002'
  category VARCHAR(50),
  severity VARCHAR(20),
  occurrence_count INTEGER,
  proven_solutions JSONB,      -- Solutions with success_rate
  prevention_checklist JSONB,
  status VARCHAR(20)           -- 'active', 'resolved'
);

-- Retrospectives after each work item
CREATE TABLE retrospectives (
  id UUID PRIMARY KEY,
  sd_id VARCHAR(100),
  lessons_learned JSONB,
  action_items JSONB,
  quality_score INTEGER
);
```

## Current Self-Improvement Flow

```
1. Work item completes → Retrospective created
2. ImprovementExtractor parses retrospectives → Proposes changes
3. Changes queued in protocol_improvement_queue (status: PROPOSED)
4. [MANUAL] Human reviews and approves/rejects
5. If approved: Changes applied to protocol sections
6. CLAUDE.md file regenerated from database
7. New protocol version becomes active
```

## Proposed Enhancement

I want to **partially automate** steps 4-5:

1. **AI Quality Assessment**: Score each proposed improvement (0-100)
2. **Automatic approval for low-risk changes** (cosmetic, documentation)
3. **Human approval required for high-risk changes** (validation logic, routing)
4. **A/B testing**: Run old vs new protocol on subset of work items
5. **Effectiveness tracking**: Did the change reduce issue recurrence?

## Questions for Your Analysis

### Safety & Governance

1. **What could go wrong** with a system that modifies its own prompts/rules?
2. **What guardrails are essential** vs nice-to-have?
3. **Should any changes NEVER be auto-approved**? Which categories?
4. **How do you prevent drift** where small changes compound into something unintended?

### Technical Design

5. **How would you classify change risk**? (Schema/algorithm suggestion)
6. **What should the AI scoring rubric evaluate**? (Criteria)
7. **How would you implement A/B testing** for protocol changes?
8. **What metrics indicate a change was beneficial vs harmful**?

### Rollback & Recovery

9. **How quickly should you detect a bad change**?
10. **What's the rollback mechanism**? (Already have versioning, but what triggers it?)
11. **Should there be a "blast radius" limit** on how much can change per version?

### Human-in-Loop

12. **What's the right balance** between automation and human review?
13. **How do you prevent alert fatigue** for human reviewers?
14. **Should some humans have different approval authorities**?

## What I'm NOT Asking

- This is not about whether AI should self-improve in general (philosophical)
- This is specifically about a bounded domain (software governance protocol)
- The protocol controls AI sub-agents, not the core AI models themselves

## Output Format

1. **Risk Assessment**: What are the actual risks in this specific system?
2. **Essential Guardrails**: Non-negotiable safety measures
3. **Recommended Architecture**: How you'd structure the self-improvement loop
4. **Change Classification**: How to categorize risk levels
5. **Metrics & Monitoring**: What to track for detecting problems
6. **What to Avoid**: Anti-patterns in self-modifying systems

---

## END OF PROMPT

