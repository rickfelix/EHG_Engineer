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

### Bulk classification (recommended when REVIEW has clusters):

The engine groups REVIEW items by inferred dirname/glob (≥3 files per cluster).
For each cluster, present a single AskUserQuestion to classify the whole group
in one round-trip instead of one prompt per file:

```javascript
{
  "questions": [{
    "question": "Cluster: <pattern> (<N> files matching).\nExamples: <first 3 filenames>",
    "header": "Classify cluster",
    "multiSelect": false,
    "options": [
      {"label": "Delete all", "description": "Remove all <N> files matching this pattern"},
      {"label": "Gitignore", "description": "Add the pattern to .gitignore"},
      {"label": "Commit all", "description": "Stage all <N> files for commit"},
      {"label": "Skip", "description": "Fall through to per-file review"}
    ]
  }]
}
```

After bulk classification, optionally persist the cluster pattern as a learned rule
via learnRule() so future scans auto-categorize the same shape.

### For unclustered REVIEW items (files with no matching rule):

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

Returns structured JSON for programmatic use by other scripts. Each item
includes `size_bytes` and `age_days` fields (null for paths that cannot be stat'd).

### Auto-safe mode (CI / scheduled runs):

```bash
AUTO_PROCEED=true node scripts/repo-cleanup.js --auto-safe --execute
```

Under AUTO-PROCEED, `--auto-safe` auto-applies clusters that match a
high-confidence rule suggestion derived from `git log --diff-filter=A`
(default: ≥2 prior commits introduced files matching the inferred pattern).
Safety guarantees:
- Never auto-applies category=delete (irreversible actions stay interactive)
- Each applied action appended to `.claude/cleanup-audit-log.jsonl`
- Disable globally via `CLEANUP_AUTO_SAFE_ENABLED=false` env var
- No-op without AUTO-PROCEED — flag falls through to standard prompt flow

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
| `--json` | Output JSON instead of table (items include size_bytes + age_days) |
| `--auto-safe` | Auto-apply high-confidence cluster verdicts under AUTO-PROCEED (no-op otherwise; never deletes) |

## Environment variables

| Variable | Effect |
|----------|--------|
| `AUTO_PROCEED=true` | Required for `--auto-safe` to take effect |
| `CLEANUP_AUTO_SAFE_ENABLED=false` | Kill switch — `--auto-safe` becomes a no-op |
