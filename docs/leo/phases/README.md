# LEO Protocol Phases

Documentation for the three LEO Protocol phases.

## Phase Overview

```
LEAD → PLAN → EXEC
```

### LEAD Phase (Leadership & Direction)

**Purpose**: Strategic directive approval and scoping

Key activities:
- SD approval workflow
- Complexity assessment (1-5 scale)
- Risk evaluation
- Dependency analysis

**Entry**: User initiates SD
**Exit**: SD approved for planning

### PLAN Phase (Planning & Design)

**Purpose**: PRD generation and gate validation

Key activities:
- PRD generation via sub-agents
- Gate validation (2A, 2B, 2C, 2D)
- Architecture decisions
- Test planning

**Entry**: SD approved
**Exit**: All gates pass (85%+ threshold)

### EXEC Phase (Execution & Delivery)

**Purpose**: Implementation with quality enforcement

Key activities:
- Code implementation
- Testing
- PR creation and review
- Quality validation

**Entry**: Gates passed
**Exit**: PR merged, SD completed

## Phase Transitions

| From | To | Trigger |
|------|-----|---------|
| - | LEAD | User initiates SD |
| LEAD | PLAN | SD approved |
| PLAN | EXEC | Gate 3 passes |
| EXEC | Complete | PR merged |

## Auto-Generated Context Files

Each phase has an auto-generated context file:
- `/CLAUDE_LEAD.md` - LEAD phase context
- `/CLAUDE_PLAN.md` - PLAN phase context
- `/CLAUDE_EXEC.md` - EXEC phase context

---

*Back to [LEO Hub](../README.md)*
