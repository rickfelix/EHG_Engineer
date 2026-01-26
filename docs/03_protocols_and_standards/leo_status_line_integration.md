# LEO Protocol Status Line Integration

## Overview

The LEO Protocol Status Line provides real-time context awareness in the Claude interface, displaying current agent role, Strategic Directive, task, and other relevant information without impacting performance.

## Performance Characteristics

- **Update Speed**: < 200ms for all operations
- **Cache Strategy**: 5-second cache to prevent excessive updates
- **Storage**: Minimal JSON file (~200 bytes)
- **CPU Impact**: Negligible (Node.js process terminates immediately)
- **Memory**: No persistent processes unless in watch mode

## Status Line Formats

### Default
```
🏗️ EHG_Engineer | LEO v3.1.5.9
```

### LEAD Agent
```
👑 LEAD Agent | SD-001 | requirements
```

### PLAN Agent
```
📋 PLAN Agent | SD-001 | Task: EES-001 | Verification: 5 tests
```

### EXEC Agent
```
⚙️ EXEC Agent | SD-001 | EES-001 | implementing
```

### Handoff (temporary, 10 seconds)
```
🤝 Handoff: PLAN → EXEC | Task decomposition
```

### Vision QA Active
```
👁️ Vision QA | APP-001 | Test checkout flow
```

### AUTO-PROCEED Mode (SD-LEO-ENH-AUTO-PROCEED-001-13)
```
🤖 AUTO-PROCEED: ON | EXEC | 30% | SD-XXX-001
```

Display format when AUTO-PROCEED mode is active and SD work begins:
- **Status**: ON/OFF (from `claude_sessions.metadata.auto_proceed`)
- **Phase**: Current LEO phase (LEAD/PLAN/EXEC)
- **Progress**: SD completion percentage (0-100%)
- **SD Key**: Optional SD identifier

**When displayed**: Automatically shown when handoff execution begins and AUTO-PROCEED mode is active.

**Implementation**: SD-LEO-ENH-AUTO-PROCEED-001-13 (2026-01-26)

## Quick Usage

### For Agents

```bash
# Set your role when starting work
leo-status exec                    # or lead, plan

# Update when working on SD/Task
leo-status sd SD-001 planning
leo-status task EES-001 implementing

# During handoffs
leo-status handoff LEAD PLAN "Strategic Directive SD-001"

# During Vision QA
leo-status vq APP-001 "Testing user registration"

# Update for AUTO-PROCEED mode
leo-status autoproceed on EXEC 30 SD-XXX-001

# Show current status
leo-status show
```

### Auto-Detection

The status line can auto-detect context from:
- Git branch names (SD-XXX, EES-XXX patterns)
- Recent file modifications
- Vision QA sessions
- Active handoff documents

```bash
# Auto-detect and update
leo-status refresh

# Watch mode (updates every 5 seconds)
leo-status watch
```

## Integration Points

### 1. In LEO Protocol Workflows

**LEAD Agent:**
```bash
# Start of session
leo-status lead
leo-status sd SD-001 discovery

# After creating PRD
leo-status sd SD-001 requirements

# Handoff to PLAN
leo-status handoff LEAD PLAN "SD-001 + PRD"
```

**PLAN Agent:**
```bash
# Receive handoff
leo-status plan
leo-status sd SD-001 decomposition

# Working on tasks
leo-status task EES-001

# Handoff to EXEC
leo-status handoff PLAN EXEC "Task EES-001"
```

**EXEC Agent:**
```bash
# Receive handoff
leo-status exec
leo-status task EES-001 implementing

# During Vision QA
leo-status vq APP-001 "UI validation"

# Task completion
leo-status task EES-001 completed
```

### 2. In CI/CD Pipeline

```bash
# In scripts or GitHub Actions
node scripts/leo-status-line.js task "$TASK_ID" "ci-running"

# After successful deployment
node scripts/leo-status-line.js task "$TASK_ID" "deployed"
```

### 3. In Vision QA Tests

