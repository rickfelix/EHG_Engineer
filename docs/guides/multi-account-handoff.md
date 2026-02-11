# Multi-Account Claude Code Handoff Guide

How to run two Claude Code accounts ($200/month Max and $100/month Max) on the same project with seamless context continuity.

## Architecture Overview

```
Account A (Max $200)                    Account B (Max $100)
┌─────────────────────┐                ┌─────────────────────┐
│ Claude Code Session │                │ Claude Code Session │
│                     │                │                     │
│ ~/.claude/          │ ◄── shared ──► │ ~/.claude/          │
│  └─ projects/       │   (same OS     │  └─ projects/       │
│     └─ <hash>/      │    user =      │     └─ <hash>/      │
│        └─ memory/   │    auto-shared)│        └─ memory/   │
└──────────┬──────────┘                └──────────┬──────────┘
           │                                      │
           └──────────── git repo ────────────────┘
                    (always shared)
                         │
              ┌──────────┴──────────┐
              │ .claude/            │
              │  ├─ commands/       │  ◄── Tracked in git
              │  ├─ agents/         │
              │  ├─ settings.json   │
              │  ├─ handoff-state.json │ ◄── Handoff context
              │  └─ shared-memory/  │  ◄── Memory snapshot
              │                     │
              │ Supabase Database   │  ◄── Always shared
              │  ├─ claude_sessions │
              │  ├─ strategic_dirs  │
              │  └─ retrospectives  │
              └─────────────────────┘
```

## Where Your Learnings Actually Live (Don't Panic)

If you're worried about losing learnings when adding a second account, here's the reality:

| Learning Type | Storage Location | Shared Between Accounts? |
|---------------|------------------|:------------------------:|
| Auto-memory (MEMORY.md) | `~/.claude/projects/<hash>/memory/` | **YES** (same machine) |
| Retrospectives & issue patterns | Supabase `retrospectives`, `issue_patterns` tables | **YES** (always) |
| SD history & decisions | Supabase `strategic_directives_v2` | **YES** (always) |
| Protocol & workflow rules | CLAUDE.md, CLAUDE_CORE.md (git) | **YES** (always) |
| Custom commands & agents | `.claude/commands/`, `.claude/agents/` (git) | **YES** (always) |
| Project settings | `.claude/settings.json` (git) | **YES** (always) |
| User preferences in memory | MEMORY.md (see row 1) | **YES** (same machine) |
| Conversation history | Anthropic cloud (per account) | **NO** (ephemeral) |

**Bottom line**: On the same machine, **99% of your learnings are already shared**. The only thing that doesn't transfer is conversation history from past sessions - but that's ephemeral and not where durable knowledge lives. Your MEMORY.md, database learnings, protocol files, and custom commands are all accessible to both accounts immediately.

### What "Conversation History" Actually Means

When you start a new Claude Code session (even on the same account), the previous conversation is gone. Claude reads MEMORY.md and CLAUDE.md fresh each session. So switching accounts has the same "loss" as starting a new session on your existing account - which is to say, almost none, because the system is designed around persistent files and database state, not conversation memory.

## Getting Started: Bootstrap the New Account

### Which Account to Start With

**Start with the OLD account** (the one with a year of history). Here's the one-time bootstrap process:

1. **Log into your old account** (`claude login` if needed)
2. **Run `/handoff-out`** with notes: `/handoff-out [old-account] Initial bootstrap for new account setup`
3. **This captures and pushes**: current memory snapshot, active SD state, git context
4. **Log into your new account**: `claude logout` then `claude login` with new credentials
5. **Run `/handoff-in`** to verify the new account sees everything
6. **Verify memory**: Ask Claude "what do you know about this project?" - it should reference your MEMORY.md learnings

### After Bootstrap: Verify Shared State

On the new account, verify these commands work:
```bash
npm run sd:next          # Should show your SD queue
npm run sd:status        # Should show current progress
```

If these work, your database connection is shared and all SD/learning history is accessible.

### Same-Machine Verification

Since both accounts run on the same Windows user (`rickf`), verify memory sharing:
```bash
# Both accounts should see the same file:
type C:\Users\rickf\.claude\projects\C--Users-rickf-Projects--EHG-EHG-Engineer\memory\MEMORY.md
```

If this file exists and has content, both accounts already share all auto-memory learnings.

## Recommended Account Strategy

| Scenario | Use Old Account ($200 Max) | Use New Account ($100 Max) |
|----------|:--------------------------:|:--------------------------:|
| Complex multi-SD orchestrators | Best choice | Adequate if old is rate-limited |
| LEAD phase (approval, review) | Best choice | Works fine |
| EXEC phase (implementation) | Works fine | Best choice (saves old quota) |
| Bug fixes / quick-fixes | Either | Best choice |
| Documentation / docs SDs | Either | Best choice |
| Long autonomous sessions | Best choice (higher limits) | May hit limits |
| Old account at rate limit | Switch to new | Use this |
| New account at rate limit | Use this | Switch to old |

