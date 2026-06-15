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
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js LEO <type> "<title>"

# Flag-based creation
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-uat <test-id>
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-learn <pattern-id>
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-feedback <id>
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-plan [path]
# Materialize sourced proposal(s) into DRAFT SD(s); --dry-run validates with zero writes
# (SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001 — key taken verbatim from proposed_sd_key)
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-proposal <path|glob> [--dry-run]
node scripts/modules/sd-key-generator.js --child <parent-key> <index>

# Cross-repo SDs — set metadata.target_repos[] at creation time
# (SD-LEO-INFRA-LEO-CREATE-CROSS-001 — pairs with PR_MERGE_VERIFICATION at LEAD-FINAL)
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js LEO <type> "<title>" --target-repos EHG,EHG_Engineer
```

## Cross-Repo SDs (--target-repos)

When the user describes work that spans BOTH `rickfelix/ehg` (frontend) AND
`rickfelix/EHG_Engineer` (backend) — for example, an EHG UI dialog backed by
an EHG_Engineer migration + RPC — set `metadata.target_repos[]` at creation
time via the `--target-repos` flag.

**Why**: PR_MERGE_VERIFICATION at LEAD-FINAL uses `computeReposForSD(sd)` to
scope its scan. Without `metadata.target_repos[]`, single-repo SDs may
trip on phantom branches in the OTHER repo, and cross-repo SDs may stop
scanning the second repo.

**Valid values** (case-insensitive, normalized): `EHG`, `EHG_Engineer`.

**Examples**:
```bash
# Single-repo EHG_Engineer SD (most LEO-INFRA SDs) — flag NOT needed
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js LEO infrastructure "Backend-only fix"

# Cross-repo SD (REJECT-KILL pattern: EHG UI + EHG_Engineer migration)
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js LEO feature "Reject venture dialog" --target-repos EHG,EHG_Engineer
```

Invalid input fails loud with `[INVALID_TARGET_REPOS]` bracket-tokenized error.

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
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-uat <test-id>
```

### `create --from-learn <pattern-id>`
```bash
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-learn <pattern-id>
```

### `create --from-feedback <id>`
```bash
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-feedback <id>
```

### `create --child <parent-key>`
```bash
# Preview the next child key:
node scripts/modules/sd-key-generator.js --child <parent-key> <index>

# Create the child (canonical path). --type sets the child's sd_type explicitly
# (a child never inherits 'orchestrator'):
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --child <parent-key> [index] --type infrastructure
```

**One-step child linkage (SD-LEO-INFRA-ADAM-CREATION-PROCESS-001, FR-3).** Creating a
child via the canonical path now wires it fully in ONE governed step (no manual DB
surgery) via `lib/sd/child-linkage.js`:
- `parent_sd_id` is set on the child, **and**
- `relationship_type = 'child'` is set (required by `validate-child-sd-completeness.js`), **and**
- the child is registered in the parent's registry — a letter-keyed `metadata.autonomy_children`
  entry for an autonomy parent, or a `metadata.children` array otherwise. Registration is
  idempotent (re-running adds no duplicate entry).

### `create --from-plan [path]`

**MANDATORY**: Read protocol files first:
```
Read tool: CLAUDE_CORE.md
Read tool: CLAUDE_LEAD.md
```

Then run:
```bash
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-plan
# Or with specific path:
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-plan ~/.claude/plans/my-plan.md
# Set the type EXPLICITLY for an infrastructure/governance plan so inference cannot mis-type it:
SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js --from-plan <path> --type infrastructure
```

Extracts: title, summary, success criteria, scope, and SD type from plan content.
Original plan archived to `docs/plans/archived/{sd-key}-plan.md`.

**Explicit type wins (SD-LEO-INFRA-ADAM-CREATION-PROCESS-001, FR-1).** Type resolution
precedence: `--type` flag > a `## Type` plan header > keyword inference. For an
infrastructure plan, declare the type explicitly (flag or header) — inference now also
treats the literal word "infrastructure" or an `SD-LEO-INFRA-*` token as a high-confidence
infrastructure signal (it no longer mis-types as `bugfix` just because the plan mentions
"fix"). A genuine reclassification later still records `type_change_reason` +
`governance_metadata.type_reclassification`; the explicit-type-at-creation flow exists so
that change is rarely needed.

**Correct key at creation (FR-2).** `sd_code_user_facing` is set to the human-readable SD
key at creation (no longer left equal to the UUID), so no post-hoc governance-gated re-key
is needed.

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
- `SD_CREATE_VIA_SKILL=1 node scripts/leo-create-sd.js` — All SD creation
- `node scripts/modules/sd-key-generator.js` — Key generation
- `node scripts/modules/vision-readiness-rubric.js` — Vision routing
- `node scripts/create-quick-fix.js` — Quick fix creation

## Anti-Drift Rules
1. ALWAYS run vision readiness rubric before creating (unless exempt)
2. ALWAYS use canonical leo-create-sd.js (never insert directly into DB)
3. ALWAYS infer type from context before asking the user
4. NEVER skip --from-plan protocol file reading requirement
