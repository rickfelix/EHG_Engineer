# LEO Protocol Lesson Learned: Sub-Agent Engagement Gap

**Date**: 2025-10-23
**Session**: SD-VWC-PRESETS-001 (EXEC Phase)
**Severity**: HIGH
**Category**: Protocol Execution Pattern

## Problem Statement

During EXEC phase implementation, Claude failed to proactively delegate testing tasks to the specialized testing-agent, despite:
1. Clear tool descriptions stating "MUST BE USED PROACTIVELY for all testing and QA tasks"
2. Testing being a distinct, bounded task that should trigger sub-agent delegation
3. User having to manually remind Claude to use the testing sub-agent

This represents a **systemic gap in LEO Protocol execution** where sub-agents are underutilized even when explicitly designed for proactive invocation.

## Concrete Example from Session

### What Happened
```
Claude: "Now let me create the E2E tests for preset workflows using Playwright:"
[Proceeds to write test file directly]

User: "When it comes to testing, you should use the testing subagent."
```

### What Should Have Happened
```
Claude: "Now I need to create E2E tests. This is a testing task, so I'll delegate to testing-agent."
[Uses Task tool with subagent_type: "testing-agent"]
```

### Context
- **Task**: Write unit tests + E2E tests for preset functionality
- **Phase**: EXEC Implementation (SD-VWC-PRESETS-001)
- **Trigger Keywords Present**: "test", "testing", "E2E", "Playwright"
- **Sub-agent Available**: testing-agent with description "MUST BE USED PROACTIVELY for all testing and QA tasks"
- **What Claude Did**: Wrote unit test file manually (378 LOC)
- **Why This Failed**: Claude was in "implementation flow" and didn't pause to check for specialized agents

## Root Cause Analysis

### 1. Insufficient Checkpoint Reminders in EXEC Phase
The EXEC phase workflow lacks explicit "stop and check for sub-agents" checkpoints before major task categories:
- Testing tasks
- Database migrations
- UI/UX design validation
- Security reviews
- Performance optimization

### 2. User Prompting Could Be More Explicit
Looking at the session start prompt ("LONG CONTINUE LEO PROTOCOL EXECUTION"), the sub-agent guidance was:
- Present in tool descriptions
- But NOT explicitly called out in the EXEC phase checklist
- User could add: **"Before starting any major task category (testing, database, UI, security), check if a specialized sub-agent exists and delegate to it"**

### 3. Tool Description Visibility
The Task tool description lists available agents, but Claude may not reference it proactively during execution flow. The "MUST BE USED PROACTIVELY" language is there but not enforced by workflow structure.

## Proposed Mitigations

### Mitigation 1: Enhanced User Prompting (IMMEDIATE)
Add to EXEC phase instructions:

```markdown
## 🤖 Sub-Agent Delegation Checkpoints (MANDATORY)

Before starting ANY of these task types, STOP and delegate to specialized sub-agent:

| Task Type | Trigger Keywords | Delegate To | Example |
|-----------|------------------|-------------|---------|
| Testing | "write tests", "E2E", "unit test", "QA" | testing-agent | "I need to write E2E tests" → Use Task tool with testing-agent |
| Database | "migration", "schema", "RLS", "SQL" | database-agent | "I need to create a migration" → Use Task tool with database-agent |
| UI/Design | "component", "design", "a11y", "UX" | design-agent | "I need to validate component sizing" → Use Task tool with design-agent |
| Security | "auth", "RLS", "permissions", "security" | security-agent | "I need to add RLS policies" → Use Task tool with security-agent |
| Documentation | "docs", "README", "guide" | docmon-agent | "I need to document this API" → Use Task tool with docmon-agent |

**RED FLAG**: If you find yourself writing test files, migration files, or extensive UI components directly, STOP and delegate to the appropriate sub-agent instead.
```

### Mitigation 2: EXEC Phase Checklist Enhancement (SHORT-TERM)
Update CLAUDE_EXEC.md to include:

**Step 2.5: Sub-Agent Delegation Check**
Before writing any code, ask:
- Is this a testing task? → testing-agent
- Is this a database task? → database-agent
- Is this a UI/design task? → design-agent
- Is this a security task? → security-agent

### Mitigation 3: Protocol-Level Enforcement (MEDIUM-TERM)
Add to LEO Protocol v4.3.0:
- Mandatory sub-agent delegation for testing (dual requirement)
- Database migrations MUST use database-agent (already enforced, but formalize)
- Pre-commit hooks that detect direct test file creation without sub-agent evidence

### Mitigation 4: Handoff Documentation (IMMEDIATE)
Update PLAN→EXEC handoffs to explicitly call out:
```json
{
  "testing_strategy": {
    "unit_tests": "Delegate to testing-agent",
    "e2e_tests": "Delegate to testing-agent",
    "delegation_required": true
  }
}
```

## Success Metrics

This mitigation is successful when:
1. **Zero manual reminders** needed for sub-agent delegation in next 5 SDs
2. **100% testing tasks** delegated to testing-agent (tracked in handoffs)
3. **EXEC→PLAN handoffs** show evidence of sub-agent usage (task_id references)

## Related Patterns

- `validation-enforcement.md`: Similar proactive invocation patterns for validation-agent
- `database-agent-patterns.md`: Database-agent has better adoption due to explicit error-triggered + proactive patterns
- `qa-director-guide.md`: QA processes should be delegated, not executed inline

## Action Items

1. **IMMEDIATE**: User to update EXEC phase prompt template with Sub-Agent Delegation Checkpoints table
2. **IMMEDIATE**: Add this lesson to CLAUDE_EXEC.md under "Common Mistakes to Avoid"
3. **SHORT-TERM**: Update PLAN→EXEC handoff schema to include `delegation_required: boolean` flag for testing tasks
4. **MEDIUM-TERM**: Create LEO Protocol v4.3.0 with formalized sub-agent delegation enforcement

## Example of Correct Pattern (For Future Reference)

```typescript
// ❌ WRONG: Writing tests directly
"Now let me create the E2E tests for preset workflows using Playwright:"
[Writes test file]

// ✅ CORRECT: Delegating to testing-agent
"Now I need to create E2E tests for preset workflows. This is a testing task,
so I'll delegate to the testing-agent who has specialized testing expertise."

Task({
  subagent_type: "testing-agent",
  description: "Create E2E tests for preset workflows",
  prompt: `Create comprehensive E2E tests for SD-VWC-PRESETS-001 preset workflows:

  User Stories to Test:
  - US-002: PresetSelector dropdown and form auto-fill
  - US-003: CreatePresetDialog save workflow
  - US-004: ManagePresetsDialog edit/delete workflows

  Requirements:
  - Use Playwright with existing test infrastructure
  - Test full user workflows including local storage persistence
  - Cover edge cases: empty state, validation errors, quota exceeded

  Evidence Required:
  - All tests passing
  - Coverage report showing critical paths covered`
})
```

## Appendix: Session Evidence

**Session Start**: User provided comprehensive LEO Protocol v4.2.0 instructions
**Phase**: EXEC Implementation for SD-VWC-PRESETS-001
**Todo List State When Issue Occurred**:
```json
[
  {"content": "Integrate PresetSelector into VentureCreationPage", "status": "completed"},
  {"content": "Write unit tests for presetService", "status": "in_progress"},  // ← Should have delegated here
  {"content": "Write E2E tests for preset workflows", "status": "pending"}
]
```

**User Intervention**: "When it comes to testing, you should use the testing subagent."

**Claude's Response**: Acknowledged and prepared to delegate, but had already created 378 LOC unit test file manually.

---

**Captured By**: Claude (SD-VWC-PRESETS-001 EXEC session)
**Reviewed By**: [Pending user review]
**Status**: Lesson documented, awaiting mitigation implementation
