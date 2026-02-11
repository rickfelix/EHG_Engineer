# SD Review Triangulation Synthesis

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: api, unit, migration, schema

## Cross-AI Analysis: OpenAI + AntiGravity + Claude Code

**Date**: 2026-01-01
**Method**: Independent reviews with codebase access, then triangulation
**Status**: FINAL SYNTHESIS

---

## Executive Summary

All three AIs converged on a **CRITICAL FINDING**: The Genesis pipeline has **fundamental architectural issues** that must be resolved before proceeding. The system has "two parallel tracks" that don't connect.

### Consensus Completion Estimates

| SD | AntiGravity | OpenAI | Claude Code | **Consensus** |
|----|-------------|--------|-------------|---------------|
| SD-GENESIS-COMPLETE-001 | 30% | 40% | 35% | **~35%** |
| SD-VENTURE-SELECTION-001 | 60% | 60% | 55% | **~58%** |
| SD-BLIND-SPOTS-001 | 40% | 45% | 35% | **~40%** |

### Top 3 Blocking Issues (Unanimous)

1. **`generatePRD()` is STUBBED** - Returns hardcoded template, not LLM-generated
2. **Schema Mismatch** - Engineer DB vs EHG app DB have different columns for `simulation_sessions`
3. **Stage Vocabulary Collision** - "Stage 16/17" means different things in Genesis vs Venture Workflow

---

## 1. SD-GENESIS-COMPLETE-001: Consensus Analysis

### 1.1 What All Three AIs Confirmed EXISTS

| Component | AntiGravity | OpenAI | Claude | Status |
|-----------|-------------|--------|--------|--------|
| `genesis-pipeline.js` | ✅ | ✅ | ✅ | **EXISTS** |
| `soul-extractor.js` | ✅ | ✅ | ✅ | **EXISTS** |
| `production-generator.js` | ✅ | ✅ | ✅ | **EXISTS** |
| `ratify.ts` endpoint | ✅ | ✅ | ✅ | **EXISTS** |
| `simulation_sessions` table | ✅ | ✅ | ✅ | **EXISTS** |
| `CompleteWorkflowOrchestrator.tsx` | ✅ | ✅ | ✅ | **EXISTS** |

### 1.2 What All Three AIs Confirmed BROKEN

| Issue | AntiGravity | OpenAI | Claude | Verdict |
|-------|-------------|--------|--------|---------|
| `generatePRD()` stubbed | ✅ "hardcoded/mocked" | ✅ Line 190-212 cited | ✅ Returns template | **CRITICAL** |
| `production-generator` methods empty | ✅ Lines 443, 451 | ✅ Same file, same issue | ✅ Returns `[]` | **CRITICAL** |
| Stage 16/17 mismatch | ✅ "different systems" | ✅ "two stage vocabularies" | ✅ "different Stage 16/17" | **ARCHITECTURAL** |

### 1.3 Unique Findings

**OpenAI-only finding**: Schema mismatch risk
- Engineer migration doesn't include `updated_at`, `ratified_at`, `soul_extraction_id`
- `vercel-deploy.js` writes columns that don't exist in Engineer schema
- `epistemic_status: 'ratified'` not in Engineer check constraint

**Claude-only finding**: EVA event bus already has `CHAIRMAN_APPROVAL`, `STAGE_ENTERED` events - infrastructure exists but no ventures to manage

**AntiGravity-only finding**: Pattern dependency hell - generator assumes patterns are independent but React components share context providers

### 1.4 Recommended Priority (Triangulated)

| AI | Recommendation |
|----|----------------|
| AntiGravity | SD-GENESIS-PRD-001 + SD-GENESIS-STAGE16-17-001 are blockers |
| OpenAI | SD-GENESIS-DATAMODEL-001 first (schema alignment) |
| Claude | SD-GENESIS-PRD-001 first (LLM integration) |

**Synthesis**:
1. **SD-GENESIS-DATAMODEL-001** (schema alignment) - OpenAI's finding is correct; can't build on broken contract
2. **SD-GENESIS-PRD-001** (LLM integration) - Both AntiGravity and Claude agree this unblocks everything
3. Then proceed with other children

---

## 2. SD-VENTURE-SELECTION-001: Consensus Analysis

### 2.1 What EXISTS (Consensus)

