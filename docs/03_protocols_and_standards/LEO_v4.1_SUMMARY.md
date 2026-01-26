# LEO Protocol v4.1 - Quick Reference Summary


## Metadata
- **Category**: Protocol
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, testing, e2e, schema

## What's New in v4.1

### 1. Complete Verification Cycle ✅
```
LEAD → PLAN → EXEC → PLAN → LEAD → Deploy
      ↓       ↓       ↑       ↑
   Planning  Build  Verify  Approve
```

### 2. Clear Agent Responsibilities

| Agent | Primary Role | Verification Role |
|-------|-------------|-------------------|
| LEAD | Strategic Planning (20%) | Final Approval (15%) |
| PLAN | Technical Design (20%) | Acceptance Testing (15%) |
| EXEC | Implementation (30%) | N/A |

### 3. Mandatory Sub-Agent Triggers

| Sub-Agent | MUST Activate When |
|-----------|-------------------|
| Security | ANY security mention |
| Performance | Any metric defined |
| Design | 2+ UI/UX requirements |
| Testing | Coverage >80% OR E2E |
| Database | ANY schema change |

### 4. Handoff Communication Standards

**Every handoff MUST include:**
1. Executive Summary (≤200 tokens)
2. Completeness Report
3. Deliverables Manifest
4. Key Decisions & Rationale
5. Known Issues & Risks
6. Resource Utilization
7. Action Items for Receiver

**Missing elements = AUTOMATIC REJECTION**

### 5. Handoff Validation Protocol

```markdown
Receive Handoff
    ↓
Validate Format → FAIL → REJECT & Return
    ↓ PASS
Validate Content → FAIL → REJECT & Return
    ↓ PASS
ACCEPT & Proceed
```

### 6. Progress Calculation

```
Total Progress = 
  LEAD Planning (20%) +
  PLAN Design (20%) +
  EXEC Implementation (30%) +
  PLAN Verification (15%) +
  LEAD Approval (15%)
= 100%
```

### 7. Failure Handling

**When PLAN rejects EXEC work:**
- EXEC fixes and resubmits
- Cycle continues until accepted

**When LEAD rejects final delivery:**
- Returns to appropriate agent
- Full verification cycle repeats

### 8. Communication Requirements

**Progress Updates Required at:**
- 25% phase completion
- 50% phase completion
- 75% phase completion
- Ready for handoff

**Blocker Notifications Must Include:**
- Who is blocked
- Type of blocker
- What's needed
- Impact if not resolved

## Critical Rules

1. **NO handoff without 9/9 checklist items**
2. **NO deployment without LEAD approval**
3. **NO skipping PLAN verification**
4. **NO accepting malformed handoffs**
5. **NO proceeding with blocked work**

## Success Metrics

| Metric | Target |
|--------|--------|
| First-pass Verification | >80% |
| Handoff Rejections | <20% |
| Rework Cycles | <2 |
| Format Compliance | 100% |

## Quick Decision Tree

```
Q: Ready to handoff?
→ Checklist 9/9? → NO → Complete it
    ↓ YES
→ Format correct? → NO → Fix format
    ↓ YES
→ Deliverables ready? → NO → Complete them
    ↓ YES
→ HANDOFF

Q: Received handoff?
→ Format valid? → NO → REJECT
    ↓ YES
→ Content complete? → NO → REJECT
    ↓ YES
→ ACCEPT & PROCEED
```

---

*LEO Protocol v4.1 - No ambiguity. Total accountability.*