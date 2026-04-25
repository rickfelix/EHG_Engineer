<!-- reasoning_effort: high -->

---
description: "Create a new Strategic Directive via interactive wizard or flags. Supports 6 creation modes: interactive, --from-uat, --from-learn, --from-feedback, --from-plan, --child."
---

<!-- HAND-AUTHORED: This skill uses conditional routing that doesn't template from DB sections. Lint-enforced (no supabase.from). -->

# SD Create — Interactive Wizard with Vision Readiness

**Purpose**: Launch the SD creation wizard with vision readiness routing,
context-based type inference, and 6 flag-based creation modes.
All creation calls go through canonical scripts.

## Quick Reference
```bash
# Interactive creation
node scripts/leo-create-sd.js LEO <type> "<title>"

# Flag-based creation
node scripts/leo-create-sd.js --from-uat <test-id>
node scripts/leo-create-sd.js --from-learn <pattern-id>
node scripts/leo-create-sd.js --from-feedback <id>
node scripts/leo-create-sd.js --from-plan [path]
node scripts/modules/sd-key-generator.js --child <parent-key> <index>
```

## Step 0: Vision Readiness Rubric

Before type inference, run the rubric to determine routing:

```bash
node scripts/modules/vision-readiness-rubric.js --title "<title>" --type "<inferred-or-unknown>" --source "interactive" --output-json
```

Parse output and route:
- **EXEMPT** — Skip rubric (upstream governance). Exemptions: `--from-plan`, `--child`, `--vision-key`, `--arch-key`, `--from-uat`, `--from-feedback`, `--from-learn`
- **QUICK_FIX** — Offer: Create Quick Fix / Create Direct SD / Vision-First
- **DIRECT_SD** — Offer: Create SD / Start Vision Pipeline
- **VISION_FIRST** — Offer: Start Vision Pipeline / Create Direct SD (Override)

Thresholds: score 4-7 = Quick Fix | 8-12 = Direct SD | 13-20 = Vision-First

## Step 1: Context-Based Type Inference

Before asking the user, analyze conversation context:

| Context Signals | Inferred Type |
|-----------------|---------------|
| security, vulnerability, CVE, credentials, RLS, injection | `fix` (security) |
| bug, error, broken, failing, crash, exception, regression | `fix` |
| feature, add, new functionality, implement, create, build | `feature` |
| refactor, cleanup, simplify, restructure, tech debt | `refactor` |
| tooling, script, CI/CD, infrastructure, automation | `infrastructure` |
| documentation, docs, README, guide | `documentation` |

If type IS inferred: skip the type question, auto-generate title.
If type CANNOT be inferred: use AskUserQuestion with options (Fix, Feature, Infrastructure, Refactor).

## Step 2: Generate SD Key

```bash
node scripts/modules/sd-key-generator.js LEO <type> "<title>"
```

## Step 3: Flag-Based Creation Modes

### `create --from-uat <test-id>`
```bash
node scripts/leo-create-sd.js --from-uat <test-id>
```

### `create --from-learn <pattern-id>`
```bash
node scripts/leo-create-sd.js --from-learn <pattern-id>
```

### `create --from-feedback <id>`
```bash
node scripts/leo-create-sd.js --from-feedback <id>
```

### `create --child <parent-key>`
```bash
node scripts/modules/sd-key-generator.js --child <parent-key> <index>
```

### `create --from-plan [path]`

**MANDATORY**: Read protocol files first:
```
Read tool: CLAUDE_CORE.md
Read tool: CLAUDE_LEAD.md
```

Then run:
```bash
node scripts/leo-create-sd.js --from-plan
# Or with specific path:
node scripts/leo-create-sd.js --from-plan ~/.claude/plans/my-plan.md
```

Extracts: title, summary, success criteria, scope, and SD type from plan content.
Original plan archived to `docs/plans/archived/{sd-key}-plan.md`.

## Step 4: Display Result

```
SD Created: <generated-key>
   Title: <title>
   Type: <type>
   Status: draft
   Phase: LEAD

Next: Run LEAD-TO-PLAN handoff when ready
   node scripts/handoff.js execute LEAD-TO-PLAN <generated-key>
```

## Canonical Scripts (NEVER bypass)
- `node scripts/leo-create-sd.js` — All SD creation
- `node scripts/modules/sd-key-generator.js` — Key generation
- `node scripts/modules/vision-readiness-rubric.js` — Vision routing
- `node scripts/create-quick-fix.js` — Quick fix creation

## Anti-Drift Rules
1. ALWAYS run vision readiness rubric before creating (unless exempt)
2. ALWAYS use canonical leo-create-sd.js (never insert directly into DB)
3. ALWAYS infer type from context before asking the user
4. NEVER skip --from-plan protocol file reading requirement
