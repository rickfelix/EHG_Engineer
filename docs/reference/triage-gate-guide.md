# Triage Gate Guide

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Orchestrator
- **Last Updated**: 2026-02-18
- **Tags**: triage, quick-fix, work-item-router, leo-create, sd-creation

## Overview

The Triage Gate (`scripts/modules/triage-gate.js`) is an intelligent pre-screening layer that fires before `/leo create` creates a Strategic Directive. It wires together the AI LOC estimator (`lib/ai-loc-estimator.js`) and the Unified Work-Item Router (`lib/utils/work-item-router.js`) to determine whether a work item belongs in the Quick Fix workflow or the full SD workflow — before anything is written to the database.

## Table of Contents

- [Why Triage Gate?](#why-triage-gate)
- [Tier System](#tier-system)
- [Source Behavior](#source-behavior)
- [CLI Usage](#cli-usage)
- [API Reference](#api-reference)
- [Integration with /leo create](#integration-with-leo-create)
- [Verification Tests](#verification-tests)

---

## Why Triage Gate?

Before this module, `/leo create` always created a full Strategic Directive regardless of scope. A 1-line typo fix would go through LEAD→PLAN→EXEC just like a major feature. The LOC estimator (`lib/ai-loc-estimator.js`) and work-item router (`lib/utils/work-item-router.js`) existed but were disconnected from the SD creation path.

The Triage Gate bridges this gap: it runs the LOC estimator, passes the result through the router, and presents an `AskUserQuestion` gating the user toward Quick Fix for small work items.

---

## Tier System

Thresholds are DB-driven, loaded from the `work_item_thresholds` table (5-minute cache, falls back to defaults on error):

| Tier | Default LOC Ceiling | Workflow | LEAD Required | PRD Required |
|------|---------------------|----------|:---:|:---:|
| **Tier 1** | ≤30 LOC | Quick Fix (auto-approve) | No | No |
| **Tier 2** | 31–75 LOC | Quick Fix (compliance rubric ≥70) | No | No |
| **Tier 3** | >75 LOC | Full SD (LEAD→PLAN→EXEC) | Yes | Yes |

Risk keywords always force Tier 3 regardless of LOC:
- **Security keywords**: `security`, `auth`, `authentication`, `authorization`, `rls`, `payments`, `credentials`
- **Schema keywords**: `migration`, `schema`, `alter table`, `create table`, `drop table`
- **Type `feature`**: Always requires full SD workflow

---

## Source Behavior

The `source` parameter controls how aggressively the gate fires:

| Source | Gate Behavior | Use Case |
|--------|--------------|----------|
| `interactive` | **Hard gate** — presents `AskUserQuestion` for Tier 1/2 | `/leo create` interactive wizard |
| `feedback` | **Soft** — logs info note only, continues to SD creation | `--from-feedback` flag |
| `uat` | **Soft** — logs info note only, continues to SD creation | `--from-uat` flag |
| `learn` | **Soft** — logs info note only, continues to SD creation | `--from-learn` flag |
| `plan` | **Exempt** — skips triage entirely | `--from-plan` flag |
| `child` | **Exempt** — skips triage entirely | `--child` flag |

---

## CLI Usage

```bash
# Basic triage check
node scripts/modules/triage-gate.js --title "Fix typo in button label" --type fix --source interactive

# JSON output (machine-readable to stdout, human summary to stderr)
node scripts/modules/triage-gate.js --title "Fix typo in button label" --type fix --source interactive --output-json

# Options
--title <text>     Work item title (required)
--type <type>      SD type: fix, feature, infrastructure, refactor, etc.
--source <source>  Entry source: interactive, uat, feedback, learn, plan, child
--output-json      JSON to stdout, human summary to stderr
--help             Show help
```

### Example Outputs

**Tier 1 — Quick Fix recommended**:
```json
{
  "tier": 1,
  "tierLabel": "TIER_1",
  "shouldGate": true,
  "workItemType": "QUICK_FIX",
  "estimatedLoc": 1,
  "confidence": 95,
  "reasoning": "Text change - single line",
  "escalationReason": null,
  "askUserQuestionPayload": { ... }
}
```

**Tier 3 — Full SD (risk keyword)**:
```json
{
  "tier": 3,
  "tierLabel": "TIER_3",
  "shouldGate": false,
  "workItemType": "STRATEGIC_DIRECTIVE",
  "escalationReason": "Type \"feature\" requires full Strategic Directive workflow"
}
```

**Exempt source**:
```json
{
  "tier": 3,
  "shouldGate": false,
  "reasoning": "Source \"plan\" is exempt from triage"
}
```

---

## API Reference

### `runTriageGate(input, supabaseClient?) → Promise<TriageResult>`

Core triage function. Call before SD creation to get a routing recommendation.

```javascript
import { runTriageGate } from './scripts/modules/triage-gate.js';

const result = await runTriageGate({
  title: 'Fix typo in button label',
  description: 'The submit button says "Sbumit" on the login page',
  type: 'fix',
  source: 'interactive'
});

if (result.shouldGate) {
  // Present result.askUserQuestionPayload to user
} else if (result.tier <= 2) {
  // Log soft recommendation
  console.log(formatTriageSummary(result));
}
// Tier 3 or exempt: proceed with SD creation normally
```

### `formatTriageSummary(result) → string`

Formats a human-readable multi-line summary of a triage result for CLI output.

### `isHardGateSource(source) → boolean`

Returns `true` for `interactive` (presents AskUserQuestion), `false` for all other sources (soft or exempt).

### TriageResult shape

| Field | Type | Description |
|-------|------|-------------|
| `tier` | number | 1, 2, or 3 |
| `tierLabel` | string | 'TIER_1', 'TIER_2', 'TIER_3' |
| `shouldGate` | boolean | Whether to present AskUserQuestion |
| `workItemType` | string | 'QUICK_FIX' or 'STRATEGIC_DIRECTIVE' |
| `estimatedLoc` | number | AI-estimated lines of code |
| `confidence` | number | LOC confidence (0–100) |
| `reasoning` | string | Why this LOC estimate |
| `escalationReason` | string\|null | Why escalated (Tier 3 only) |
| `askUserQuestionPayload` | Object\|null | Ready for AskUserQuestion (Tier 1/2 interactive only) |
| `routingDecision` | Object\|null | Full decision from `work-item-router.js` |

---

## Integration with /leo create

Step 0 of the `/leo create` flow runs the triage gate before type inference:

```
/leo create "Fix typo in button"
  → Step 0: node triage-gate.js --source interactive
    → tier 1, shouldGate true
    → AskUserQuestion: "Quick Fix (Recommended)" or "Full SD (Override)"
      → User picks QF → node scripts/create-quick-fix.js ...
      → User picks SD → proceed to type inference → createSD()
```

For flag-based creation paths:
- `--from-plan`, `--child` → triage skipped (exempt sources)
- `--from-feedback`, `--from-uat`, `--from-learn` → triage runs but only logs a one-line info note; SD creation continues regardless

Within `leo-create-sd.js` direct creation path, if `--force` is passed, triage is also skipped.

---

## Verification Tests

```bash
# Tier 1 — should return tier 1, shouldGate true
node scripts/modules/triage-gate.js \
  --title "Fix typo in button label" --type fix --source interactive --output-json

# Tier 3 (risk escalation) — feature type forces full SD
node scripts/modules/triage-gate.js \
  --title "Migrate authentication to SSO" --type feature --source interactive --output-json

# Exempt — plan source, shouldGate false
node scripts/modules/triage-gate.js \
  --title "anything" --type fix --source plan --output-json
```

---

## Related Files

| File | Role |
|------|------|
| `scripts/modules/triage-gate.js` | This module |
| `lib/ai-loc-estimator.js` | LOC estimation (called by triage gate) |
| `lib/utils/work-item-router.js` | Tier routing with DB-driven thresholds |
| `scripts/leo-create-sd.js` | SD creation — calls triage gate |
| `.claude/commands/leo.md` | `/leo create` command — Step 0 triage |
| `scripts/create-quick-fix.js` | Quick Fix creation (recommended for Tier 1/2) |
| `docs/03_protocols_and_standards/quick-fix-protocol.md` | QF workflow documentation |