**Practical strategy**: Use the **old account as primary** (it's what you're used to, higher limits). Use the **new account as overflow** when:
- Old account hits rate limits
- Running parallel work in separate worktrees
- Doing scoped, focused work that doesn't need the full $200 budget

## What's Shared vs What's Not

| Resource | Same Machine / Same OS User | Different Machines |
|----------|:---------------------------:|:------------------:|
| Git repo (code, CLAUDE.md, .claude/) | Shared | Shared (via push/pull) |
| Auto-memory (~/.claude/projects/.../memory/) | Shared automatically | NOT shared |
| Supabase database (sessions, SDs, learnings) | Shared | Shared |
| Session history (conversation) | NOT shared | NOT shared |
| User-level settings (~/.claude/settings.json) | Shared automatically | NOT shared |
| MCP servers (.claude/mcp.json in project) | Shared | Shared (via git) |

**Key insight**: If both accounts run on the **same machine under the same OS user**, auto-memory is already shared because `~/.claude/` is the same directory. The handoff commands still capture session context (what you were working on), which is always lost between sessions.

## Prerequisites

- Both Claude Code accounts authenticated (switch with `claude logout` / `claude login`)
- Git configured with push access from both accounts
- Project cloned to the same local path (same machine) or both machines have the repo

## One-Time Setup

### Step 1: Verify Project-Level Settings

Ensure settings are in the **project** `.claude/settings.json` (git-tracked), not just user-level `~/.claude/settings.json`.

```bash
# Check project settings exist and have your config
cat .claude/settings.json
```

Any settings only in `~/.claude/settings.json` won't carry over to a different machine. Move shared preferences to the project-level file.

### Step 2: Use Project-Level MCP Configuration

If you use MCP servers, configure them in `.claude/mcp.json` (project root) rather than `~/.claude/mcp.json` (user-level):

```json
// .claude/mcp.json (in project root - git-tracked)
{
  "mcpServers": {
    "your-server": {
      "command": "node",
      "args": ["path/to/server.js"]
    }
  }
}
```

### Step 3: Memory Sync Setup (Different Machines Only)

**Skip this if both accounts run on the same machine under the same OS user** - memory is already shared via `~/.claude/projects/<hash>/memory/`.

For different machines, the `/handoff-out` and `/handoff-in` commands handle memory sync via `.claude/shared-memory/` (git-tracked). No additional setup needed.

### Step 4: Verify Commands Are Available

Both handoff commands are in `.claude/commands/` (git-tracked):

```
.claude/commands/handoff-out.md   →  /handoff-out
.claude/commands/handoff-in.md    →  /handoff-in
```

Verify they appear in your available commands by typing `/` in Claude Code.

## Handoff Workflow

### Outgoing (Before Switching Accounts)

```
You (Account A): /handoff-out <optional notes>
```

**What happens automatically:**
1. Checks for uncommitted changes and commits them as a WIP checkpoint
2. Queries the database for active SD, phase, and session state
3. Captures recent git history and branch state
4. Copies auto-memory to `.claude/shared-memory/` (for cross-machine sync)
5. Writes `.claude/handoff-state.json` with full context
6. Commits the handoff state and pushes to remote
7. Displays a confirmation with handoff summary

**Example:**
```
/handoff-out Finished EXEC phase for SD-LEO-001, tests passing, ready for PLAN-TO-LEAD
```

### Incoming (After Switching to Other Account)

```
You (Account B): /handoff-in
```

**What happens automatically:**
1. Pulls latest from remote (gets the handoff state)
2. Reads `.claude/handoff-state.json` for full context
3. Reads `.claude/shared-memory/MEMORY.md` and syncs with local auto-memory
4. Displays a formatted context summary:
   - What was being worked on
   - Current SD, phase, and progress
   - Recent commits and branch state
   - Notes from the outgoing session
5. Suggests next steps based on the handoff state

### Complete Flow

```
Account A (finishing up)         Account B (picking up)
─────────────────────────        ─────────────────────────
1. /handoff-out "notes"
2. [auto: commit, capture,
    push handoff state]
3. Switch accounts
   (claude logout/login
    or switch machine)
                                 4. /handoff-in
                                 5. [auto: pull, read state,
                                     sync memory, show context]
                                 6. Continue working
```

## Handoff State File Format

`.claude/handoff-state.json` contains:

