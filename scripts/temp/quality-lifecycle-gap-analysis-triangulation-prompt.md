# Quality Lifecycle System - Ground-Truth Gap Analysis

## Purpose
Audit the Quality Lifecycle System implementation against the vision document to identify gaps using the Ground-Truth Triangulation Protocol.

## Vision Document Reference
`docs/vision/quality-lifecycle-system.md` (1170 lines, validated by 4 rounds of triangulation on 2026-01-17)

---

## Your Task

Analyze the Quality Lifecycle System implementation status. For each component, classify as:

| Status | Definition | Evidence Required |
|--------|------------|-------------------|
| **WORKS** | Code exists + integrated + has user entry point | API route, UI button, or CLI command that triggers it |
| **DISCONNECTED** | Code exists but no integration path | Function defined but never called by production code |
| **STUBBED** | Function exists but returns placeholder | TODO comments, hardcoded returns, empty implementations |
| **PLANNED** | Mentioned in docs but no code | Only appears in .md files, comments, or setup scripts |
| **MISSING** | Not found anywhere | No file, no function, no mention |

---

## Ground-Truth Evidence (Pre-Gathered by Claude Code)

### Database Layer

| Component | Status | Evidence |
|-----------|--------|----------|
| `feedback` table | **WORKS** | `docs/reference/schema/engineer/tables/feedback.md` - 42 columns, 0 rows, RLS enabled, all indexes present |
| `feedback_sd_map` table | **WORKS** | `docs/reference/schema/engineer/tables/feedback_sd_map.md` - FK to feedback & strategic_directives_v2, 0 rows |
| `releases` table | **WORKS** | `database/migrations/391_quality_lifecycle_schema.sql:148` - CREATE TABLE IF NOT EXISTS releases |

### CLI Commands

| Component | Status | Evidence |
|-----------|--------|----------|
| `/inbox` command spec | **PLANNED** | `.claude/commands/inbox.md` exists (283 lines) - BUT this is documentation/spec only |
| `/inbox` skill implementation | **MISSING** | `.claude/skills/inbox.md` does NOT exist - command is not functional |
| `/feedback` alias | **PLANNED** | Mentioned in inbox.md spec but not implemented |
| `/issues` alias | **PLANNED** | Mentioned in inbox.md spec but not implemented |

### Error Capture

| Component | Status | Evidence |
|-----------|--------|----------|
| Error capture library | **WORKS** | `lib/feedback-capture.js` (234 lines) - `captureError()`, `initializeErrorHandlers()`, deduplication |
| Uncaught exception handler | **WORKS** | `lib/feedback-capture.js:165` - `process.on('uncaughtException')` |
| Unhandled rejection handler | **WORKS** | `lib/feedback-capture.js:183` - `process.on('unhandledRejection')` |
| Deduplication logic | **WORKS** | `lib/feedback-capture.js:33` - `checkDuplicate()` with 5-minute window |

### Triage & Prioritization (lib/quality/)

| Component | Status | Evidence |
|-----------|--------|----------|
| Priority calculator | **DISCONNECTED** | `lib/quality/priority-calculator.js` - exports `calculatePriority()` but no caller found |
| Burst detector | **DISCONNECTED** | `lib/quality/burst-detector.js` - exports `detectBursts()` but no caller found |
| Snooze manager | **DISCONNECTED** | `lib/quality/snooze-manager.js` - exists but no production integration |
| Focus filter | **DISCONNECTED** | `lib/quality/focus-filter.js` - exists but no production integration |
| Ignore patterns | **DISCONNECTED** | `lib/quality/ignore-patterns.js` - exists but no production integration |
| Index/exports | **WORKS** | `lib/quality/index.js` - proper ESM exports for all modules |

### UAT Integration

| Component | Status | Evidence |
|-----------|--------|----------|
| UAT → Feedback integration | **WORKS** | `lib/uat/result-recorder.js:224` - Writes to `feedback` table on test failure |
| Risk router | **EXISTS** | `lib/uat/risk-router.js` - References feedback |

