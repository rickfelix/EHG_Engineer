# Claude Code Hooks Reference

**Document Type**: Technical Reference
**System**: Claude Code Hook System
**Last Updated**: 2026-01-22

## Overview

Claude Code supports lifecycle hooks that execute shell commands in response to events during a Claude session. Hooks enable custom automation, validation, and enforcement workflows.

## Hook Types

| Hook Type | Trigger | Purpose | Exit Code Handling |
|-----------|---------|---------|-------------------|
| `Stop` | Session ends | Validation before session termination | Exit 2 blocks termination |
| `PreCompact` | **Before context compaction** | Save state before auto-compaction | Non-blocking (informational) |
| `SessionStart` | Session starts or resumes | Restore context, load state | Non-blocking (informational) |
| `PreToolUse` | Before any tool use | Pre-validation, rate limiting | Exit 2 blocks tool |
| `PostToolUse` | After tool use completes | Logging, notifications | Non-blocking |
| `UserPromptSubmit` | User submits prompt | Input validation, pre-processing | Exit 2 blocks prompt |

## Configuration

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/my-hook.js",
            "timeout": 120
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo [REMINDER] Quality over speed",
            "timeout": 1
          }
        ]
      }
    ]
  }
}
```

## Hook Structure

### Basic Hook

```json
{
  "type": "command",
  "command": "node path/to/script.js",
  "timeout": 30
}
```

**Fields**:
- `type`: Always `"command"` for shell command hooks
- `command`: Shell command to execute (supports full shell syntax)
- `timeout`: Maximum execution time in seconds (default: 30)

### Matcher-Based Hook (PreToolUse, PostToolUse)

```json
{
  "matcher": "Bash|Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "node scripts/validate-tool.js",
      "timeout": 5
    }
  ]
}
```

**matcher**: Regex pattern to match tool names (e.g., `"Bash"`, `"Write|Edit"`, `".*"` for all tools)

## Exit Code Behavior

| Exit Code | Behavior | Use Case |
|-----------|----------|----------|
| `0` | Success - Continue normal operation | Validation passed |
| `1` | Error - Log warning but continue | Non-critical failure |
| `2` | **Block** - Prevent operation from completing | Validation failed, enforcement required |
| `Other` | Treated as error (like exit 1) | Unexpected failure |

### Blocking with Exit Code 2

**Stop Hook**: Prevents session from ending. Claude continues and can read hook output.

**PreToolUse Hook**: Blocks tool execution. User must resolve issue before retrying.

**UserPromptSubmit Hook**: Blocks prompt submission. User must fix input.

## Environment Variables Available to Hooks

Claude Code provides these environment variables to hook scripts:

| Variable | Content | Available In |
|----------|---------|--------------|
| `CLAUDE_TOOL_NAME` | Name of tool being used | PreToolUse, PostToolUse |
| `CLAUDE_TOOL_INPUT` | Tool input (JSON string) | PreToolUse, PostToolUse |
| `CLAUDE_PROJECT_DIR` | Project root directory | All hooks |
| `CLAUDE_SESSION_ID` | Current session ID | All hooks |

## Hook Output

### Standard Output (stdout)

Content written to stdout is:
- **Stop Hook**: Displayed to Claude (blocking JSON output)
- **PreToolUse**: Shown to user as reminder/warning
- **PostToolUse**: Logged (not shown to Claude)
- **UserPromptSubmit**: Shown to user as validation message

### Standard Error (stderr)

Content written to stderr is logged but not displayed to Claude.

### JSON Output (Stop Hook)

Stop hooks can return structured JSON for enforcement:

```json
{
  "decision": "block",
  "reason": "Validation failed: Missing required checks",
  "details": {
    "missing_items": ["test", "documentation"]
  },
  "remediation": {
    "auto_run": true,
    "command": "npm run fix-validation"
  },
  "bypass_instructions": {
    "step1": "Create bypass file with explanation",
    "step2": "Run bypass script",
    "step3": "Retry session end"
  }
}
```

## Implementation Patterns

### Pattern 1: Simple Validation

```javascript
#!/usr/bin/env node

