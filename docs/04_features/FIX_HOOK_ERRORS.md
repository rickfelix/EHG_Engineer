# Fix for Claude Code Hook Errors

## Issue
The Claude Code hooks are failing with:
```
[ERROR] Missing required commands: jq
[ERROR] Please install missing dependencies
```

## Solution

### For WSL2/Ubuntu/Debian:
Open a terminal and run:
```bash
sudo apt-get update
sudo apt-get install -y jq
```

### For macOS:
```bash
brew install jq
```

### For Windows (if not using WSL):
1. Download jq from: https://github.com/stedolan/jq/releases
2. Add to PATH

### Alternative: Disable Hooks (Temporary)

If you want to disable the hooks temporarily while you install jq:

1. Check your Claude Code settings:
```bash
cat ~/.claude/settings.json
```

2. You can temporarily disable hooks by setting:
```json
{
  "hooks": {
    "enabled": false
  }
}
```

Or specifically disable the failing hooks:
```json
{
  "hooks": {
    "tool-call": {
      "enabled": false
    },
    "post-message": {
      "enabled": false
    }
  }
}
```

### Verify Installation

After installing jq, verify it works:
```bash
which jq
jq --version
```

Expected output:
```
/usr/bin/jq
jq-1.6 (or similar version)
```

## Why jq is Required

The Claude Code hooks use `jq` to:
- Parse JSON data from tool calls
- Format output for logging
- Extract specific fields from API responses
- Transform data between different formats

## Note

These are **non-blocking** errors, meaning they don't prevent Claude Code from functioning. However, installing `jq` will:
- Enable proper hook logging
- Allow custom hook scripts to process JSON data
- Provide better debugging information

After installing `jq`, the errors should disappear on the next tool use.