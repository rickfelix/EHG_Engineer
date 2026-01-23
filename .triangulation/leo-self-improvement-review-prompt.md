# Triangulation Prompt: LEO Self-Improvement Loop Design Review

## Instructions for External AI Analysis

**Send this prompt to**: ChatGPT (GPT-4), AntiGravity, or other AI assistants
**Purpose**: Get independent review of a proposed self-improvement architecture for a governance protocol

---

## PROMPT TO SEND (Copy below this line)

---

# Design Review: Self-Improving Governance Protocol

## Context

I have designed a "self-improvement loop" for a software governance protocol called LEO. LEO orchestrates AI-assisted software development through phases (LEAD → PLAN → EXEC) and uses specialized AI sub-agents for validation tasks.

I'm seeking an independent architectural review of this design. Please be critical and explicit about assumptions.

## Current State (What Already Exists)

The system already has:
- **Retrospectives table** (466 rows) capturing lessons learned, failure patterns, and suggested improvements
- **Protocol improvement queue** (40+ items) with automatic extraction from retrospectives
- **Protocol versioning** with supersession chain
- **Audit logging** for all changes
- **CLI tools** for review/approve/apply workflow
- **Database-first architecture** (CLAUDE.md generated from database, never edited directly)

**Current workflow**:
```
Retrospective → Extraction trigger → Improvement queue (PENDING) → Human review → Apply → Regenerate docs
```

## Proposed Design

### Risk Tier System (3 tiers)

| Tier | Name | Approval Required | Examples |
|------|------|-------------------|----------|
| IMMUTABLE | Cannot change | Never | Safety constraints, audit requirements |
| GOVERNED | Human required | Always | Validation logic, routing rules, gates |
| AUTO | Automated | If AI score ≥70 | Typos, formatting, documentation |

### Separation of Duties

| Role | Responsibility |
|------|----------------|
| Proposer | ImprovementExtractor (parses retrospectives) |
| Evaluator | AI Quality Judge (scores 0-100, different prompt/model) |
| Approver | Human for GOVERNED tier; automated for AUTO tier |

**Key constraint**: The system that proposes improvements cannot approve its own proposals.

### Intelligent Evidence System

Instead of simple occurrence counts, use weighted scoring:
```
evidence_score = (occurrence_count * recency_weight) + severity_multiplier - time_decay
```

**Resolution detection**:
- If a delivery completes that mentions pattern keywords → flag as potentially resolved
- If improvement applied and recurrence drops → auto-mark resolved
- If no new occurrences in 90 days → archive

### Anti-Bloat System (3 layers)

1. **Token budget cap**: 20k tokens max for protocol docs; warn at 80%
2. **Semantic conflict detection**: AI checks for contradictions when adding rules
3. **Priority hierarchy**: CORE (never remove) / STANDARD (review) / SITUATIONAL (consolidate first)

### Constitution File (5 immutable rules)

1. Human approval required for GOVERNED tier
2. No self-approval loops
3. Audit trail mandatory
4. Rollback capability required
5. Database-first always

## Questions for Your Analysis

### Architecture Questions

1. Is the 3-tier risk system (IMMUTABLE/GOVERNED/AUTO) the right granularity, or should there be more/fewer tiers?

2. Is the separation of duties (Proposer → Evaluator → Approver) sufficient to prevent self-approval loops?

3. Is the evidence scoring formula reasonable, or are there better approaches to weighted evidence?

4. Is the 70% AI score threshold for AUTO tier appropriate? Too low? Too high?

### Risk Questions

5. What could go wrong with this design? What are the failure modes?

6. Are the 5 constitution rules sufficient, or are there critical rules missing?

7. How might the system game or drift over time despite these safeguards?

### Implementation Questions

8. What's the riskiest part of this design to implement?

9. What should be built first for maximum learning with minimum risk?

10. Are there simpler alternatives that achieve the same goals?

### Alternative Approaches

11. Is there a fundamentally different approach to "LEO maintains LEO" that we should consider?

12. Are there lessons from other self-improving systems (ML, DevOps, etc.) that apply here?

## What I'm NOT Asking

- Don't assume this design is correct; critique it
- Don't just validate the approach; find the weaknesses
- If you think this is overengineered, say so
- If you see a simpler solution, propose it

## Output Format Requested

1. **Initial Assessment**: Is this design sound, overengineered, or missing something critical?
2. **Strengths**: What parts of the design are well-conceived?
3. **Weaknesses**: What parts are risky, unclear, or likely to fail?
4. **Missing Elements**: What's not addressed that should be?
5. **Alternative Approaches**: Different ways to achieve the same goals
6. **Recommended Changes**: Specific modifications to improve the design
7. **Build Order**: If implementing, what to build first?
8. **Confidence**: 0-100 confidence in your assessment, plus the biggest uncertainty

---

## END OF PROMPT

---

## After Receiving Responses

Bring the external AI responses back for triangulation analysis. We'll compare:
- Areas of consensus vs disagreement
- Risks identified by multiple sources
- Novel insights or alternatives
- Recommended changes to the design

