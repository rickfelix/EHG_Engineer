# Handoff Out — Export Session Context Before Account Switch

Export your current session context so another Claude Code account can pick up where you left off.

## Instructions

### Step 1: Run the Export Script

```bash
node scripts/handoff-export.cjs
```

This creates a handoff package at `.claude/handoff/` containing:
- Memory files from `~/.claude/projects/C--Users-rickf-Projects--EHG-EHG-Engineer/memory/`
- Session state files (auto-proceed-state.json, unified-session-state.json)
- Active SD information (queried from database)
- Git state (branch, recent commits, uncommitted changes)
- A human-readable briefing (`briefing.md`)
- Package metadata (`metadata.json`)

### Step 2: Confirm the Package

After the script runs, display the summary output to the user. Verify:
- Memory files were copied
- Active SD was detected (if any)
- Git state was captured

### Step 3: Remind the User

Tell the user:

```
Handoff package ready at .claude/handoff/

To continue on the other account:
1. Log out of this account
2. Log in with the other account
3. Run /handoff-in
```

## Notes

- The handoff package is gitignored — it stays local
- Re-running `/handoff-out` replaces the previous package
- The package includes everything needed for session continuity
- Database state (SDs, handoffs, etc.) is shared across accounts already — only session context needs transfer
