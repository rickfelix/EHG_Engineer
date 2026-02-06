# Three-Tier Testing Architecture

**SD**: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001
**Created**: 2026-02-06
**Status**: Implemented

## Overview

The Three-Tier Testing Architecture provides layered quality assurance for UI-touching SDs. Each tier adds a complementary verification layer with different strengths.

```
Tier 1: Automated Playwright Specs    (Regression, deterministic assertions)
           |
Tier 2: AI-Autonomous Vision QA       (Visual bugs, a11y, UX judgment)
           |
Tier 3: Human Manual /uat Command     (Subjective quality, edge cases)
```

## Tier Comparison

| Aspect | Tier 1: Playwright | Tier 2: Vision QA | Tier 3: /uat |
|--------|-------------------|-------------------|--------------|
| **Trigger** | `npm test` / CI | AUTO-PROCEED post-completion | `/uat` command |
| **Speed** | Seconds | ~2 min/run | Minutes to hours |
| **Strengths** | Regression, happy paths | Visual bugs, a11y, layout | Subjective UX, edge cases |
| **Weaknesses** | Brittle selectors | AI confidence gaps | Slow, requires human |
| **Cost** | Free (CI) | LLM tokens | Human time |
| **When** | Every commit | UI-touching SDs (auto) | Before shipping features |

## Tier 1: Automated Playwright Specs

**Existing infrastructure** - no changes needed for this SD.

- Location: `tests/e2e/`
- Runner: Playwright via `npm run test:e2e`
- Coverage: See `docs/testing/COVERAGE-SUMMARY.md`
- Purpose: Deterministic regression tests for known behaviors

## Tier 2: AI-Autonomous Vision QA

**New** - integrated into AUTO-PROCEED post-completion sequence.

### Sequence Position

```
SD completes EXEC phase
  -> /restart (servers)
  -> [vision-qa]     <-- Tier 2 (only for UI-touching SDs + AUTO-PROCEED active)
  -> /document
  -> /ship
  -> /learn
```

### Components

| File | Purpose |
|------|---------|
| `lib/testing/vision-qa-pipeline.js` | Pipeline orchestrator (entry point) |
| `lib/testing/ui-touching-classifier.js` | Determines if SD touches UI (git + scope fallback) |
| `lib/testing/test-goal-extractor.js` | Converts user stories to structured test goals |
| `lib/testing/vision-qa-finding-router.js` | Routes findings to quick-fix or debt registry |
| `lib/testing/vision-qa-agent.js` | Vision QA agent (Observe-Think-Act loop) |
| `lib/utils/post-completion-requirements.js` | Controls when vision-qa step runs |

### Pipeline Flow

```
executeVisionQAPipeline(sd)
  |
  1. classifySD(sd)
  |   -> git diff path analysis (DEFAULT_UI_PATTERNS)
  |   -> fallback: scope/description keyword matching
  |   -> Result: { ui_touching: true/false }
  |
  2. extractTestGoalsForSD(sd.id)
  |   -> Load user_stories from database
  |   -> Extract acceptance_criteria + given_when_then scenarios
  |   -> Result: { test_goals: [...], goals_hash }
  |
  3. runVisionQAWithTimeout(sd, goals)  [max 2 cycles]
  |   -> VisionQAAgent.testApplication()
  |   -> 120s timeout per run
  |   -> Result: { bugs, findings, accessibilityViolations, performanceMetrics }
  |
  4. routeFindings(result, context)
      -> Critical + high-confidence (>=0.85) -> inline quick-fix (max 2 cycles)
      -> Everything else -> uat_debt_registry table
      -> Also routes a11y violations and perf regressions to debt
```

### Classification Rules

**UI-touching** (triggers Vision QA):
- File paths matching: `app/`, `pages/`, `src/components/`, `.tsx`, `.jsx`, `.css`, etc.
- Scope keywords: ui, component, page, dashboard, form, modal, button, layout, style, frontend

**Backend-only** (skips Vision QA):
- File paths: `lib/`, `server/`, `scripts/`, `database/`, `config/`, `test/`
- No matching UI keywords in scope/description

### Finding Classification

| Severity | Confidence | Route | Action |
|----------|-----------|-------|--------|
| critical | >= 0.85 | quick-fix | Inline fix + retest (max 2 cycles) |
| critical | < 0.85 | debt | Registered in uat_debt_registry |
| high/medium/low | any | debt | Registered in uat_debt_registry |
| a11y violation | n/a | debt | Always registered as accessibility debt |
| perf regression | n/a | debt | Registered if LCP > 2500ms or FCP > 1800ms |

### Deduplication

Issues are deduplicated by `issue_signature` - a SHA-256 hash of `category:description`. If a quick-fix already exists for the same signature, new findings route to debt instead of creating duplicates.

## Tier 3: Human Manual /uat Command

**Enhanced** - now includes UAT debt registry display.

### Phase Sequence

```
/uat (execute)
  Phase 0: Load route context
  Phase 1: Load user stories
  Phase 2: Load PRD acceptance criteria
  Phase 3: Generate test scenarios (enhanced with route context)
  Phase 4: Generate UAT checklist (includes debt registry items at top)
  Phase 5: Record UAT evidence
  Phase 6: Display UAT debt registry items (NEW)
```

### Debt Registry Integration

Phase 6 loads pending items from `uat_debt_registry` where `sd_id` matches and `status = 'pending'`. These appear:

1. **In the checklist** (Phase 4) - debt items are the first checklist entries, split by severity
2. **In the display** (Phase 6) - grouped by category with severity icons and confidence scores

### Debt Item Lifecycle

