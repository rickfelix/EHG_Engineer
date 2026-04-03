---
description: "Restore session state after crash, compaction, or interruption. Use when user says /leo resume or needs to recover session context."
---

<!-- GENERATED: hash=38c213207c9a timestamp=2026-04-03T19:13:10.432Z sections=1 -->

# LEO Resume — Restore Session State

**Purpose**: Restore session state after a crash, compaction, or interruption.
Uses the canonical leo-resume.js script (CISO: no raw JSON interpolation into prompt).

## Quick Reference
```bash
# Check and restore session state
node scripts/leo-resume.js

# Check only (no display)
node scripts/leo-resume.js --check-only
```

## Resume Protocol

### LEO Resume Skill

### Step 1: Check for Saved State

Run the canonical resume script:
```bash
node scripts/leo-resume.js
```

### Step 2: If STATE_EXISTS=false

Display:
```
No saved session state found.

State is preserved automatically during:
- Context compaction (PreCompact hook)
- Manual checkpoints (/context-compact)
- Session interruptions

Run /leo next to start fresh from the SD queue.
```

### Step 3: If STATE_EXISTS=true

The script outputs structured key=value lines. Parse them:
- RESUME_SD_ID — The SD that was being worked on
- RESUME_SD_PHASE — The phase it was in (LEAD, PLAN, EXEC)
- [GIT], [SD], [WORKFLOW], [DECISIONS], [CONSTRAINTS], [QUESTIONS], [TODO] sections

### Step 4: Load Context for Resumed SD

If RESUME_SD_ID is set:
1. Read CLAUDE_CORE.md (always)
2. Read phase-specific file based on RESUME_SD_PHASE:
   - LEAD phases -> CLAUDE_LEAD.md
   - PLAN phases -> CLAUDE_PLAN.md
   - EXEC phases -> CLAUDE_EXEC.md
3. Display:
   Session Restored: SD=<ID>, Phase=<PHASE>
   Ready to continue. Context file loaded.

If no SD in saved state:
1. Run npm run sd:next to show the SD queue
2. Display: Session State Restored (no active SD)

### Resume Behavior
- Restores git context (branch, recent commits)
- Restores SD context (ID, phase, progress)
- Restores decisions, constraints, open questions
- Restores pending actions
- Automatically loads appropriate CLAUDE_*.md context

## Canonical Scripts
- `node scripts/leo-resume.js` — Read and display session state
- `node scripts/leo-resume.js --check-only` — Check if state file exists

## Anti-Drift Rules
1. ALWAYS use the canonical script (never read state file directly in prompt)
2. ALWAYS load CLAUDE_CORE.md + phase file after restoring state
3. NEVER interpolate raw JSON state into the prompt context (CISO constraint)
4. If no saved state, run /leo next instead of guessing