### Web UI (Located in EHG Repository, NOT EHG_Engineer)

| Component | Status | Evidence |
|-----------|--------|----------|
| `/quality` section | **WORKS** | `EHG/src/pages/quality/` - 4 page components |
| Feedback widget | **WORKS** | `EHG/src/components/quality/FeedbackWidget.tsx` (307 lines) - FAB + modal |
| Inbox view | **WORKS** | `EHG/src/pages/quality/QualityInboxPage.tsx` (358 lines) - filters, Needs Attention |
| Backlog view | **WORKS** | `EHG/src/pages/quality/QualityBacklogPage.tsx` (290 lines) - Kanban board |
| Releases view | **WORKS** | `EHG/src/pages/quality/QualityReleasesPage.tsx` (349 lines) - timeline + progress |
| Patterns view | **WORKS** | `EHG/src/pages/quality/QualityPatternsPage.tsx` (392 lines) - ignore patterns |
| Route registration | **WORKS** | `EHG/src/routes/qualityRoutes.tsx` - all 4 routes registered |
| Detail panel | **WORKS** | `EHG/src/components/quality/FeedbackDetailPanel.tsx` - slide-over |

**Commit**: `ad463824` - "feat(quality): implement Quality Lifecycle UI (SD-QUALITY-UI-001)"

---

## Questions for Triangulation

### 1. Feature Completeness Assessment

For each phase from the vision, assess implementation completeness:

| Phase | Vision Description | Your Assessment |
|-------|-------------------|-----------------|
| **Stage 1: Prevention** | PRDs, User Stories, Acceptance Criteria | (Existing - not part of Quality Lifecycle) |
| **Stage 2: Capture** | `/inbox new`, Error capture, `/uat` integration | ? |
| **Stage 3: Triage** | Priority calc, AI triage, Snooze, Burst grouping | ? |
| **Stage 4: Resolution** | `/inbox` view, `/quick-fix`, Full SD | ? |
| **Stage 5: Learning** | `issue_patterns`, `/learn` | (Existing - not part of Quality Lifecycle) |

### 2. Integration Gap Analysis

The vision specifies these integration points:

| Integration | Vision Requirement | Current State |
|-------------|-------------------|---------------|
| `/uat` failures → `feedback` table | Auto-create feedback on FAIL | ? |
| `/inbox` → view/manage feedback | CLI interface for triage | ? |
| Web UI → report feedback | FAB + form in EHG app | ? |
| `feedback` → SD creation | Link feedback to SDs via `feedback_sd_map` | ? |
| Multi-venture support | `source_application` field routing | ? |

### 3. Child SD Completion Status

The vision defines 5 child SDs. Assess each:

| SD | Vision Scope | Implementation Status | Evidence |
|----|-------------|----------------------|----------|
| SD-QUALITY-DB-001 | Database Foundation | ? | Tables exist? Indexes? RLS? |
| SD-QUALITY-CLI-001 | `/inbox` CLI Command | ? | Command works end-to-end? |
| SD-QUALITY-TRIAGE-001 | Triage & Prioritization | ? | `lib/quality/*` integrated? |
| SD-QUALITY-UI-001 | `/quality` Web Section | ? | UI routes exist? |
| SD-QUALITY-INT-001 | System Integrations | ? | Error capture, UAT hooks work? |

---

## Output Format Required

Please provide:

### 1. Component Status Table

| Component | Claimed Status | Your Assessment | Evidence File:Line | Entry Point |
|-----------|---------------|-----------------|-------------------|-------------|
| feedback table | WORKS | ? | ? | ? |
| /inbox command | PLANNED | ? | ? | ? |
| ... | ... | ... | ... | ... |

### 2. Gap Summary

