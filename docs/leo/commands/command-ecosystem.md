# Command Ecosystem Reference

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.3.0
- **Author**: DOCMON Sub-Agent
- **Last Updated**: 2026-01-30
- **Tags**: commands, workflow, ecosystem, slash-commands, quick-fix, routing

## Table of Contents

- [Purpose](#purpose)
- [Overview](#overview)
- [Command Flow Diagram](#command-flow-diagram)
- [Command Reference](#command-reference)
- [Workflow Integration](#workflow-integration)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

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
                                          ▼
                                  ┌───────────┐
                                  │  /restart │
                                  │ (UI work) │
                                  └───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
            ┌───────────┐         ┌───────────┐         ┌───────────┐
            │   /uat    │────────►│   /ship   │◄───────►│ /document │
            │(features) │         │  (always) │         │ (feature) │
            └───────────┘         └───────────┘         └───────────┘
                    │                     │                     │
                    │                     ▼                     │
                    │             ┌───────────┐                 │
                    │             │  /learn   │◄────────────────┘
                    │             │  (always) │
                    │             └───────────┘
                    │                     │
                    ▼                     ▼
            ┌───────────┐         ┌───────────┐
            │/quick-fix │         │ /leo next │
            │(<50 LOC)  │         │(new work) │
            └───────────┘         └───────────┘
```

### /uat Position in Workflow
```
LEAD-FINAL-APPROVAL → /restart → /uat → /document → /ship → /learn → /leo next
                                   │
                                   └── defect found → /quick-fix (auto-merge)
                                                  or → Create SD (full workflow)
```

## Command Ecosystem Map

### Primary Flow: SD Completion

| Step | After | Condition | Suggest | Why |
|------|-------|-----------|---------|-----|
| 1 | LEAD-FINAL-APPROVAL | UI/feature SD | `/restart` | Clean environment for UAT |
| 2 | `/restart` | Feature/bugfix/security/refactor/enhancement | `/uat` | Human acceptance testing |
| 2a | `/restart` | Infrastructure/database/docs | `/ship` | UAT not required |
| 3 | `/uat` | GREEN or YELLOW gate | `/document` | Update documentation first |
| 3a | `/uat` | Defect found, <=50 LOC | `/quick-fix` | Auto-merge fix |
| 3b | `/uat` | Defect found, >50 LOC | Create SD | Full workflow for fix |
| 4 | `/document` | Feature/API SD | `/ship` | Docs included in PR |
| 5 | `/ship` (merge) | Always | `/learn` | Capture learnings while fresh |
| 6 | `/ship` (merge) | More SDs queued | `/leo next` | Continue work |

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
- **Intelligent Routing**: Detects QF- vs SD- prefixes and routes to appropriate workflow
  - `QF-*` prefix → Quick-fix workflow (≤50 LOC, no LEAD phase)
  - `SD-*` prefix → Strategic Directive workflow (LEAD→PLAN→EXEC)
- **Subcommands**:
  - `/leo restart` (r) - Restart LEO servers
  - `/leo next` (n) - Show SD queue
  - `/leo create` (c) - Create new SD (interactive wizard)
  - `/leo continue` (cont) - Resume current working SD
  - `/leo complete` (comp) - Run full post-completion sequence
  - `/leo init` (i) - Initialize session (set auto-proceed preference)
  - `/leo resume` (res) - Restore session from saved state (crash recovery)
- **Direct ID Access**:
  - `/leo SD-XXX-001` - Start/continue work on a Strategic Directive
  - `/leo QF-XXX-001` - Start/continue work on a Quick-Fix

### `/restart` - Environment Reset
- **Primary**: Restart all LEO stack servers
- **Suggests**: `/uat` (for feature/bugfix/security/refactor/enhancement SDs)
- **Receives from**: `/leo` (after LEAD-FINAL for UI work)

### `/uat` - Human Acceptance Testing
- **Primary**: Interactive UAT execution with Given/When/Then scenarios
- **Suggests**: `/ship` (GREEN/YELLOW gate), `/quick-fix` (defect found)
- **Receives from**: `/restart` (for UAT-requiring SD types)
- **Quality Gates**: GREEN (0 fails, >=85%), YELLOW (has fails, >=85%), RED (<85%)

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

### `/leo continue` - Resume Working SD
- **Primary**: Resume work on the current working SD (is_working_on = true)
- **Behavior**:
  - Queries database for SD with `is_working_on = true` and `progress < 100`
  - Loads phase-appropriate context file (CLAUDE_LEAD.md, CLAUDE_PLAN.md, or CLAUDE_EXEC.md)
  - Shows recommended next action based on current phase
- **Suggests**: `/leo next` (if no working SD found)
- **Receives from**: Manual invocation when resuming work

### `/leo complete` - Post-Completion Sequence
- **Primary**: Run full post-completion sequence automatically
- **Workflow**: Executes in order:
  1. `/document` - Update documentation
  2. `/ship` - Commit and create PR
  3. `/learn` - Capture learnings
  4. `npm run sd:next` - Show next work
- **Pre-condition**: Requires an active working SD
- **Suggests**: Next SD from queue (via sd:next output)
- **Receives from**: Manual invocation after SD completion

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
  /document ─── "Update feature documentation"
       │
       ▼
    /ship ─── "Commit and create PR (includes docs)"
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

## Quick-Fix Detection & Routing (v1.3.0)

As of v1.3.0, the `/leo` command intelligently detects Quick-Fix IDs (QF- prefix) and routes to the appropriate workflow.

### QF- Prefix Detection

**Pattern**: `QF-*` (e.g., `QF-CLAIM-CONFLICT-UX-001`, `QF-20260130-001`)

When `/leo QF-XXX-001` is invoked:
1. **Detect QF- prefix** - Identifies this as a Quick-Fix, not a Strategic Directive
2. **Check quick_fixes table** - Query database for existing Quick-Fix record
3. **Check git history** - If not in database, search for merged commits
4. **Route accordingly**:
   - **Found & open** → Continue with `/quick-fix` workflow
   - **Found & completed** → Display "Already completed" message
   - **Found & escalated** → Redirect to escalated SD
   - **Not found, in git** → Display "Already merged" message with commit history
   - **Not found anywhere** → Prompt to create new Quick-Fix

### QF- vs SD- Routing

| ID Pattern | Workflow | Approval Phase | PRD Required | Scope |
|-----------|----------|----------------|--------------|-------|
| `QF-*` | Quick-Fix | None | Auto-generated | ≤50 LOC |
| `SD-*` | Strategic Directive | LEAD approval | Yes (varies by type) | >50 LOC |

### Benefits

- **Reduces cognitive load** - No need to remember different commands for QF vs SD
- **Smart defaults** - Auto-routes based on ID prefix
- **Unified interface** - Single `/leo` command handles both workflows
- **Error prevention** - Can't accidentally start SD workflow for Quick-Fix

### Example Usage

```bash
# Start/continue Strategic Directive
/leo SD-FEATURE-001

# Start/continue Quick-Fix
/leo QF-CLAIM-CONFLICT-UX-001

# Both route to appropriate workflow automatically
```

## LEO Command Menu Streamlining (v1.2.0)

As of v1.2.0, the `/leo` command menu has been streamlined for clarity:

### Removed Commands
The following unused commands were removed:
- `start` / `s` - Unused (servers auto-start)
- `stop` / `x` - Unused (rarely needed)
- `status` / `st` - Unused (status visible in terminal)
- `fast` / `f` - Unused (normal restart sufficient)
- `help` / `h` - Replaced with "argument not recognized" fallback

### Streamlined Menu
```
/leo           - Run LEO protocol workflow (npm run leo)
/leo restart   (r)    - Restart all LEO servers
/leo next      (n)    - Show SD queue (what to work on)
/leo create    (c)    - Create new SD (interactive wizard)
/leo continue  (cont) - Resume current working SD
/leo complete  (comp) - Run full sequence: document → ship → learn → next
```

### Rationale
- **Focus on workflow**: Kept commands that directly support LEO Protocol workflow
- **Remove clutter**: Eliminated rarely-used server management commands
- **Add continuity**: New `continue` command for session resumption
- **Add automation**: New `complete` command for post-completion sequence

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

## Related Documentation

- [Quick-Fix Protocol](../../03_protocols_and_standards/quick-fix-protocol.md) - Complete quick-fix workflow documentation
- [LEO Protocol](../../03_protocols_and_standards/) - Strategic Directive workflow protocols
- [Ship Command Guide](../../reference/ship-command-guide.md) - Shipping and PR creation
- [UAT Command Platform](../../reference/uat-command-platform.md) - User acceptance testing

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.3.0 | 2026-01-30 | Added QF- prefix detection and intelligent routing to quick-fix workflow |
| 1.2.0 | 2026-01-23 | Added /leo continue and /leo complete subcommands |
| 1.1.0 | 2026-01-11 | Added AskUserQuestion pattern with auto-invoke behavior |
| 1.0.0 | 2026-01-11 | Initial command ecosystem implementation |
