---
description: Trigger PLAN supervisor verification to ensure all requirements are truly met
argument-hint: [what to verify or check]
---

# 🔍 PLAN Supervisor Verification

Activate PLAN's supervisor mode to perform final "done done" verification:

**Task:** $ARGUMENTS

## Verification Scope

PLAN Supervisor will coordinate with ALL sub-agents to verify:

### 📋 Requirements Verification
- All PRD requirements met
- Acceptance criteria satisfied
- User stories completed
- Edge cases handled

### 🔐 Sub-Agent Consensus
Query all sub-agents for their domain-specific verification:

- **SECURITY** - No vulnerabilities remain
- **TESTING** - All tests passing, adequate coverage
- **DATABASE** - Schema integrity, optimizations applied
- **PERFORMANCE** - Metrics within thresholds
- **DESIGN** - UI/UX requirements met
- **API** - Endpoints functioning correctly
- **DOCUMENTATION** - Complete and accurate
- **COST** - Resource usage acceptable
- **DEPENDENCY** - No critical vulnerabilities

### 🎯 Verification Levels

1. **Level 1: Summary (Default)**
   - Quick pass/fail assessment
   - High-level confidence score
   - Critical issues only

2. **Level 2: Issues Focus**
   - Detailed problem analysis
   - Warnings and recommendations
   - Partial results accepted

3. **Level 3: Comprehensive**
   - Full requirements traceability
   - Complete sub-agent reports
   - Detailed confidence scoring

## Conflict Resolution

When sub-agents disagree:
- Security issues ALWAYS block completion
- Database failures block except for security
- Testing + warnings may allow conditional pass
- Consensus required from core agents (Security, Database, Testing)

## Output Format

```
🔍 PLAN SUPERVISOR VERIFICATION
═══════════════════════════════

📊 Overall Status: [PASS/FAIL/CONDITIONAL]
🎯 Confidence: XX%

✅ Requirements Met: X/Y
⚠️  Requirements Pending: [list]

📋 Sub-Agent Reports:
• SECURITY: [status] (confidence%)
• TESTING: [status] (confidence%)
• DATABASE: [status] (confidence%)
[... other agents ...]

🚨 Critical Issues: [if any]
⚠️  Warnings: [if any]
💡 Recommendations: [if any]

🎯 Final Verdict: [PASS/FAIL/ESCALATE]
└─ Reason: [explanation]

Next Steps: [what happens next]
```

## Verification Rules

1. **Maximum 3 iterations** - Prevents infinite loops
2. **5-second timeout per agent** - Ensures timely response
3. **Fallback strategies** - Continue with partial results
4. **Escalate to LEAD** - When consensus cannot be reached

## Context Awareness

Consider:
- Current PRD/SD being verified
- Previous verification attempts
- Testing phase completion status
- Active issues or blockers

## Important Notes

- PLAN queries existing results (doesn't re-run tests)
- Read-only verification (no changes made)
- Results stored for audit trail
- Blocks LEAD_APPROVAL if requirements unmet