---
description: Simplify code before shipping - clean up session changes without altering behavior
argument-hint: [--files <paths>] [--apply] [--dry-run] [--type cleanup|style|logic]
---

# 🔧 LEO Simplify Command

**Part of SD-LEO-001: Automated Code Simplification**

Simplifies "working but messy" code into professional-grade code without changing behavior. Runs database-driven rules to clean up code before PR submission.

## Overview

| Mode | Description |
|------|-------------|
| **Dry Run** (default) | Preview changes without applying |
| **Apply** | Apply changes to files |
| **Session Scope** | Only files changed since origin/main |

## Quick Usage

```bash
# Preview changes for session files (default)
/simplify

# Preview changes for specific files
/simplify --files src/components/Header.jsx src/utils/helpers.js

# Apply changes (after review)
/simplify --apply

# Only cleanup rules (safest)
/simplify --type cleanup
```

---

## Step 0: Check Plugin Status

First, check if the official Claude Code Simplifier Plugin is available:

```javascript
import { getPluginStatus } from './lib/simplifier/plugin-bridge.js';
const status = getPluginStatus();
console.log(status.recommendation);
```

If the official plugin is available, it will be used for potentially better results (uses Claude Opus for reasoning). Otherwise, the native engine runs.

---

## Step 1: Determine Files to Simplify

**Option A: Session-Changed Files (Default)**
Get files changed in the current session:
```javascript
import { SimplificationEngine } from './lib/simplifier/simplification-engine.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const engine = new SimplificationEngine(supabase);
const files = engine.getSessionChangedFiles();
console.log(`Found ${files.length} changed files`);
```

**Option B: Specific Files**
Use the `--files` argument to specify files explicitly.

---

## Step 2: Preview Changes (Dry Run)

Run simplification in dry-run mode:
```javascript
const results = await engine.simplify(files, { dryRun: true });
```

Review the output:
- 🟢 High confidence (≥90%) - safe to apply
- 🟡 Medium confidence (≥80%) - review recommended
- 🟠 Lower confidence (≥60%) - manual review required

**Change Types:**
| Type | Risk | Examples |
|------|------|----------|
| `cleanup` | Low | `!!x` → `Boolean(x)`, strict equality |
| `style` | Low | template literals, const over let |
| `logic` | Medium | early return, nullish coalescing |

---

## Step 3: Review and Approve

After reviewing the dry run output:

1. **If changes look good:** Run with `--apply`
2. **If some changes unwanted:** Run with `--type cleanup` for only safest changes
3. **If uncertain:** Skip simplification for this PR

---

## Step 4: Apply Changes

```javascript
const results = await engine.simplify(files, { dryRun: false });
```

Or via command:
```bash
/simplify --apply
```

---

## Step 5: Validate

After applying changes:
1. Run existing tests: `npm test`
2. Check for syntax errors: `npm run lint`
3. Quick visual review of diff

If any issues, git restore and skip simplification:
```bash
git checkout -- .
```

---

## Scoring Rubric

The engine uses confidence scores from database rules:

| Confidence | Action | Description |
|------------|--------|-------------|
| ≥95% | Auto-apply | Applied automatically (reserved for future) |
| ≥80% | Suggest | Shown in preview, safe to apply |
| ≥60% | Manual | Requires manual review |

---

## Rule Types

**Cleanup Rules (Safe):**
- `double-bang-to-boolean`: `!!value` → `Boolean(value)`
- `strict-equality`: `==` → `===` (except null/undefined checks)
- `strict-inequality`: `!=` → `!==`

**Style Rules (Preference):**
- `template-literals`: String concatenation → template literals
- `const-over-let`: `let` → `const` for non-reassigned variables

**Logic Rules (Careful):**
- `early-return`: if/else return → ternary
- `nullish-coalescing`: null/undefined checks → `??`
- `optional-chaining`: `x && x.y` → `x?.y`

---

## Integration with /ship

The `/ship` command includes an optional Step 0.6 that suggests running `/simplify`:

```
/leo complete → /simplify (optional) → /ship → /learn
```

See `/ship` command for the integrated workflow.

---

## Database Rules

Rules are stored in `leo_simplification_rules` table and can be:
- Enabled/disabled without code changes
- Adjusted for confidence thresholds
- Extended with new patterns

Query current rules:
```sql
SELECT rule_code, rule_type, confidence, enabled
FROM leo_simplification_rules
ORDER BY priority;
```

---

## Troubleshooting

**No files found:**
- Ensure you have uncommitted changes from origin/main
- Use `--files` to specify files explicitly

**Rule not applying:**
- Check if rule is enabled in database
- Verify pattern matches your code syntax
- Check confidence threshold

**Changes break tests:**
- Run `git checkout -- .` to restore
- Report pattern issue for rule adjustment

---

## Command Ecosystem

| After `/simplify` | Consider |
|-------------------|----------|
| Changes applied | `/ship` to commit and create PR |
| Issues found | `/quick-fix` for small fixes |
| Major refactor needed | Create SD via `/leo` |
