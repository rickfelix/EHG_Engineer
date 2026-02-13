# Handoff In — Import Session Context After Account Switch

Restore session context from a handoff package created by `/handoff-out` on the other account.

## Instructions

### Step 1: Run the Import Script

```bash
node scripts/handoff-import.cjs
```

This reads the handoff package from `.claude/handoff/` and:
- Validates the package exists and checks its age
- Restores session state files to `.claude/`
- Copies memory files that only exist in the handoff (no conflict)
- Identifies memory files that need intelligent merging
- Displays the briefing from the source account
- Outputs a structured `HANDOFF_IMPORT_RESULT=` JSON line

### Step 2: Handle Memory Merges

Parse the `HANDOFF_IMPORT_RESULT` JSON from the script output. Check `memoryAnalysis.needsMerge`.

**If `needsMerge` is empty** — all memory files are resolved. Skip to Step 3.

**If `needsMerge` has files** — merge each one:

For each file in `needsMerge`:

1. Read the handoff version from `.claude/handoff/memory/<filename>`
2. Read the destination version from `~/.claude/projects/C--Users-rickf-Projects--EHG-EHG-Engineer/memory/<filename>`
3. Merge intelligently based on file type:

**For MEMORY.md:**
- Merge by section (`## ` headers)
- For each section that exists in BOTH versions:
  - Keep all unique entries from both
  - For duplicate entries, keep the more recent or more detailed version
  - Preserve section order from the handoff version (it's newer)
  - Remove any entries explicitly marked as outdated in either version
- For sections only in one version: include them
- Ensure the final file stays under 200 lines (the system limit). If it exceeds 200 lines, move the least-recently-relevant content into topic files.

**For topic files (other .md files):**
- Compare the two versions
- If one is clearly a superset of the other, keep the superset
- If both have unique content, merge the sections together
- Keep the most recent information from each

4. Write the merged result to `~/.claude/projects/C--Users-rickf-Projects--EHG-EHG-Engineer/memory/<filename>`
5. Report what was merged

### Step 3: Display the Briefing

The script already printed the briefing. Summarize the key points for the user:
- What SD was active (if any), its phase and progress
- Session settings (AUTO-PROCEED state)
- Git state (branch, recent commits)
- Any pending actions

### Step 4: Suggest Next Action

Based on the briefing:
- **If active SD exists**: Suggest running `/leo continue` or `npm run sd:next`
- **If no active SD**: Suggest running `npm run sd:next` to see the queue
- **If handoff is stale (>24h)**: Warn that the context may be outdated and suggest checking `npm run sd:next` fresh

### Step 5: Summary

Display a clean summary:

```
Handoff Import Complete

Memory: X copied, Y merged, Z identical, W kept
State: N file(s) restored
Active SD: <sd-key> (<phase>, <progress>%) — or "None"
Age: <time since export>

Ready to continue. Run /leo next to see the queue.
```

## Error Handling

- **No handoff package**: Tell the user to run `/handoff-out` on the other account first
- **Stale package (>24h)**: Warn but proceed — context is better than nothing
- **Database unreachable during export**: The package still contains memory + git state, which is the most valuable part