```markdown
## Critical Gaps (Blocking User Value)
1. [Gap description]
   - Vision requirement: ...
   - Current state: ...
   - Impact: ...

## Partial Implementations (Exist but Disconnected)
1. [Component]
   - Code location: ...
   - Missing integration: ...

## Future Work (Not Started)
1. [Component]
   - Vision phase: ...
```

### 3. Recommendation

Based on your analysis:
- Which child SD should be prioritized next?
- Are there any "quick wins" (DISCONNECTED → WORKS with small effort)?
- Are there any scope risks in the vision vs. current state?

---

# GPT-5.2 Gap Analysis (Ground-Truth Evidence)

### 1. Component Status Table

| Component | Claimed Status | Your Assessment | Evidence File:Line | Entry Point |
|-----------|---------------|-----------------|-------------------|-------------|
| feedback table | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/components/quality/FeedbackWidget.tsx:L74-L90` | UI submit via `FeedbackWidget` (FAB) |
| feedback_sd_map table | WORKS | **PLANNED** | *(schema-only; no runtime usage found)* | None |
| releases table | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/pages/quality/QualityReleasesPage.tsx:L63-L87` | `/quality/releases` view |
| `/inbox` command | PLANNED | **PLANNED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/commands/inbox.md` | Spec only (no skill) |
| `/inbox` skill implementation | MISSING | **MISSING** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/skills/` (no inbox.md) | None |
| `/feedback` alias | PLANNED | **PLANNED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/commands/feedback.md` | Spec only |
| `/issues` alias | PLANNED | **PLANNED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/.claude/commands/inbox.md` | Spec only |
| Error capture library | WORKS | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/feedback-capture.js:L153-L205` | No production caller found |
| Uncaught exception handler | WORKS | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/feedback-capture.js:L164-L193` | No initialization call found |
| Unhandled rejection handler | WORKS | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/feedback-capture.js:L182-L193` | No initialization call found |
| Deduplication logic | WORKS | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/feedback-capture.js:L33-L45` | No production caller found |
| UAT → feedback integration | WORKS | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/uat/result-recorder.js:L222-L244` | Exposed via `lib/uat/index.js` but no caller found |
| Risk router | EXISTS | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/uat/risk-router.js:L115-L189` | No production caller found |
| Priority calculator | DISCONNECTED | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/quality/priority-calculator.js:L151-L218` | No production caller found |
| Burst detector | DISCONNECTED | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/quality/burst-detector.js:L76-L187` | No production caller found |
| Snooze manager | DISCONNECTED | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/quality/snooze-manager.js:L70-L181` | No production caller found |
| Focus filter | DISCONNECTED | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/quality/focus-filter.js:L69-L73` | No production caller found |
| Ignore patterns | DISCONNECTED | **DISCONNECTED** | `C:/Users/rickf/Projects/_EHG/EHG_Engineer/lib/quality/ignore-patterns.js:L1-L120` | No production caller found |
| `/quality` inbox view | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/routes/qualityRoutes.tsx:L33-L56` | `/quality` and `/quality/inbox` routes |
| `/quality` backlog view | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/routes/qualityRoutes.tsx:L62-L76` | `/quality/backlog` route |
| `/quality` releases view | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/routes/qualityRoutes.tsx:L77-L90` | `/quality/releases` route |
| `/quality` patterns view | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/routes/qualityRoutes.tsx:L92-L105` | `/quality/patterns` route |
| Feedback widget (FAB) | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/components/layout/AuthenticatedLayout.tsx:L103-L104` | App layout renders widget |
| Feedback submission | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/components/quality/FeedbackWidget.tsx:L73-L90` | FAB modal submit |
| Detail panel | WORKS | **WORKS** | `C:/Users/rickf/Projects/_EHG/ehg/src/pages/quality/QualityInboxPage.tsx:L31-L110` | Inbox row click |

### 2. Gap Summary

