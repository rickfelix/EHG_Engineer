---
description: "/claim - SD Claim Management Command"
---

# /claim - SD Claim Management

**Command:** /claim $ARGUMENTS

Manage SD claims across Claude Code sessions. List active sessions, release stale claims, and check claim status.

## Subcommands

### /claim list (default)
Show all active sessions with their claim status, heartbeat age, and staleness.

```bash
node -e "
import('../../lib/commands/claim-command.js').then(m => m.listClaims());
"
```

### /claim release <session-id>
Release a claim held by a specific session. Supports partial session ID matching.

```bash
node -e "
import('../../lib/commands/claim-command.js').then(m => m.releaseClaim('SESSION_ID'));
"
```

### /claim status
Show the current session's claim status.

```bash
node -e "
import('../../lib/commands/claim-command.js').then(m => m.claimStatus());
"
```

## Instructions

Parse `$ARGUMENTS` to determine the subcommand:

1. **No arguments or "list"**: Run `listClaims()`
2. **"release <session-id>"**: Run `releaseClaim(sessionId)`
3. **"status"**: Run `claimStatus()`

### Execution

Use the Bash tool to run the appropriate function:

```bash
# For /claim or /claim list
node --input-type=module -e "
import { listClaims } from './lib/commands/claim-command.js';
await listClaims();
"

# For /claim release <session-id>
node --input-type=module -e "
import { releaseClaim } from './lib/commands/claim-command.js';
await releaseClaim('<session-id>');
"

# For /claim status
node --input-type=module -e "
import { claimStatus } from './lib/commands/claim-command.js';
await claimStatus();
"
```

### Intent Detection

When the user mentions any of these phrases, suggest or invoke `/claim`:
- "claim status", "my claim", "what am I working on"
- "release claim", "release SD", "free SD", "unclaim"
- "who has", "who is working on", "active claims", "show claims"
- "claim stuck", "claim conflict", "stale claim"

### After Release

After successfully releasing a claim, suggest:
- `npm run sd:next` to refresh the SD queue
- The released SD should now be available for other sessions