```
Vision QA detects issue
  -> Inserted into uat_debt_registry (status: 'pending')
  -> /uat command displays as priority checklist item
  -> Human verifies:
       Confirmed bug  -> Create quick-fix or file issue -> status: 'resolved'
       False positive  -> status: 'wont_fix'
       Low priority    -> status: 'deferred'
```

## Database: UAT Debt Registry

**Table**: `uat_debt_registry`
**Migration**: `database/migrations/20260206_uat_debt_registry.sql`

### Key Columns

| Column | Type | Description |
|--------|------|-------------|
| `sd_id` | TEXT | Strategic Directive ID |
| `source` | TEXT | Origin: `vision_qa`, `skip`, `manual`, `automated` |
| `category` | TEXT | `bug`, `accessibility`, `performance`, `ux_judgment`, `untested` |
| `severity` | TEXT | `critical`, `high`, `medium`, `low` |
| `confidence` | NUMERIC | AI confidence score (0-1) |
| `description` | TEXT | Human-readable issue description |
| `evidence` | JSONB | Screenshots, route reasons, original findings |
| `issue_signature` | TEXT | Deduplication hash |
| `status` | TEXT | `pending`, `resolved`, `wont_fix`, `deferred` |
| `area` | TEXT | UI area/page affected |

### Indexes

- `sd_id + status` (composite) - fast lookup by SD
- `issue_signature` - deduplication queries
- `severity + status` - priority sorting
- `source` - filtering by origin
- `evidence` (GIN) - JSONB queries

## Configuration

### Post-Completion Requirements

Vision QA runs when ALL conditions are met:
1. SD type is in `FULL_SEQUENCE_TYPES` (feature, bugfix, security, refactor, enhancement, performance)
2. SD has UI changes detected (via scope keywords or git diff)
3. AUTO-PROCEED is active

See `lib/utils/post-completion-requirements.js` for the logic.

### Timeouts and Limits

| Parameter | Value | Location |
|-----------|-------|----------|
| Vision QA timeout | 120,000ms (2 min) | `vision-qa-pipeline.js` |
| Max quick-fix cycles | 2 | `vision-qa-finding-router.js` |
| Critical confidence threshold | 0.85 | `vision-qa-finding-router.js` |
| Performance LCP threshold | 2,500ms | `vision-qa-finding-router.js` |
| Performance FCP threshold | 1,800ms | `vision-qa-finding-router.js` |

## Implementation Status

### Completed Integration (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001)

**Status**: ✅ Shipped and merged to main (PR #891)
**Completion Date**: 2026-02-06

#### Changes Delivered

**1. AUTO-PROCEED Integration** (`scripts/leo-continuous.js`):
- Added `vision-qa` commandMap entry pointing to `scripts/execute-vision-qa.js`
- Integrated UI-touching classifier into post-completion sequence
- Passes `hasUIChanges` boolean to determine if vision-qa step runs
- Conditional inclusion: only when `hasUIChanges=true` AND `autoProceed=true`

**2. Execution Wrapper** (`scripts/execute-vision-qa.js`):
- Finds active SD from database (via `is_working_on=true` or `--sd-id` flag)
- Calls `executeVisionQAPipeline(sd, {supabase, autoProceed: true})`
- Exits with code 0 (skip/clean-pass) or 1 (issues found)
- Handles Vision QA pipeline errors gracefully

**3. Unit Test Coverage** (106 tests, all passing):
- `tests/unit/testing/ui-touching-classifier.test.js` (33 tests)
  - File path pattern matching (UI vs backend detection)
  - Order insensitivity, edge cases, custom patterns
- `tests/unit/testing/vision-qa-finding-router.test.js` (25 tests)
  - Routing rules (critical+high-confidence → quick-fix)
  - Issue signature generation and deduplication
  - Boundary conditions at 0.85 confidence threshold
- `tests/unit/testing/post-completion-requirements.test.js` (48 tests)
  - Vision QA conditional logic (all 3 conditions tested)
  - Sequence ordering validation (restart → vision-qa → document → ship → learn)
  - Full vs minimal sequence type requirements

#### Post-Completion Sequence

The integrated sequence now runs:
```
SD completes EXEC phase
  -> /restart (servers)
  -> [vision-qa]  ← CONDITIONAL: only if hasUIChanges=true AND autoProceed=true
  -> /document
  -> /ship
  -> /learn
```

#### Test Execution

All tests run via:
```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/unit/testing/
```

Test results: 106 tests passed in 0.544s

#### Files Changed

| File | Lines Changed | Type |
|------|--------------|------|
| `scripts/leo-continuous.js` | +21, -5 | Modified |
| `scripts/execute-vision-qa.js` | +99 | New |
| `tests/unit/testing/ui-touching-classifier.test.js` | +255 | New |
| `tests/unit/testing/vision-qa-finding-router.test.js` | +203 | New |
| `tests/unit/testing/post-completion-requirements.test.js` | +291 | New |
| **Total** | **+869, -5** | **874 net** |

#### Verification

- ✅ ESLint passes (no new warnings from our changes)
- ✅ Smoke tests pass
- ✅ All 106 unit tests pass
- ✅ Pre-commit hooks pass (secret detection, LOC threshold warning acknowledged)
- ✅ PR #891 merged to main

#### Known Limitations

- Vision QA only runs when AUTO-PROCEED is active (not available in manual mode)
- UI-touching detection is file-path based (may miss UI work in backend files)
- 2-minute timeout per Vision QA cycle (may not catch all issues in large UIs)
- Max 2 quick-fix cycles per SD (prevents infinite loops)

#### Next Steps

Future enhancements could include:
- Manual `/vision-qa` command for non-AUTO-PROCEED sessions
- Configurable timeout per SD type
- Vision QA result caching to avoid re-running on unchanged UI
- Enhanced UI-touching classifier using AST analysis