```markdown
## Critical Gaps (Blocking User Value)
1. /inbox CLI command is not functional
   - Vision requirement: /inbox new, /inbox, triage actions via CLI
   - Current state: only command specs exist; no skill implementation
   - Impact: CLI workflow is blocked; capture/triage from terminal impossible

2. Triage & prioritization engine is not connected
   - Vision requirement: priority calc, snooze, burst grouping, ignore patterns
   - Current state: lib/quality/* modules exist but have no production callers
   - Impact: inbox volume control, prioritization, and snooze logic are not active

3. Error capture is not initialized anywhere
   - Vision requirement: auto-capture runtime errors into feedback
   - Current state: feedback-capture module exists, but no initialization found
   - Impact: system does not auto-populate feedback from runtime errors

## Partial Implementations (Exist but Disconnected)
1. UAT → feedback integration
   - Code location: lib/uat/result-recorder.js
   - Missing integration: no caller importing lib/uat/index.js in production flow

2. Risk router
   - Code location: lib/uat/risk-router.js
   - Missing integration: no caller or CLI entry point

3. feedback_sd_map junction table
   - Code location: schema only (migration), no runtime usage
   - Missing integration: feedback → SD creation/linking pipeline

## Future Work (Not Started)
1. /inbox CLI skill
   - Vision phase: Capture + Resolution

2. AI triage / burst grouping automation
   - Vision phase: Triage
```

### 3. Recommendation

- **Prioritize next SD:** `SD-QUALITY-CLI-001` (unblocks all CLI workflows and capture/triage loop)
- **Quick wins:** Wire `lib/quality/*` into the UI query flow or a service layer; initialize `lib/feedback-capture` in a production entry point
- **Scope risks:** Vision assumes multi-venture routing, but `FeedbackWidget` does not set `venture_id`; UI filters exist but depend on missing data


## Do NOT Trust as Implementation Evidence

Per Ground-Truth Protocol:
- `/docs/*` - Documentation only
- `**/create-*.js` - SD creation scripts
- `**/setup-*.js` - Setup scripts
- `**/vision/*.md` - Vision documents
- `.claude/commands/*.md` - Command SPECS, not implementations
- `database/migrations/*.sql` - Schema only (not business logic)
- `*.test.ts, *.spec.ts` - Tests ≠ implementation

---

## Verification Commands (for Claude Code to run if disputed)

### EHG_Engineer Repository (Backend/Tooling)
```bash
cd C:/_EHG/EHG_Engineer

# Check if feedback table has rows
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY); s.from('feedback').select('count').then(r=>console.log(r))"

# Check if /inbox skill exists
ls -la .claude/skills/inbox.md

# Check if lib/quality modules are imported anywhere
grep -r "from.*lib/quality" --include="*.js" --include="*.ts" | grep -v "node_modules" | grep -v ".test."

# Check if feedback-capture is used anywhere
grep -r "feedback-capture\|initializeErrorHandlers" --include="*.js" --include="*.ts" | grep -v "node_modules"
```

### EHG Repository (Frontend UI) - CRITICAL FOR UI COMPONENTS
```bash
cd C:/_EHG/EHG

# Check if quality UI routes exist (CORRECT PATH)
ls -la src/pages/quality/
ls -la src/components/quality/

# Check route registration
cat src/routes/qualityRoutes.tsx

# Check recent Quality UI commits
git log --oneline -10 -- "src/pages/quality" "src/components/quality"

# Check FeedbackWidget integration
grep -r "FeedbackWidget" --include="*.tsx" src/
```

---

## CRITICAL: Multi-Repository Architecture

**This system spans TWO repositories. Evidence must be gathered from BOTH:**

| Repository | Purpose | Location | Contains |
|------------|---------|----------|----------|
| **EHG** | Frontend (React/Vite) | `C:/_EHG/EHG/` | UI components, pages, routes |
| **EHG_Engineer** | Backend/Tooling | `C:/_EHG/EHG_Engineer/` | CLI tools, scripts, lib modules |

