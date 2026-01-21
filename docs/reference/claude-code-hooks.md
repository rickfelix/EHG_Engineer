# Claude Code Hooks Reference

**Document Type**: Technical Reference
**System**: Claude Code Hook System
**Last Updated**: 2026-01-21

## Overview

Claude Code supports lifecycle hooks that execute shell commands in response to events during a Claude session. Hooks enable custom automation, validation, and enforcement workflows.

## Hook Types

| Hook Type | Trigger | Purpose | Exit Code Handling |
|-----------|---------|---------|-------------------|
| `Stop` | Session ends | Validation before session termination | Exit 2 blocks termination |
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

### UserPromptSubmit Hook: Activity State Tracking

**Location**: `.claude/set-activity-state.ps1`
**Purpose**: Sets activity state to "running" when user submits prompt
**Timeout**: 2 seconds

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
| 1.0 | 2026-01-21 | Initial hook reference documentation |

---

**Document Status**: ✅ Active
**Review Cycle**: Quarterly
**Next Review**: 2026-04-21
