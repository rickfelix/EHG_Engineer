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

| From | To | Trigger | Mode |
|------|-----|---------|------|
| - | LEAD | User initiates SD | Manual |
| LEAD | PLAN | SD approved | **Auto-proceed** |
| PLAN | EXEC | Gate 3 passes | **Auto-proceed** |
| EXEC | Complete | PR merged | **Auto-proceed** |

### Auto-Proceed Mode (v4.3.3+)

**Default Behavior**: LEO Protocol now operates in autonomous mode by default.

**What Auto-Proceeds**:
- Phase transitions (LEAD→PLAN→EXEC)
- Post-completion sequence (`/restart` → `/ship` → `/document` → `/learn`)
- Next SD selection after completion

**Only Stops For**:
- Blocking errors requiring human decision (e.g., merge conflicts)
- Test failures after 2 retry attempts
- Critical security or data-loss scenarios

**Configuration**: Auto-proceed is defined in:
- `.claude/commands/leo.md` (skill definition)
- Database section 377 (`critical_term_definitions`)
- Database section 317 (`parent_child_overview`)

**User Override**: Users can still manually control transitions by explicitly asking questions or requesting stops.

## Auto-Generated Context Files

Each phase has an auto-generated context file:
- `/CLAUDE_LEAD.md` - LEAD phase context
- `/CLAUDE_PLAN.md` - PLAN phase context
- `/CLAUDE_EXEC.md` - EXEC phase context

---

*Back to [LEO Hub](../README.md)*