// Validate something
const isValid = checkSomething();

if (!isValid) {
  console.error('Validation failed');
  process.exit(2); // Block
}

console.log('Validation passed');
process.exit(0); // Continue
```

### Pattern 2: Blocking with Remediation

```javascript
#!/usr/bin/env node

const issues = detectIssues();

if (issues.length > 0) {
  const output = {
    decision: 'block',
    reason: `Found ${issues.length} issue(s)`,
    details: { issues },
    remediation: {
      auto_run: true,
      command: 'npm run fix-issues'
    }
  };

  console.log(JSON.stringify(output));
  process.exit(2);
}

process.exit(0);
```

### Pattern 3: Bypass Mechanism

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const bypassFile = path.join(process.cwd(), '.hook-bypass.json');

// Check for bypass
if (fs.existsSync(bypassFile)) {
  const bypass = JSON.parse(fs.readFileSync(bypassFile, 'utf-8'));

  // Validate bypass
  if (!bypass.explanation || bypass.explanation.length < 50) {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Bypass explanation must be at least 50 characters'
    }));
    process.exit(2);
  }

  // Log bypass and allow
  console.log(`⚠️ Bypass: ${bypass.explanation}`);
  fs.unlinkSync(bypassFile); // Clean up
  process.exit(0);
}

// Normal validation
const valid = performValidation();
process.exit(valid ? 0 : 2);
```

### Pattern 4: Async Operations

```javascript
#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Query database
  const { data, error } = await supabase
    .from('validations')
    .select('status')
    .eq('session_id', process.env.CLAUDE_SESSION_ID)
    .single();

  if (error || !data || data.status !== 'passed') {
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Validation not completed in database'
    }));
    process.exit(2);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Hook error:', err.message);
  process.exit(0); // Don't block on internal errors
});
```

### Pattern 5: Caching

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), '.hook-cache.json');
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Check cache
if (fs.existsSync(CACHE_FILE)) {
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  const age = Date.now() - cache.timestamp;

  if (age < CACHE_DURATION_MS && cache.result === 'passed') {
    console.log('✅ Using cached validation result');
    process.exit(0);
  }
}

// Perform validation
const result = performExpensiveValidation();

// Update cache
fs.writeFileSync(CACHE_FILE, JSON.stringify({
  timestamp: Date.now(),
  result: result ? 'passed' : 'failed'
}));

process.exit(result ? 0 : 2);
```

## Implemented Hooks in EHG_Engineer

### Stop Hook: Sub-Agent Enforcement

**Location**: `scripts/hooks/stop-subagent-enforcement.js`
**Purpose**: Validates that required sub-agents have been executed before session end
**Exit Behavior**: Exit 2 blocks session end, returns remediation JSON
**Timeout**: 120 seconds

**Key Features**:
- Detects SD from git branch
- Validates sub-agents based on SD type/category matrix
- Checks phase window timing
- 1-hour caching for PASS verdicts
- Bypass mechanism with audit logging

**Documentation**: `docs/06_deployment/stop-hook-operations.md`

### PreToolUse Hook: Activity State Tracking

**Location**: `.claude/set-activity-state.ps1`
**Purpose**: Sets activity state to "running" when tools are used
**Matcher**: All tools (`.*`)
**Timeout**: 2 seconds

### PreToolUse Hook: Quality Reminders

**Matcher**: `Write|Edit`
**Purpose**: Displays quality reminder before file modifications
**Timeout**: 1 second

### PostToolUse Hook: Handoff Reminders

**Matcher**: `Bash` (when command contains "handoff")
**Purpose**: Reminds Claude to follow LEO protocol diligently
**Timeout**: 2 seconds

### UserPromptSubmit Hook: Session Cleanup

**Location**: `scripts/hooks/session-cleanup.js`
**Purpose**: Cleans up stale files from previous sessions on first prompt of new session
**Exit Behavior**: Exit 0 always (non-blocking, advisory only)
**Timeout**: 5 seconds

**Key Features**:
- Detects new sessions using session marker file
- Cleans up stale checkpoint counter files (>6 hours old)
- Removes old session state files
- Cleans up Claude temp task output files from previous sessions
- Prevents "background task completed" notifications for old tasks

**Problem Solved**: Background tasks write output to temp files that become unreadable in new sessions, causing "Error reading file" notifications for completed/stale work.

**Implementation Details**:
```javascript
// Session marker location
const SESSION_MARKER_FILE = path.join(os.tmpdir(), 'leo-checkpoints', `marker-${SESSION_ID}.txt`);