```javascript
// In vision-qa-agent.js
const LEOStatusLine = require('./leo-status-line');
const statusLine = new LEOStatusLine();

// Update when starting Vision QA
statusLine.updateForVisionQA(appId, testGoal);

// Update for AUTO-PROCEED mode
statusLine.updateForAutoProceed({
  isActive: true,
  sdKey: 'SD-XXX-001',
  phase: 'EXEC',
  progress: 30
});

// Clear when done
statusLine.refresh();
```

### 4. In Git Hooks (Optional)

```bash
# .git/hooks/post-checkout
#!/bin/bash
# Auto-update status line on branch switch
./scripts/leo-status.sh refresh
```

## Configuration

### Status Cache File

The status is cached in `.leo-status.json`:
```json
{
  "project": "EHG_Engineer",
  "leoVersion": "3.1.5.9",
  "activeRole": "EXEC",
  "currentSD": "SD-001",
  "currentTask": "EES-001",
  "phase": "implementation",
  "taskStatus": "in-progress"
}
```

### Claude Config Integration

The status line is also written to `.claude-code-config.json`:
```json
{
  "statusLine": "⚙️ EXEC Agent | SD-001 | EES-001 | in-progress"
}
```

## Best Practices

### 1. Update Frequency
- Update when changing roles or contexts
- Don't update on every file save
- Use cache (5-second default) to prevent spam

### 2. Information Density
- Keep status line under 60 characters
- Show only most relevant context
- Use emoji for quick visual recognition

### 3. Role-Specific Information

**LEAD**: SD + Phase
```
👑 LEAD | SD-001 | requirements
```

**PLAN**: SD + Task + Verification Status
```
📋 PLAN | SD-001 | EES-001 | ✓ 5 tests
```

**EXEC**: SD + Task + Implementation Status
```
⚙️ EXEC | SD-001 | EES-001 | 75% complete
```

### 4. Handoff Protocol
- Always update on handoffs
- Include artifact being handed off
- Auto-clear after 10 seconds

## Advanced Features

### Watch Mode

```bash
# Default 5-second interval
leo-status watch

# Custom interval (milliseconds)
leo-status watch 3000
```

### Programmatic Usage

```javascript
const LEOStatusLine = require('./scripts/leo-status-line');
const status = new LEOStatusLine();

// Update for role
status.updateForRole('EXEC', {
  currentSD: 'SD-001',
  currentTask: 'EES-001'
});

// Update for handoff
status.updateForHandoff('PLAN', 'EXEC', 'Task decomposition');

// Auto-detect context
await status.refresh();

// Get current formatted status
const line = status.formatStatusLine();
```

## Performance Optimization

### Why It's Fast

1. **No Persistent Process**: Each update runs and exits
2. **Minimal File I/O**: Single small JSON file
3. **Smart Caching**: 5-second cache prevents redundant updates
4. **Async Operations**: Non-blocking context detection
5. **Lightweight**: Pure Node.js, no heavy dependencies

### Benchmark Results

| Operation | Time | Impact |
|-----------|------|--------|
| Role Update | ~90ms | Negligible |
| SD Update | ~90ms | Negligible |
| Task Update | ~100ms | Negligible |
| Auto-Refresh | ~150ms | Negligible |
| Handoff | ~100ms (+10s wait) | Negligible |

### Memory Usage

- No persistent memory usage
- Each update: ~30MB Node.js process (exits immediately)
- Watch mode: ~35MB constant

## Troubleshooting

### Status Not Updating

```bash
# Check current status
leo-status show

# Force refresh
leo-status refresh

# Clear and reset
leo-status clear
```

### Performance Issues

```bash
# Check cache timeout
cat .leo-status.json | grep cacheTimeout

# Increase cache timeout if needed
# Edit scripts/leo-status-line.js line 15:
# this.cacheTimeout = 10000; // 10 seconds
```

### Git Branch Detection Not Working

```bash
# Ensure you're in a git repository
git status

# Check branch name format
git branch --show-current
# Should include SD-XXX or EES-XXX for auto-detection
```

## Future Enhancements

Potential improvements:
- WebSocket integration for real-time updates
- Database status integration
- Test result indicators
- Build status indicators
- Performance metrics display
- Team member presence indicators

## Summary

The LEO Protocol Status Line provides lightweight, performant context awareness that helps maintain clarity during multi-agent workflows. With sub-200ms updates and intelligent caching, it adds valuable context without any noticeable performance impact.