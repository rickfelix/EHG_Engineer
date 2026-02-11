# Handoff Out - Prepare for Account Switch

Capture full session context, sync memory, and push a clean handoff state so another Claude Code account can seamlessly continue.

**User notes**: $ARGUMENTS

## Instructions

Execute ALL steps below in order. This is a fully automated sequence - do not ask for confirmation between steps.

### Step 1: Capture Git State

Run these in parallel:

```bash
git status
```

```bash
git log --oneline -10
```

```bash
git branch --show-current
```

Record the branch name, any uncommitted changes, and recent commit history.

### Step 2: Commit Uncommitted Changes

If there are ANY uncommitted changes (staged or unstaged):

1. Stage all changes: `git add .`
2. Commit with message:
   ```
   wip: handoff checkpoint - <brief description of current work>

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
3. If on a feature branch, push: `git push`

If already clean, skip to Step 3.

### Step 3: Query Active Session State

Query the database for the active SD and session context:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get active session
  const { data: session } = await sb.from('claude_sessions')
    .select('id, sd_id, metadata, status, current_phase')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .single();

  // Get active SD
  let sd = null;
  if (session?.sd_id) {
    const { data } = await sb.from('strategic_directives_v2')
      .select('sd_key, title, sd_type, status, current_phase')
      .eq('id', session.sd_id)
      .single();
    sd = data;
  }

  // Get is_working_on SD
  const { data: workingOn } = await sb.from('strategic_directives_v2')
    .select('sd_key, title, sd_type, status, current_phase')
    .eq('is_working_on', true)
    .limit(1)
    .single();

  console.log(JSON.stringify({
    session: session ? { id: session.id, sd_id: session.sd_id, phase: session.current_phase, metadata: session.metadata } : null,
    active_sd: sd || workingOn || null
  }, null, 2));
})();
"
```

### Step 4: Copy Auto-Memory to Shared Location

Copy the auto-memory MEMORY.md to the git-tracked shared location for cross-machine sync.

Read the current auto-memory file from the user's Claude memory directory. The path follows the pattern:
`~/.claude/projects/<project-slug>/memory/MEMORY.md`

For this project on Windows: `C:\Users\rickf\.claude\projects\C--Users-rickf-Projects--EHG-EHG-Engineer\memory\MEMORY.md`

Create the shared-memory directory if it doesn't exist, then copy MEMORY.md there:

```bash
cmd /c "if not exist .claude\shared-memory mkdir .claude\shared-memory"
```

Then use the Read tool to read the auto-memory file and the Write tool to write it to `.claude/shared-memory/MEMORY.md`.

### Step 5: Write Handoff State File

Using all captured information, write `.claude/handoff-state.json` with this structure:

```json
{
  "version": 1,
  "timestamp": "<ISO timestamp>",
  "outgoing_account": "<from user notes or 'unspecified'>",
  "branch": "<current branch>",
  "recent_commits": ["<last 5-10 commit onelines>"],
  "active_sd": {
    "sd_key": "<SD key or null>",
    "title": "<SD title or null>",
    "sd_type": "<type or null>",
    "phase": "<current phase or null>",
    "status": "<status or null>"
  },
  "session_context": {
    "auto_proceed": "<from session metadata>",
    "last_phase": "<from session>",
    "working_files": ["<files modified in recent commits>"]
  },
  "notes": "<user-provided notes from $ARGUMENTS>",
  "auto_summary": "<2-3 sentence summary of recent work based on commits and SD state>"
}
```

### Step 6: Commit and Push Handoff State

```bash
git add .claude/handoff-state.json .claude/shared-memory/
```

```bash
git commit -m "handoff: account switch checkpoint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

```bash
git push
```

### Step 7: Display Confirmation

Output a formatted summary:

```
============================================================
  HANDOFF OUT - Account Switch Ready
============================================================

  Timestamp:  <time>
  Branch:     <branch>
  Active SD:  <SD key> - <title> (<phase>)
  Notes:      <user notes>

  Auto-Summary:
  <2-3 sentence description of what was happening>

  Memory:     Synced to .claude/shared-memory/
  State:      Written to .claude/handoff-state.json
  Git:        Committed and pushed

------------------------------------------------------------
  NEXT STEPS:
  1. Switch Claude Code account (claude logout / claude login)
     OR switch to other machine and pull
  2. Run /handoff-in to restore context
============================================================
```

## Notes

- If the database query fails (no connection), still capture git state and user notes
- Always push to remote - the other account needs to pull the handoff state
- The handoff-state.json is git-tracked (not in .gitignore)
- Memory sync is a snapshot copy, not a merge - the incoming account handles merging

## Related

- **Guide**: [Multi-Account Handoff Guide](../../docs/guides/multi-account-handoff.md)
- **Incoming**: `/handoff-in` to restore context on the other account
