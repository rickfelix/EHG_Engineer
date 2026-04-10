# /leo cleanup — Intelligent Repo Cleanup

Scan untracked files, categorize them via pattern rules, and clean up the repository.

**Trigger keywords**: cleanup, tidy, clean up files, untracked files, temp files, messy repo, junk files, root clutter, file bloat

## Instructions

### Default: Dry Run Scan

Run the cleanup engine in dry-run mode (default — no changes):

```bash
node scripts/repo-cleanup.js
```

Display the output to the user. This shows:
- Categorized summary table (DELETE / GITIGNORE / COMMIT / REVIEW)
- File counts per category with example file paths
- REVIEW items that need manual classification

### If user says "execute", "apply", "do it", or "clean":

Run with `--execute` flag:

```bash
node scripts/repo-cleanup.js --execute
```

This will:
1. DELETE files matching delete rules
2. Append new patterns to .gitignore for gitignore rules
3. Stage files matching commit rules (actual commit done via /ship)
4. Skip REVIEW items for interactive handling

### For REVIEW items (files with no matching rule):

Present each unknown file to the user one at a time using AskUserQuestion:

```javascript
{
  "questions": [{
    "question": "Unknown file: <filepath> (<size> lines, <age> days old)\nFirst 3 lines: <preview>",
    "header": "Classify",
    "multiSelect": false,
    "options": [
      {"label": "Delete", "description": "Remove this file permanently"},
      {"label": "Gitignore", "description": "Add pattern to .gitignore"},
      {"label": "Commit", "description": "Stage for commit (track in git)"},
      {"label": "Skip", "description": "Leave this file alone"}
    ]
  }]
}
```

After the user classifies a file, ask if they want to learn a rule:

```javascript
{
  "questions": [{
    "question": "Add rule '<generated-pattern>' → <category> to cleanup-rules.json?",
    "header": "Learn",
    "multiSelect": false,
    "options": [
      {"label": "Yes", "description": "Auto-categorize similar files next time"},
      {"label": "No", "description": "One-time decision only"}
    ]
  }]
}
```

If "Yes", call learnRule():
```javascript
import { learnRule } from '../scripts/repo-cleanup.js';
learnRule(filepath, category, reason);
```

### JSON output mode:

```bash
node scripts/repo-cleanup.js --json
```

Returns structured JSON for programmatic use by other scripts.

## Integration

This command is integrated at these pipeline points:
- `sd:next` warns when >5 untracked files detected and suggests `/leo cleanup`
- `/ship` Step 0.1 runs a scan during preflight

## Arguments

| Argument | Description |
|----------|-------------|
| (none) | Dry run — scan and display |
| `--execute` | Apply all rule-matched actions |
| `--no-learn` | Disable rule learning prompts |
| `--json` | Output JSON instead of table |
