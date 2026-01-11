# Command Ecosystem Reference

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-11
- **Tags**: commands, workflow, ecosystem, slash-commands

## Purpose
Defines how slash commands intelligently reference each other based on workflow context.

## Overview

The LEO Protocol commands form an interconnected ecosystem where each command suggests relevant next commands based on context. This reduces cognitive load and ensures proper workflow progression.

## Command Flow Diagram

```
                    ┌─────────────────────────────────────────────────┐
                    │                LEO PROTOCOL                      │
                    │    LEAD → PLAN → EXEC → PLAN → LEAD-FINAL       │
                    └─────────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────────┐
                    │           SD COMPLETION (LEAD-FINAL)            │
                    └─────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌───────────┐         ┌───────────┐         ┌───────────┐
            │  /restart │◄───────►│   /ship   │◄───────►│ /document │
            │ (UI work) │         │  (always) │         │ (feature) │
            └───────────┘         └───────────┘         └───────────┘
                    │                     │                     │
                    │                     ▼                     │
                    │             ┌───────────┐                 │
                    └────────────►│  /learn   │◄────────────────┘
                                  │  (always) │
                                  └───────────┘
                                          │
                                          ▼
                                  ┌───────────┐
                                  │ /leo next │
                                  │(new work) │
                                  └───────────┘
```

## Command Ecosystem Map

### Primary Flow: SD Completion

| Step | After | Condition | Suggest | Why |
|------|-------|-----------|---------|-----|
| 1 | LEAD-FINAL-APPROVAL | UI/feature SD | `/restart` | Clean environment for visual review |
| 2 | `/restart` | SD completed | Visual review → `/ship` | Verify before committing |
| 3 | `/ship` (merge) | Always | `/learn` | Capture learnings while fresh |
| 4 | `/ship` (merge) | Feature/API SD | `/document` | Update documentation |
| 5 | `/ship` (merge) | More SDs queued | `/leo next` | Continue work |

### Secondary Flows

#### Triangulation → Fix Flow
| After | Condition | Suggest |
|-------|-----------|---------|
| `/triangulation-protocol` | Bug confirmed, <50 LOC | `/quick-fix` |
| `/triangulation-protocol` | Bug confirmed, >50 LOC | Create SD |
| `/quick-fix` | Complete | Auto-merge handles shipping |

#### Learn → Execute Flow
| After | Condition | Suggest |
|-------|-----------|---------|
| `/learn` | SD created | `/leo next` |
| `/learn` | Quick-fix created | `/quick-fix` |

#### Documentation Flow
| After | Condition | Suggest |
|-------|-----------|---------|
| `/document` | Uncommitted changes | `/ship` |
| `/document` | All committed | `/leo next` |

## Command Responsibilities

### `/leo` - Protocol Orchestrator
- **Primary**: Run LEO protocol workflow, manage SD queue
- **Suggests**: Full post-completion sequence based on SD type
- **Receives from**: `/learn` (after SD created), `/ship` (after merge)

### `/restart` - Environment Reset
- **Primary**: Restart all LEO stack servers
- **Suggests**: Visual review → `/ship` (if SD completed)
- **Receives from**: `/leo` (after LEAD-FINAL for UI work)

### `/ship` - Code Shipping
- **Primary**: Commit, create PR, merge
- **Suggests**: `/learn`, `/document`, `/leo next` (contextual)
- **Receives from**: `/restart` (after visual review)

### `/learn` - Self-Improvement
- **Primary**: Identify patterns, create improvement SDs
- **Suggests**: `/leo next` (after SD created)
- **Receives from**: `/ship` (after merge)

### `/document` - Documentation Update
- **Primary**: Update docs based on conversation context
- **Suggests**: `/ship` (if uncommitted changes)
- **Receives from**: `/ship` (for feature/API SDs)

### `/quick-fix` - Small Bug Fixes
- **Primary**: Handle small fixes (<50 LOC) with auto-merge
- **Suggests**: `/learn` (if pattern revealed)
- **Receives from**: `/triangulation-protocol` (after bug confirmed)

### `/triangulation-protocol` - Ground Truth Analysis
- **Primary**: Multi-AI verification of implementation claims
- **Suggests**: `/quick-fix` (small bugs), SD creation (large issues)
- **Receives from**: Manual invocation when verification needed

## SD Type-Specific Flows

### Feature/UI SD Completion
```
LEAD-FINAL-APPROVAL
       │
       ▼
   /restart ─── "Clean environment for visual review"
       │
       ▼
Visual Review ─── "Verify UI renders correctly"
       │
       ▼
    /ship ─── "Commit and create PR"
       │
       ▼
  /document ─── "Update feature documentation"
       │
       ▼
   /learn ─── "Capture session learnings"
       │
       ▼
 /leo next ─── "Continue with next SD"
```

### Infrastructure/Database SD Completion
```
LEAD-FINAL-APPROVAL
       │
       ▼
    /ship ─── "Commit and create PR"
       │
       ▼
   /learn ─── "Capture session learnings"
       │
       ▼
 /leo next ─── "Continue with next SD"
```

### Bug Investigation Flow
```
Issue Reported
       │
       ▼
/triangulation-protocol ─── "Verify bug exists"
       │
       ├── Small bug (<50 LOC)
       │         │
       │         ▼
       │    /quick-fix ─── "Auto-merge when CI passes"
       │
       └── Large bug (>50 LOC)
                 │
                 ▼
           Create SD ─── "Full LEO Protocol"
```

## Implementation Notes

Each command file (`.claude/commands/*.md`) includes a "Command Ecosystem Integration" section that:

1. **Documents connections** - What commands it suggests and when
2. **Provides templates** - AskUserQuestion JSON for interactive suggestions
3. **Lists conditions** - When each suggestion applies
4. **Specifies auto-invoke** - Selected commands execute immediately

## Suggestion UX Pattern

All command suggestions use `AskUserQuestion` with auto-invoke behavior:

### Standard Pattern

```javascript
// After completing a command action
{
  "question": "Action complete. What would you like to do next?",
  "header": "Next Step",
  "multiSelect": false,
  "options": [
    {"label": "/command-name", "description": "Brief description of what it does"},
    {"label": "Done for now", "description": "End session, no further action"}
  ]
}
```

### Auto-Invoke Behavior

When user selects a command option (e.g., "/learn"), the system immediately invokes that skill using the Skill tool. This provides:
- **One-click workflow** - No need to type commands
- **Contextual continuity** - Session state preserved
- **Reduced friction** - Faster task completion

### "Done for now" Option

Every suggestion set includes a "Done for now" option allowing users to:
- End the current workflow
- Address remaining work later
- Exit without further action

## Best Practices

1. **Interactive suggestions** - Use AskUserQuestion, not plain text
2. **Auto-invoke on selection** - Don't just acknowledge, execute the command
3. **Context-aware options** - Filter options based on SD type, session state
4. **Always include exit** - "Done for now" option in every suggestion
5. **Not circular** - Commands don't suggest themselves
6. **Progressive** - Flow moves forward (completion → shipping → learning → new work)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-11 | Added AskUserQuestion pattern with auto-invoke behavior |
| 1.0.0 | 2026-01-11 | Initial command ecosystem implementation |