| Component | Evidence |
|-----------|----------|
| ChairmanSettingsPage.tsx | 7 tabs, widget visibility, KPIs, alerts |
| Blueprint scoring service | Hardcoded weights in `blueprintScoring.ts` |
| Opportunity browse UI | `OpportunityBrowseTab.tsx` with selection flow |
| Pattern library | **45 patterns** (all three confirmed) |

### 2.2 Key Disagreement: Pattern Status

| Pattern | AntiGravity | OpenAI | Claude |
|---------|-------------|--------|--------|
| Stripe/Payment | "MISSING" | "not found" | **MISSING** |
| RBAC/Auth | Not mentioned | "EXISTS (Python middleware)" | **EXISTS** |
| useCRUD | Not mentioned | "not found as scaffold pattern" | **EXISTS** (CRUDService) |
| BackgroundJob | Not mentioned | "not found" | **MISSING** |

**Resolution**:
- RBAC exists in `agent-platform/app/middleware/rbac.py` (Python) - NOT a scaffold pattern
- CRUDService exists as scaffold pattern (Claude confirmed via DB query)
- **2 of 4 critical patterns MISSING**: Stripe, BackgroundJob

### 2.3 OpenAI-only Finding: DB Table Missing

```
useChairmanConfig queries `chairman_dashboard_config` and explicitly
falls back to localStorage if table doesn't exist (error code 42P01)
```

This is a significant finding - the "Chairman Settings" are not actually persisted to DB.

### 2.4 Recommended Priority (Triangulated)

1. **SD-VS-CHAIRMAN-SETTINGS-001** - Fix DB persistence first
2. **SD-VS-SCORING-RUBRIC-001** - Replace hardcoded weights
3. **SD-VS-PATTERN-UNLOCK-001** - Add Stripe + BackgroundJob patterns

---

## 3. SD-BLIND-SPOTS-001: Consensus Analysis

### 3.1 EVA Infrastructure (All Three Agree: Robust)

| Component | Evidence |
|-----------|----------|
| `evaEventBus.ts` | 764 lines, DLQ, retry, replay |
| `evaTaskContracts.ts` | Task contract system |
| `briefing.ts` API | Health + decisions + budget warnings |
| DB tables | `eva_events`, `eva_decisions`, `eva_ventures` |

**Consensus**: EVA core is **70% complete** but managing ventures that don't exist.

### 3.2 Non-EVA Blind Spots (All Three Agree: Minimal Progress)

| Blind Spot | Completion | Evidence |
|------------|------------|----------|
| Legal/Compliance | ~10% | ComplianceTab exists, no Series LLC logic |
| Pricing Patterns | ~30% | Stage15PricingStrategy exists |
| Failure Learning | ~5% | Empty `failure_patterns` table |
| Skills Inventory | ~5% | Empty `skills_inventory` table |
| Pattern Deprecation | ~0% | No lifecycle management found |

### 3.3 Critical Insight (Unanimous)

> "We have an Operating System (EVA) with no Apps (Ventures)" - AntiGravity
> "EVA without Ventures" - Claude
> "EVA OS slice is ahead; other blind spots lag" - OpenAI

**Synthesis**: Fix Genesis first. EVA is ready but idle.

---

## 4. Missing Considerations (Combined)

### From All Three AIs

| Issue | Source | Impact |
|-------|--------|--------|
| RBAC on Genesis endpoints | All three | Security risk - anyone could create ventures |
| Schema drift between repos | OpenAI | Silent failures in production |
| Pattern dependency resolution | AntiGravity | Generator assumes independence |
| Simulation data migration | Claude | User test data lost on soul extraction |
| Two stage vocabularies | All three | Confusion between Genesis and Venture stages |

### New Insight from OpenAI (Not in SDs)

**`vercel-deploy.js` writes fields that don't exist:**
- `vercel_deployment_id`
- `deployed_at`
- `deployment_error`
- `epistemic_status: 'deployment_failed'`

These will silently fail or create inconsistent state.

---

## 5. User Story Synthesis (Best from Each AI)

### SD-GENESIS-PRD-001

**Best Story (AntiGravity)**:
> As a Solo Operator, I want to input a raw specific idea (e.g., "Uber for Dog Walking") and receive a structured PRD, so that I don't have to write requirements manually.

**Best Acceptance Criteria (OpenAI)**:
- PRD includes user flows, data model, API contracts, and acceptance criteria
- Provider abstraction exists (OpenAI/Gemini pluggable)
- PRD quality scoring before scaffolding (rubric)

### SD-VS-CHAIRMAN-SETTINGS-001