// Cleanup targets
- Stale checkpoint files: /tmp/leo-checkpoints/session-*.json (>6 hours)
- Old session state: ~/.claude-session-state.json (>6 hours)
- Temp task outputs: %LOCALAPPDATA%\Temp\claude\...\tasks\*.output (>6 hours)
```

**When It Runs**: First UserPromptSubmit of a new session (detected via missing/stale session marker)

### UserPromptSubmit Hook: Autonomous Checkpoint

**Location**: `scripts/hooks/autonomous-checkpoint.js`
**Purpose**: Tracks turn count and displays checkpoint warnings when threshold exceeded
**Exit Behavior**: Exit 0 always (advisory mode)
**Timeout**: 3 seconds

**Key Features**:
- Uses file-based counter to persist across hook invocations
- Displays checkpoint warning every 20 turns (configurable via `LEO_CHECKPOINT_THRESHOLD`)
- Shows session duration and active SD
- Can be disabled via `LEO_CHECKPOINT_ENABLED=false`

### UserPromptSubmit Hook: Activity State Tracking

**Location**: `.claude/set-activity-state.ps1`
**Purpose**: Sets activity state to "running" when user submits prompt
**Timeout**: 2 seconds

### PreCompact Hook: Context Preservation Snapshot

**Location**: `scripts/hooks/precompact-snapshot.ps1`
**Purpose**: Saves critical state before Claude auto-compacts context
**Exit Behavior**: Exit 0 always (informational, non-blocking)
**Timeout**: 10 seconds

**Key Features**:
- Fires automatically when Claude Code is about to compact context
- Saves git status, diff stat, staged changes, current branch
- Captures recent commits (last 5)
- Lists modified files from last hour
- Writes to `.claude/compaction-snapshot.md`
- Alerts user that compaction is imminent

**Problem Solved**: Auto-compaction can cause loss of critical context (current SD, modified files, work state). This hook preserves that state in a persistent file that survives compaction.

**Output**:
```markdown
# Pre-Compaction Snapshot
**Created**: 2026-01-24 15:30:00
**Trigger**: Auto-compaction imminent

## Git Status
[git status --porcelain output]

## Recent Changes (diff stat)
[git diff --stat output]

## Current Branch
[branch name]
```

**When It Runs**: Immediately before Claude Code performs context summarization/compaction (typically when context usage approaches limits).

**Integration**: Works with `SessionStart` hook to restore context after compaction.

### SessionStart Hook: Context Restoration Loader

**Location**: `scripts/hooks/session-start-loader.ps1`
**Purpose**: Alerts user to available state restoration files when resuming after compaction
**Exit Behavior**: Exit 0 always (informational, advisory)
**Timeout**: 5 seconds

**Key Features**:
- Fires when a new Claude Code session starts or resumes
- Checks for recent compaction snapshot (< 30 minutes old)
- Displays reminder to read state files
- Points to both `.claude/compaction-snapshot.md` and `.claude/session-state.md`
- Shows current SD queue status hint

**Problem Solved**: After auto-compaction, Claude may lose context about what was being worked on. This hook proactively reminds users (and Claude) to reload the preserved state.

**Output**:
```
🔄 CONTEXT RESTORATION AVAILABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recent compaction detected. State files:
  📁 .claude/compaction-snapshot.md (git state)
  📁 .claude/session-state.md (work state)

