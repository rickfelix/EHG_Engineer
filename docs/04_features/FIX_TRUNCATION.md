# Fix Output Truncation in Claude Code

## The Problem
When using LEO Protocol commands, you might see truncated output with messages like "42 lines, Ctrl+R to expand". This is a Claude Code terminal display issue, NOT a problem with LEO Protocol.

## Quick Fix (2 Steps)

### Step 1: Enable Verbose Mode Globally
Run this command once in your terminal:
```bash
claude config set -g verbose true
```

### Step 2: Use --verbose Flag
When running commands, add `--verbose`:
```bash
claude --verbose
```

## Alternative Solutions

### Solution 1: Use File Output (Recommended for LEO)
Instead of relying on terminal display, save outputs to files:
```bash
# Save any command output to a file
node scripts/leo.js help > leo_help.txt

# Or use tee to see it AND save it
node scripts/leo.js projects | tee projects_list.txt
```

### Solution 2: Terminal Setup
Run this command to optimize your terminal:
```
/terminal-setup
```

### Solution 3: Work with Files Instead of Terminal
For long outputs, always redirect to files:
```bash
# Instead of:
node scripts/leo.js status

# Use:
node scripts/leo.js status > status.txt
cat status.txt
```

## Why This Happens

1. **Claude Code Display Layer**: The truncation happens at the terminal display level, not in the actual command output
2. **Terminal Limitations**: VS Code's integrated terminal has display limits
3. **MCP Tool Responses**: Known bug where responses truncate at ~700 characters

## LEO Protocol Best Practices

When using LEO Protocol with Claude Code:

1. **For Help/Documentation**:
   ```bash
   node scripts/leo.js help | tee /tmp/leo_help.txt
   ```

2. **For Project Lists**:
   ```bash
   node scripts/leo.js projects | tee /tmp/projects.txt
   ```

3. **For Status Checks**:
   ```bash
   node scripts/leo.js status | tee /tmp/status.txt
   ```

4. **For Registration**:
   ```bash
   node scripts/leo-register-from-env.js 2>&1 | tee /tmp/registration.log
   ```

## Summary

- **Immediate Fix**: Enable verbose mode with `claude config set -g verbose true`
- **Best Practice**: Use `| tee filename.txt` to capture full outputs
- **Remember**: The truncation is a display issue, not a data issue - your commands are working correctly!

## References
- [Stack Overflow: Claude Code Output Truncation](https://stackoverflow.com/questions/79716276/)
- [GitHub Issue #2638: MCP Tool Response Truncation](https://github.com/anthropics/claude-code/issues/2638)
- [Anthropic Docs: Terminal Configuration](https://docs.anthropic.com/en/docs/claude-code/terminal-config)