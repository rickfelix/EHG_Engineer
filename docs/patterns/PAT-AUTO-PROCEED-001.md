# PAT-AUTO-PROCEED-001: Background Task Enforcement Gap

## Metadata
- **Category**: Pattern
- **Status**: Resolved
- **Version**: 1.0.0
- **Author**: RCA Agent + DOCMON
- **Last Updated**: 2026-02-01
- **Tags**: auto-proceed, background-tasks, enforcement, prevention

## Pattern Classification
- **Type**: Anti-pattern (resolved)
- **Severity**: Medium
- **Frequency**: Infrequent (edge case)
- **Impact**: Workflow interruption during AUTO-PROCEED

## Problem Statement

### Symptom
Background tasks spawned during AUTO-PROCEED sessions complete asynchronously (often hours later) and interrupt current work with stale "task completed" notifications.

### Example Incident
- **When**: SD-LEO-SELF-IMPROVE-001M completion (2026-02-01)
- **What**: Task `bd89e05` completed notification appeared after SD was already done
- **Time Lag**: Task completed 8 hours 43 minutes AFTER documentation rule was added to CLAUDE.md
- **Source**: Task was spawned in earlier session or before context compaction

### Root Cause
**Documentation-only enforcement failed:**
- CLAUDE.md stated `run_in_background: true` is "FORBIDDEN" during AUTO-PROCEED
- No code-level validation existed to actually block this parameter
- Claude could still invoke `run_in_background: true` on Task and Bash tools
- Handoff system had no tool invocation validator

**Why Background Tasks Are Problematic:**
- **Real-time (default)**: Tool blocks until complete → Result returned → Workflow continues smoothly ✅
- **Background mode**: Tool returns immediately → Task runs async → Completes hours later → Notification interrupts new work ❌

**Why It Wasn't a Problem Before AUTO-PROCEED:**
| Before AUTO-PROCEED | With AUTO-PROCEED |
|---------------------|-------------------|
| Sessions had natural pauses (user typing) | Continuous execution |
| Background task completes during pause → harmless | Background task completes mid-workflow → interruption |
| Sessions were shorter | Sessions run for hours |
| Context compaction rare | Context compaction common |
| User sees notification, says "ok" → resume | Notification in fresh context that forgot spawning it |

## Solution

### Primary: Environment Variable Prevention
Use Claude Code's built-in `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` environment variable (v2.1.4+):

```bash
# Add to .env file
CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

**What This Disables:**
- `run_in_background: true` parameter on Bash and Task tools
- Auto-backgrounding behavior
- Ctrl+B keyboard shortcut

**Benefits:**
- Platform-level enforcement (maintained by Claude Code team)
- Simple configuration (one environment variable)
- No custom code to maintain
- Takes effect at process startup

### Secondary: Reactive Cleanup
Existing cleanup scripts handle edge cases:

**Session Cleanup Hook** (`scripts/hooks/session-cleanup.js`):
- Runs at session start (UserPromptSubmit hook)
- Cleans stale task files >6 hours old
- Prevents notifications from previous sessions

**Manual Cleanup Script** (`scripts/cleanup-orphaned-tasks.js`):
```bash
node scripts/cleanup-orphaned-tasks.js --execute
```

## Detection

### How to Identify This Pattern
1. "Task completed" notification appears unexpectedly
2. Task ID is unfamiliar or from hours ago
3. Notification interrupts unrelated work
4. Occurs during or after AUTO-PROCEED session

### Monitoring
No specific monitoring needed - prevention at environment level eliminates the issue.

## Prevention

### For New Projects
Add to `.env` from the start:
```bash
CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

### For Existing Projects
1. Add environment variable to `.env`
2. Restart Claude Code session (env vars load at startup)
3. Run cleanup script to remove existing orphaned tasks

## Related Patterns
- PAT-AUTOPROCEED-EMPTY-ARRAY - Empty metrics during AUTO-PROCEED
- Session continuity patterns (unified-session-state.json)

## Historical Context

### Failed Approaches
1. **Documentation-only** - CLAUDE.md rule was ignored
2. **Custom validator considered** - Would require PreToolUse hook with tool parameter inspection

### Why Environment Variable Won
- Already implemented by Claude Code team
- Zero maintenance burden
- Platform-native solution
- Simple to enable/disable

## References
- Discovery: `docs/discovery/auto-proceed-enhancement-discovery.md` (Decision D30)
- Issue encountered: SD-LEO-SELF-IMPROVE-001M
- Claude Code docs: https://claudelog.com/faqs/what-is-disable-background-tasks-in-claude-code/
- Announcement: Claude Code v2.1.4 release notes

## Tags
`#auto-proceed` `#background-tasks` `#claude-code` `#environment-variable` `#prevention`

---

**Pattern Status**: RESOLVED via environment variable enforcement (2026-02-01)