### Component → Repository Mapping

| Component Type | Expected Repository | Path Pattern |
|----------------|---------------------|--------------|
| Web UI pages | **EHG** | `src/pages/quality/*.tsx` |
| React components | **EHG** | `src/components/quality/*.tsx` |
| Routes | **EHG** | `src/routes/qualityRoutes.tsx` |
| CLI commands/skills | **EHG_Engineer** | `.claude/skills/*.md` |
| Library modules | **EHG_Engineer** | `lib/quality/*.js` |
| Database migrations | **EHG_Engineer** | `database/migrations/*.sql` |

**FAILURE MODE TO AVOID**: Claiming UI is "MISSING" when only checking EHG_Engineer repo.

---

## Context for External AI Reviewers

This prompt is designed for triangulation with external AIs (OpenAI GPT-4o, Gemini).

**Instructions for external reviewers:**
1. Review the Ground-Truth Evidence section carefully
2. Do NOT assume documentation = implementation
3. Focus on ENTRY POINTS - can a user actually trigger each feature?
4. Trace CALL CHAINS - does code connect from entry to implementation?
5. Be skeptical of "exists" claims - verify integration
6. **CRITICAL: Check BOTH repositories** - UI is in EHG, tooling is in EHG_Engineer

**Expected disagreement areas:**
- Whether `lib/quality/*` modules are "WORKS" or "DISCONNECTED"
- Whether command specs count as implementation
- Completeness of database layer (tables exist but are empty)
- **Cross-repo integration** (frontend calling backend APIs)

---

## Pre-Analysis Summary (Claude Code Assessment) - CORRECTED

Based on ground-truth evidence gathering **from BOTH repositories**, here's the corrected assessment:

### Child SD Status

| SD | Status | Rationale |
|----|--------|-----------|
| **SD-QUALITY-DB-001** | **COMPLETE** | All 3 tables exist (`feedback`, `feedback_sd_map`, `releases`), RLS policies, indexes |
| **SD-QUALITY-CLI-001** | **NOT STARTED** | Command spec exists but NO skill implementation - `/inbox` doesn't work |
| **SD-QUALITY-TRIAGE-001** | **PARTIAL** | All 5 modules exist in `lib/quality/` but are DISCONNECTED (no callers) |
| **SD-QUALITY-UI-001** | **COMPLETE** | Full implementation in EHG repo - 4 pages, FAB widget, detail panel (commit ad463824) |
| **SD-QUALITY-INT-001** | **PARTIAL** | Error capture WORKS, UAT integration WORKS, but not all integrations complete |

### Overall Completion Estimate

```
Database (SD-QUALITY-DB-001):     ████████████████████ 100%
CLI (SD-QUALITY-CLI-001):         ░░░░░░░░░░░░░░░░░░░░   5% (spec only)
Triage (SD-QUALITY-TRIAGE-001):   ██████████░░░░░░░░░░  50% (code exists, not integrated)
UI (SD-QUALITY-UI-001):           ██████████████████░░  90% (EHG repo)
Integration (SD-QUALITY-INT-001): ████████████░░░░░░░░  60% (error capture + UAT work)

OVERALL:                          ████████████░░░░░░░░  ~60%
```

### Priority Recommendation

1. **SD-QUALITY-CLI-001** - Implement `/inbox` skill (enables all CLI workflows)
2. **SD-QUALITY-TRIAGE-001** - Wire up existing `lib/quality/*` modules (quick win)
3. **SD-QUALITY-INT-001** - Complete remaining integrations

### Lesson Learned (Multi-Repo Blindness)

Initial assessment claimed SD-QUALITY-UI-001 was 0% when it was actually 90% complete. The UI implementation exists in the **EHG repository** (frontend), not EHG_Engineer. Always verify BOTH repositories when assessing full-stack features.