⚡ READ THESE FILES to restore context before continuing.
```

**When It Runs**: First prompt of a new session, or when resuming an existing session.

**Integration**: Works with `PreCompact` hook - together they form the context preservation/restoration system.

### Context Preservation System

The **PreCompact** and **SessionStart** hooks work together as a context preservation system:

**Workflow**:
1. Context usage approaches limit → **PreCompact** fires → Saves snapshot
2. Claude auto-compacts context → Critical details may be summarized/lost
3. New session starts → **SessionStart** fires → Alerts to restoration files
4. Claude reads `.claude/compaction-snapshot.md` + `.claude/session-state.md` → Context restored

**Manual State Management**:
- `.claude/session-state.md` - Manually updated via `/context-compact` skill or during handoffs
- `.claude/compaction-snapshot.md` - Auto-generated by PreCompact hook
- Both files persist across sessions and survive compaction

**CLAUDE_CORE.md Integration**: The "Compaction Instructions" section in CLAUDE_CORE.md tells Claude what to preserve during compaction and to read these restoration files immediately after compaction occurs.

## Best Practices

### 1. Fail Open on Internal Errors

Don't block Claude sessions due to hook script bugs:

```javascript
main().catch(err => {
  console.error('Hook error:', err.message);
  process.exit(0); // Allow session to continue
});
```

### 2. Set Appropriate Timeouts

- Simple checks: 1-5 seconds
- Database queries: 10-30 seconds
- Complex validation: 60-120 seconds

### 3. Provide Clear Output

Users should understand why validation failed:

```javascript
console.error(`❌ Validation failed: ${reason}`);
console.error(`   Details: ${details}`);
console.error(`   Fix: ${remedy}`);
```

### 4. Use Bypass Mechanisms

Always provide an escape hatch for emergencies:

```javascript
if (fs.existsSync('.hook-bypass')) {
  // Log bypass and allow
  process.exit(0);
}
```

### 5. Cache Expensive Operations

Don't re-validate on every hook trigger:

```javascript
const cachedResult = checkCache();
if (cachedResult && cachedResult.age < CACHE_DURATION) {
  return cachedResult.value;
}
```

### 6. Use Structured Output for Automation

JSON output enables auto-remediation:

```json
{
  "decision": "block",
  "remediation": {
    "auto_run": true,
    "command": "npm run fix"
  }
}
```

### 7. Test Hooks in Isolation

```bash
# Test hook script directly
node scripts/hooks/my-hook.js

# Test with environment variables
CLAUDE_PROJECT_DIR=$(pwd) node scripts/hooks/my-hook.js

# Test blocking behavior
node scripts/hooks/my-hook.js && echo "Allowed" || echo "Blocked (exit $?)"
```

## Troubleshooting

### Hook Not Executing

**Check**:
1. `.claude/settings.json` syntax is valid JSON
2. Hook command path is correct (use absolute paths on Windows)
3. Hook script has execute permissions (Unix)
4. Timeout is sufficient for hook to complete

**Debug**:
```bash
# Validate settings.json
cat .claude/settings.json | jq .

# Test hook manually
node path/to/hook.js
```

### Hook Times Out

**Symptoms**: Hook execution exceeds timeout, session hangs

**Solutions**:
1. Increase timeout in settings.json
2. Optimize hook script (use caching, parallel queries)
3. Remove expensive operations

### Exit Code 2 Not Blocking

**Check**:
1. Hook is configured for correct lifecycle event
2. Script explicitly calls `process.exit(2)`
3. Hook output is being read by Claude Code
4. No error in hook execution (check stderr)

### Hook Output Not Visible

**Check**:
1. Writing to stdout, not stderr (for Claude visibility)
2. Output is well-formed JSON (for Stop hooks)
3. Timeout is sufficient for script to complete

### Stale Background Task Notifications

**Symptoms**: Getting "background task completed" notifications for old tasks that no longer exist, with "Error reading file" when trying to access output.

**Example**:
```
● Background command "node scripts/handoff.js execute LEAD-TO-PLAN SD-XXX-001" completed (exit code 0)
● Read(~\AppData\Local\Temp\claude\...\tasks\abc123.output)
  ⎿  Error reading file