```json
{
  "version": 1,
  "timestamp": "2026-02-11T10:43:00.000Z",
  "outgoing_account": "max-200",
  "branch": "main",
  "recent_commits": [
    "6e6dfda fix: complete LLM migration",
    "a91820b feat: add canary routing"
  ],
  "active_sd": {
    "sd_key": "SD-LEO-001",
    "title": "LLM Client Factory",
    "phase": "EXEC",
    "status": "in_progress"
  },
  "session_context": {
    "auto_proceed": true,
    "last_handoff": "PLAN-TO-EXEC",
    "working_files": ["lib/llm/client-factory.js", "tests/llm.test.js"]
  },
  "notes": "User-provided context for the next session",
  "auto_summary": "Auto-generated summary of recent work",
  "memory_synced": true
}
```

## Tips for Optimal Usage

### 1. Divide Work by Account Capability

| Account | Best For | Why |
|---------|----------|-----|
| Max $200 | Complex orchestrators, multi-file refactors, LEAD phase | Higher rate limits, longer sessions |
| Max $100 | Focused single-SD work, bug fixes, docs, EXEC phase | Adequate for scoped tasks |

### 2. Natural Handoff Points

The cleanest times to switch accounts:

| Handoff Point | Why It's Clean |
|---------------|----------------|
| After a handoff completes (e.g., PLAN-TO-EXEC) | Phase boundary, clear state |
| After `/ship` (PR merged) | Clean git state, work committed |
| After `/learn` | Learnings captured in database |
| After orchestrator completes all children | Major milestone |
| Start of a new SD | No in-progress state to transfer |

### 3. Avoid Switching Mid-Phase

Switching accounts mid-implementation (e.g., halfway through EXEC coding) is the hardest handoff. The incoming session loses all conversation context. If you must:
- Use detailed `/handoff-out` notes describing exactly what's in progress
- List files being modified and what remains
- Describe any decisions made during the session

### 4. Label Your Accounts

In your handoff notes, use consistent labels so the state file is clear:

```
/handoff-out [max-200] Completed LEAD approval for SD-LEO-002
/handoff-out [max-100] Finished EXEC tests, ready for review
```

### 5. Database Is Your Friend

Both accounts share the Supabase database. SD status, session claims, retrospectives, and learnings are always synchronized regardless of which account is active. The handoff commands query the database for current state.

## Troubleshooting

### Handoff state is outdated
**Symptom**: `/handoff-in` shows old context.
**Fix**: Ensure the outgoing account ran `/handoff-out` and that the push succeeded. Check `git log` for the handoff commit.

### Memory diverged between accounts
**Symptom**: One account has learnings the other doesn't.
**Fix**: Run `/handoff-out` to sync memory to `.claude/shared-memory/`, then `/handoff-in` on the other account. For same-machine setups, memory should already be shared.

### SD claim conflict
**Symptom**: "SD already claimed by another session."
**Fix**: The LEO multi-session coordination handles this. Stale sessions (>5 min heartbeat) are auto-released. If stuck:
```sql
SELECT session_id, sd_id, heartbeat_age_human
FROM v_active_sessions WHERE computed_status = 'stale';
```

### Git conflicts on handoff-state.json
**Symptom**: Merge conflict in `.claude/handoff-state.json`.
**Fix**: Accept the incoming version (it's always the latest handoff). The file is regenerated on each `/handoff-out`.

## FAQ

**Q: Will I lose my learnings if I switch accounts?**
A: No. On the same machine, auto-memory (`MEMORY.md`) is shared via the filesystem, and all database learnings (retrospectives, issue patterns, SD history) are in Supabase which both accounts access. The only thing not shared is past conversation history, which is ephemeral anyway. See the "Where Your Learnings Actually Live" section above.

**Q: Should I start with the old or new account?**
A: Start with the **old account** for the initial bootstrap (`/handoff-out`). After that, use either account - they share the same learnings. Use the old account as primary (higher limits) and the new one as overflow.

**Q: Do I need to log out/in each time?**
A: Only if using two accounts on the same machine. Use `claude logout` then `claude login` with the other account's credentials.

**Q: Can both accounts be active simultaneously?**
A: Not on the same project directory. Claude Code's lock files prevent this. Use separate worktrees if you need parallel work (see `docs/guides/working-with-worktrees.md`).

**Q: What about API keys and .env?**
A: `.env` is gitignored and local. Both accounts on the same machine share it automatically. Different machines need their own `.env` (copy manually once).

**Q: Does switching accounts affect the LEO session?**
A: Yes. Each account starts a new `claude_sessions` entry. The `/handoff-out` command properly closes the outgoing session, and `/handoff-in` notes the continuation in the new session.