**Best Story (Claude)**:
> As the Chairman, I want to set Maximum Concurrent Ventures, so that EVA doesn't recommend new ventures when I'm at capacity.

**Best Acceptance Criteria (OpenAI)**:
- DB-backed configuration, not localStorage fallback
- Weights are stored per user/company
- Typed settings contract shared between frontend and backend

### SD-EVA-DASHBOARD-001

**Best Story (All three converged)**:
> As the Chairman, I want a 32-tile grid showing all ventures with traffic light colors (Green/Yellow/Red), so that I can see portfolio health at a glance.

**Best Acceptance Criteria (OpenAI)**:
- Health calculated every 15 minutes
- State changes trigger EVA events
- Clicking tile opens venture context + next actions

---

## 6. Final Priority Matrix (Triangulated)

| Rank | SD | Rationale |
|------|-----|-----------|
| **1** | SD-GENESIS-DATAMODEL-001 | OpenAI found schema drift - must fix contract first |
| **2** | SD-GENESIS-PRD-001 | All three: LLM integration unblocks factory |
| **3** | SD-GENESIS-STAGE16-17-001 | Completes regeneration path |
| **4** | SD-VS-CHAIRMAN-SETTINGS-001 | DB persistence fix (localStorage is a bug) |
| **5** | SD-VS-PATTERN-UNLOCK-001 | Stripe + BackgroundJob for vending machine model |
| **6** | SD-EVA-DASHBOARD-001 | Health grid for 32-venture visibility |
| **7** | SD-VS-SCORING-RUBRIC-001 | Replace hardcoded weights |
| **8** | All other blind spots | Leverage multipliers after core works |

---

## 7. Action Items to Incorporate into SDs

### Immediate Corrections

1. **Add SD-GENESIS-DATAMODEL-001 details**:
   - Align `simulation_sessions` columns: `updated_at`, `ratified_at`, `soul_extraction_id`, `vercel_deployment_id`, `deployed_at`, `deployment_error`
   - Expand `epistemic_status` enum: add `ratified`, `rejected`, `deployment_failed`
   - Document which DB is authoritative (Engineer vs EHG app)

2. **Clarify SD-GENESIS-STAGE16-17-001**:
   - Explicitly state: Genesis "Stage 16/17" ≠ Venture Workflow "Stage 16/17"
   - Genesis stages are: soul extraction → production generation
   - Venture stages are: AI CEO Agent → GTM Strategy

3. **Update SD-VS-CHAIRMAN-SETTINGS-001**:
   - Note: `chairman_dashboard_config` table appears MISSING
   - Current code falls back to localStorage
   - First task: Create DB migration for the table

4. **Add security requirement to SD-GENESIS-COMPLETE-001**:
   - `/api/genesis/ratify` needs authentication
   - All Genesis endpoints need Supabase RLS

5. **Update pattern requirements in SD-VS-PATTERN-UNLOCK-001**:
   - CRUDService exists (confirmed)
   - AuthService/AuthMiddleware exists (confirmed)
   - **MISSING**: StripeService, BackgroundJob patterns

---

## 8. Recommendations for Next Steps

### Option A: Fix Foundation First (Recommended)
1. Create schema alignment migration (1-2 days)
2. Implement LLM PRD generation (2-3 days)
3. Fix Chairman Settings DB (1 day)
4. Then proceed with UI and automation

### Option B: Parallel Tracks
- Track 1: Genesis data model + PRD (backend)
- Track 2: Chairman Settings + Scoring (UI)
- Track 3: EVA Dashboard (UI)

### What NOT to Do
- Don't wire Stage 16/17 until vocabulary is clarified
- Don't build more EVA features until Genesis produces ventures
- Don't add patterns until scoring uses them

---

## 9. Consensus Verdict

**The SDs are directionally correct but contain incorrect assumptions about completion state.**

Reality:
- Genesis is ~35% complete (not 45-50%)
- The "wiring" problem is actually an "architecture" problem
- EVA is ready but waiting for ventures to manage
- Chairman Settings need DB table created first

**Recommendation**: Create a "pre-flight checklist" SD (SD-GENESIS-PREFLIGHT-001) that addresses schema alignment, stage vocabulary, and security before proceeding with implementation SDs.

---

*Triangulation completed: 2026-01-01*
*Sources: OpenAI GPT-4, AntiGravity (Gemini), Claude Code (Opus 4.5)*
*Method: Independent codebase exploration + synthesis*