```

**Root Cause**: Background tasks write output to temp files. When a session ends and a new one starts:
1. Old notifications persist
2. Temp files are cleaned up or become stale
3. Attempting to read output fails

**Solution**: The `session-cleanup.js` hook automatically cleans up stale files on session start:
- Runs on first UserPromptSubmit of new session
- Removes checkpoint counter files >6 hours old
- Cleans up old session state files
- Deletes Claude temp task output files from previous sessions

**Manual Fix**:
```bash
# Clean up manually if needed
node scripts/hooks/session-cleanup.js
```

**Prevention**: Avoid using `run_in_background: true` for critical workflow commands (like handoff.js) that need their output visible. Run them in foreground instead.

## Security Considerations

### 1. Validate Bypass Inputs

Always validate bypass file contents:

```javascript
if (!bypass.explanation || bypass.explanation.length < 50) {
  // Reject insufficient explanation
  process.exit(2);
}
```

### 2. Log All Bypass Events

Audit all bypass usage:

```javascript
await supabase.from('audit_log').insert({
  event_type: 'HOOK_BYPASS',
  severity: 'warning',
  details: { reason: bypass.explanation }
});
```

### 3. Rate Limit Hook Execution

Prevent DoS from rapid hook triggers:

```javascript
const RATE_LIMIT_MS = 1000; // 1 second
const lastRun = getLastRunTime();
if (Date.now() - lastRun < RATE_LIMIT_MS) {
  process.exit(0); // Skip this execution
}
```

### 4. Sanitize Environment Variables

Don't trust environment variables for security decisions:

```javascript
// BAD: Using env var for auth
if (process.env.CLAUDE_BYPASS_HOOK === '1') {
  process.exit(0);
}

// GOOD: Using file-based bypass with validation
const bypass = validateBypassFile();
```

### 5. Limit Hook Permissions

Run hooks with minimal permissions:
- Read-only access to most files
- Write access only to specific cache/log directories
- No sudo/admin privileges

## Performance Optimization

### 1. Parallel Operations

```javascript
const [validation1, validation2] = await Promise.all([
  performValidation1(),
  performValidation2()
]);
```

### 2. Early Exit

```javascript
// Check cheapest validations first
if (!quickCheck()) {
  process.exit(2);
}

// Then expensive validations
if (!expensiveCheck()) {
  process.exit(2);
}
```

### 3. Connection Pooling

```javascript
// Reuse database connections
const supabase = createClient(url, key, {
  db: { pool: { max: 1 } }
});
```

### 4. Incremental Validation

```javascript
// Only validate changes, not entire state
const changedFiles = getGitDiff();
const validationNeeded = changedFiles.some(needsValidation);
```

## Related Documentation

- **Stop Hook Operations**: `docs/06_deployment/stop-hook-operations.md`
- **Hook Troubleshooting**: `docs/troubleshooting/FIX_HOOK_ERRORS.md`
- **Claude Code Settings**: `docs/reference/claude-code-settings.md`
- **LEO Protocol Enforcement**: `docs/03_protocols_and_standards/LEO_v4.3_subagent_enforcement.md`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2 | 2026-01-24 | Added PreCompact and SessionStart hooks for context preservation system |
| 1.1 | 2026-01-22 | Added session-cleanup hook documentation, stale background task troubleshooting |
| 1.0 | 2026-01-21 | Initial hook reference documentation |

---

**Document Status**: ✅ Active
**Review Cycle**: Monthly
**Next Review**: 2026-02-24
