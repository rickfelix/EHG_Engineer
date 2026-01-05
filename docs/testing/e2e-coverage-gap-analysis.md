# E2E Testing Coverage Gap Analysis
**Generated**: 2026-01-05
**Application**: EHG_Engineer (Backend API - Port 3000)
**Testing Agent**: QA Engineering Director

## Executive Summary

This document identifies E2E testing coverage gaps in the EHG_Engineer backend API. The application serves **73 unique API endpoints** across multiple functional domains. Current test coverage exists for **~25%** of endpoints, leaving **~75% UNTESTED**.

### Critical Findings
- **ZERO coverage** for 10+ high-value API endpoint groups
- **Authentication/Authorization flows** partially covered
- **Venture lifecycle APIs** have basic coverage only
- **Real-time features** (WebSocket) completely untested
- **Marketing automation** recently added (SD-MARKETING-AUTOMATION-001) but untested

---

## Application Architecture Context

### Tech Stack
- **Backend**: Express.js + Node.js (ES Modules)
- **Database**: Supabase (PostgreSQL)
- **API Port**: 3000
- **Frontend**: Separate unified app at port 8080 (EHG)
- **Testing Framework**: Playwright (E2E), Jest (Unit/Integration)

### API Structure
The server exposes multiple API groups:
1. **LEO Protocol APIs** - Strategic directives, PRDs, execution sequences
2. **SDIP (Directive Lab)** - Chairman input processing
3. **Venture Management** - CRUD, artifacts, lifecycle stages
4. **AI Engines** - Naming, Financial, Content Forge
5. **Discovery & Research** - Competitor analysis, opportunity discovery
6. **Testing Campaign** - Automated testing orchestration
7. **Marketing Distribution** - Multi-channel distribution (NEW - SD-MARKETING-AUTOMATION-001)
8. **Calibration & Quality** - EVA scoring, integrity metrics
9. **Story Management** - User story generation, verification

---

## Coverage Matrix

### Legend
- ✅ **COVERED** - Automated E2E test exists
- ⚠️ **PARTIAL** - Some scenarios tested, gaps remain
- ❌ **MISSING** - No E2E coverage
- 🔴 **CRITICAL** - High-priority gap (core business logic)
- 🟡 **MEDIUM** - Medium-priority gap
- 🟢 **LOW** - Low-priority gap

---

## 1. SDIP (Directive Lab) APIs

### Coverage Status: ⚠️ PARTIAL

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/sdip/submit` | POST | ❌ | 🔴 | Chairman idea submission (7-step flow) |
| `/api/sdip/submissions/:id/step/:stepNumber` | PUT | ❌ | 🔴 | Step-by-step data updates |
| `/api/sdip/submissions` | GET | ❌ | 🟡 | List recent submissions |
| `/api/sdip/submissions/:id` | DELETE | ❌ | 🟢 | Cleanup test data |
| `/api/sdip/screenshot` | POST | ❌ | 🟢 | Screenshot upload |
| `/api/sdip/progress/:id` | GET | ❌ | 🟡 | Progress tracking |
| `/api/sdip/create-strategic-directive` | POST | ❌ | 🔴 | Convert submission to SD |

**Rationale for Priority**:
- SDIP is the **primary entry point** for Chairman strategic input
- 7-step flow includes AI enhancement, codebase analysis, decision questions
- No E2E validation of end-to-end workflow
- **Risk**: Breaking changes could block Chairman ability to create SDs

**Test Scenarios Needed**:
1. Complete 7-step submission flow (Chairman journey)
2. AI enhancement background processing
3. Create SD from approved submission
4. Submission state management (pending → in_progress → submitted)
5. Error handling (invalid steps, missing required fields)

---

## 2. Backlog & Strategic Directives

### Coverage Status: ⚠️ PARTIAL

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/sd` | GET | ⚠️ | 🟡 | List all SDs (basic coverage in `strategic-directives-crud.spec.ts`) |
| `/api/sd/:id` | GET | ⚠️ | 🟡 | Get single SD (basic coverage) |
| `/api/backlog/strategic-directives` | GET | ❌ | 🔴 | Backlog filtering (tier, page, priority) |
| `/api/backlog/strategic-directives-with-items` | GET | ❌ | 🔴 | SDs with backlog items (optimized query) |
| `/api/backlog/strategic-directives/:sd_id` | GET | ❌ | 🟡 | SD detail with backlog |
| `/api/strategic-directives/:sd_id/backlog-summary` | GET | ❌ | 🔴 | AI-generated backlog summary |

**Rationale for Priority**:
- Backlog APIs power the **execution queue** and **priority management**
- AI backlog summaries are cached and affect decision-making
- No validation of filtering logic (must_have_pct, rolled_triage)
- **Risk**: Wrong SDs appear in queue, incorrect priority ordering

**Test Scenarios Needed**:
1. Filter by tier (Tier 1, Tier 2, Tier 3)
2. Filter by page_title (Group SDs by product area)
3. Filter by must_have_pct (≥70%, ≥50%)
4. AI backlog summary generation (OpenAI integration)
5. Cache invalidation (force_refresh parameter)

---

## 3. Venture Management APIs

### Coverage Status: ⚠️ PARTIAL

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/ventures` | GET | ⚠️ | 🟡 | Basic listing in `ventures.spec.js` |
| `/api/ventures` | POST | ⚠️ | 🔴 | Create venture (raw_chairman_intent capture) |
| `/api/ventures/:id` | GET | ❌ | 🟡 | Get single venture |
| `/api/ventures/:id/artifacts` | GET | ❌ | 🔴 | Stage artifacts (25-stage lifecycle) |
| `/api/ventures/:id/artifacts` | POST | ❌ | 🔴 | Create/update artifacts |
| `/api/ventures/:id/stage` | PATCH | ❌ | 🔴 | Update lifecycle stage (1-25) |

**Rationale for Priority**:
- Venture APIs are **core to the 25-stage lifecycle**
- Artifacts track deliverables across stages
- IDEATION-GENESIS-AUDIT requires `raw_chairman_intent` immutability
- **Risk**: Data corruption, lost Chairman intent, invalid stage transitions

**Test Scenarios Needed**:
1. Create venture with all origin types (manual, competitor_clone, ai_generated)
2. Stage progression (1 → 2 → 3, validate constraints)
3. Artifact versioning (is_current flag, version incrementing)
4. Artifact retrieval by stage and type
5. Immutability of raw_chairman_intent field

---

## 4. Competitor Analysis & Discovery

### Coverage Status: ❌ MISSING

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/competitor-analysis` | POST | ❌ | 🔴 | Real-time competitor intelligence |
| `/api/discovery/scan` | POST | ❌ | 🔴 | AI opportunity discovery |
| `/api/discovery/opportunities` | GET | ❌ | 🟡 | List opportunities (green/yellow/red box) |
| `/api/discovery/scans` | GET | ❌ | 🟢 | Recent discovery scans |
| `/api/discovery/decision` | POST | ❌ | 🔴 | Chairman approve/reject blueprint |
| `/api/blueprints` | GET | ❌ | 🟡 | Opportunity blueprints |
| `/api/blueprints/:id` | GET | ❌ | 🟢 | Single blueprint |

**Rationale for Priority**:
- **Zero coverage** for entire research/discovery subsystem
- Competitor analysis uses real web scraping + LLM analysis
- Four-Buckets Framework (Facts, Assumptions, Simulations, Unknowns)
- Chairman decision workflow affects venture creation pipeline
- **Risk**: Silent failures in scraping, poor LLM prompts, broken approvals

**Test Scenarios Needed**:
1. Competitor URL analysis (live website)
2. Four-Buckets quality scoring
3. Opportunity box classification (green/yellow/red)
4. Chairman approval workflow (pending → approved → venture creation)
5. Fallback behavior when scraping fails

---

## 5. AI Engines (Naming, Financial, Content)

### Coverage Status: ❌ MISSING (CRITICAL)

### 5.1 Naming Engine (SD-NAMING-ENGINE-001)

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/v2/naming-engine/generate` | POST | ❌ | 🔴 | LLM-powered name generation |
| `/api/v2/naming-engine/suggestions/:brand_genome_id` | GET | ❌ | 🟡 | Saved suggestions |

### 5.2 Financial Engine (SD-FINANCIAL-ENGINE-001)

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/v2/financial-engine/project` | POST | ❌ | 🔴 | Create financial projection |
| `/api/v2/financial-engine/:id` | GET | ❌ | 🟡 | Get projection |
| `/api/v2/financial-engine/:id/scenario` | POST | ❌ | 🔴 | Create scenario analysis |
| `/api/v2/financial-engine/:id/export` | GET | ❌ | 🟢 | Export to Excel |
| `/api/v2/financial-engine/list/:venture_id` | GET | ❌ | 🟢 | List models |

### 5.3 Content Forge (SD-CONTENT-FORGE-IMPL-001)

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/v2/content-forge/generate` | POST | ❌ | 🔴 | LLM content generation |
| `/api/v2/content-forge/list` | GET | ❌ | 🟡 | List generated content |
| `/api/v2/content-forge/compliance-check` | POST | ❌ | 🔴 | Brand compliance validation |
| `/api/v2/brand-genome/:id` | GET | ❌ | 🟡 | Brand genome retrieval |

**Rationale for Priority**:
- **Zero coverage** for all three AI engines
- Critical for venture execution (naming, financials, marketing)
- LLM integrations can fail silently (API errors, prompt drift)
- **Risk**: Poor quality outputs, compliance violations, cost overruns

**Test Scenarios Needed (All Engines)**:
1. LLM integration (API key validation, error handling)
2. Input validation (venture_id, brand_genome_id)
3. Quality scoring logic
4. Database persistence (saved suggestions, projections, content)
5. Scenario analysis (Financial Engine)
6. Brand compliance checks (Content Forge)

---

## 6. Marketing Distribution (NEW - CRITICAL GAP)

### Coverage Status: ✅ COVERED (Excellent!)

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/v2/marketing/channels` | GET | ✅ | 🔴 | Covered in `marketing-distribution.spec.ts` |
| `/api/v2/marketing/queue` | POST | ✅ | 🔴 | Covered |
| `/api/v2/marketing/queue/:venture_id` | GET | ✅ | 🔴 | Covered |
| `/api/v2/marketing/queue/:id/review` | PUT | ✅ | 🔴 | Covered |
| `/api/v2/marketing/distribute/:id` | POST | ✅ | 🔴 | Covered |
| `/api/v2/marketing/history/:venture_id` | GET | ✅ | 🟡 | Covered |

**Notes**:
- **EXCELLENT COVERAGE** - Full test suite exists
- Implements SD-MARKETING-AUTOMATION-001
- Tests validation, approval workflow, distribution, history
- **Model for other API groups** - comprehensive, well-structured

---

## 7. Testing Campaign APIs

### Coverage Status: ❌ MISSING

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/testing/campaign/status` | GET | ❌ | 🔴 | Real-time campaign status |
| `/api/testing/campaign/health` | GET | ❌ | 🔴 | Heartbeat monitoring |
| `/api/testing/campaign/apps` | GET | ❌ | 🟡 | SD counts by app |
| `/api/testing/campaign/start` | POST | ❌ | 🔴 | Start testing campaign |
| `/api/testing/campaign/stop` | POST | ❌ | 🔴 | Stop running campaign |
| `/api/testing/campaign/logs/:type` | GET | ❌ | 🟢 | Progress/error logs |

**Rationale for Priority**:
- **Zero coverage** for automated testing orchestration
- Used by QA Director to run batch tests across SDs
- File-based state management (/tmp/campaign-heartbeat.txt)
- Process lifecycle management (spawn, SIGTERM handling)
- **Risk**: Zombie processes, file corruption, incorrect status reporting

**Test Scenarios Needed**:
1. Start campaign (EHG vs EHG_Engineer)
2. Monitor heartbeat (file updates, PID validation)
3. Stop campaign (graceful shutdown)
4. Checkpoint recovery (resume after failure)
5. Concurrent campaign prevention

---

## 8. Story Management APIs

### Coverage Status: ⚠️ PARTIAL

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/stories/generate` | POST | ❌ | 🔴 | Generate stories from PRD |
| `/api/stories` | GET | ❌ | 🟡 | List stories (with filters) |
| `/api/stories/verify` | POST | ❌ | 🔴 | CI webhook (story verification) |
| `/api/stories/gate` | GET | ❌ | 🔴 | Release gate status |
| `/api/stories/health` | GET | ❌ | 🟢 | Feature flags, DB health |

**Rationale for Priority**:
- Story generation is **required for release gates**
- CI integration (GitHub Actions webhook)
- Feature flag gating (FEATURE_AUTO_STORIES)
- **Risk**: Release gates fail silently, stories not generated

**Test Scenarios Needed**:
1. Generate stories from PRD (dry_run, create, upsert modes)
2. List stories with status filters (passing, failing, not_run)
3. CI webhook (verify test results)
4. Release gate calculation (passing_pct)
5. Feature flag enforcement

---

## 9. PRD Management APIs

### Coverage Status: ⚠️ PARTIAL

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/prd` | GET | ⚠️ | 🟡 | Basic coverage in `prd-management.spec.ts` |
| `/api/prd/:id` | GET | ⚠️ | 🟡 | Basic coverage |
| `/api/prd/:sd_id` | GET | ❌ | 🔴 | Get PRD by SD (markdown/JSON formats) |

**Rationale for Priority**:
- PRDs are **source of truth** for development work
- Format switching (JSON vs Markdown)
- Versioning logic (latest version selection)
- **Risk**: Wrong PRD version returned, format conversion errors

**Test Scenarios Needed**:
1. Get PRD by SD (JSON format)
2. Get PRD by SD (Markdown format)
3. Version ordering (latest version)
4. PRD not found (404 handling)

---

## 10. Calibration & Quality APIs

### Coverage Status: ❌ MISSING

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/calibration/venture/:venture_id` | GET | ❌ | 🔴 | EVA calibration scores |
| `/api/calibration/threshold/:sd_id` | GET | ❌ | 🔴 | Adaptive thresholds |
| `/api/calibration/compute` | POST | ❌ | 🔴 | 60/40 Truth Delta calculation |
| `/api/calibration/portfolio` | GET | ❌ | 🟡 | Portfolio-wide calibration |
| `/api/integrity-metrics` | GET | ❌ | 🟡 | Backlog & ideation integrity |
| `/api/pr-reviews` | GET | ❌ | 🟢 | PR review history |
| `/api/pr-reviews/metrics` | GET | ❌ | 🟢 | PR metrics |

**Rationale for Priority**:
- **Zero coverage** for EVA quality system (Sovereign Pipe v3.7.0)
- Calibration affects pass/fail decisions (Truth Delta)
- Adaptive thresholds based on SD complexity
- **Risk**: Wrong quality thresholds, false positives/negatives

**Test Scenarios Needed**:
1. Venture calibration scoring
2. Adaptive threshold calculation (gate 1-7)
3. Truth Delta computation (60/40 weighting)
4. Portfolio calibration (Chairman-only)
5. Integrity metrics (backlog, ideation)

---

## 11. Venture-Scoped APIs (v2 Routes)

### Coverage Status: ❌ MISSING

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/v2/ventures/:venture_id/strategic-directives` | GET | ❌ | 🔴 | Venture-scoped SDs |
| `/api/v2/ventures/:venture_id/prds` | GET | ❌ | 🔴 | Venture-scoped PRDs |
| `/api/v2/ventures/:venture_id/backlog` | GET | ❌ | 🔴 | Venture-scoped backlog |

**Rationale for Priority**:
- **Multi-tenancy isolation** critical for security
- Middleware: `requireVentureScope`
- **Risk**: Cross-venture data leakage, unauthorized access

**Test Scenarios Needed**:
1. Venture scope enforcement (only return data for venture_id)
2. Authorization failures (invalid venture_id)
3. Empty results handling (no SDs/PRDs/backlog)

---

## 12. WebSocket Real-Time Features

### Coverage Status: ❌ MISSING (CRITICAL)

| Feature | Coverage | Priority | Notes |
|---------|----------|----------|-------|
| WebSocket connection | ❌ | 🔴 | Initial state broadcast |
| `setActiveSD` message | ❌ | 🔴 | Set working_on flag |
| `updateSDStatus` message | ❌ | 🔴 | Update SD status |
| `updateSDPriority` message | ❌ | 🔴 | Update SD priority |
| Database change broadcasts | ❌ | 🔴 | Supabase realtime subscriptions |
| File change broadcasts | ❌ | 🟢 | Chokidar file watching |

**Rationale for Priority**:
- **Zero coverage** for entire WebSocket subsystem
- Real-time updates power the dashboard
- Multi-client synchronization
- **Risk**: Stale UI, race conditions, memory leaks

**Test Scenarios Needed**:
1. WebSocket connection + initial state
2. Set active SD (is_working_on flag)
3. Broadcast to multiple clients
4. Database realtime subscriptions (SD, PRD, EES changes)
5. Client disconnect handling

---

## 13. GitHub Integration

### Coverage Status: ❌ MISSING

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/github/pr-review-webhook` | POST | ❌ | 🟡 | Agentic review integration |

**Rationale for Priority**:
- Webhook from GitHub Actions (agentic review bot)
- Stores PR metrics (pass rate, false positives)
- **Risk**: Webhook signature validation missing, replay attacks

**Test Scenarios Needed**:
1. Valid PR review payload
2. Save to database (pr_reviews table)
3. Broadcast to WebSocket clients
4. Invalid payload handling

---

## 14. Context & State APIs (Dashboard)

### Coverage Status: ❌ MISSING

| Endpoint | Method | Coverage | Priority | Notes |
|----------|--------|----------|----------|-------|
| `/api/status` | GET | ❌ | 🟢 | LEO status summary |
| `/api/state` | GET | ❌ | 🟢 | Full dashboard state |
| `/api/context` | GET | ❌ | 🟢 | Context usage tracking |
| `/api/progress` | GET | ❌ | 🟢 | Overall progress |
| `/api/handoff` | GET | ❌ | 🟢 | Phase handoffs |
| `/api/ees` | GET | ❌ | 🟢 | Execution sequences |
| `/api/eva/status` | GET | ❌ | 🟢 | EVA voice assistant |
| `/api/metrics` | GET | ❌ | 🟢 | Mock metrics |

**Rationale for Priority**:
- **Low priority** - mostly read-only dashboard data
- State is loaded from database on startup
- **Risk**: Incorrect aggregations, stale data

---

## Priority Summary

### CRITICAL Gaps (26 endpoints)
1. **SDIP APIs** (4 endpoints) - Chairman submission flow
2. **Backlog APIs** (3 endpoints) - Execution queue
3. **Venture Lifecycle** (3 endpoints) - Artifacts, stage progression
4. **Competitor Analysis** (3 endpoints) - Research subsystem
5. **AI Engines** (9 endpoints) - Naming, Financial, Content
6. **Testing Campaign** (3 endpoints) - Orchestration
7. **Story Management** (3 endpoints) - Release gates
8. **Calibration** (3 endpoints) - Quality scoring
9. **Venture-Scoped APIs** (3 endpoints) - Multi-tenancy
10. **WebSocket** (6 features) - Real-time updates

### MEDIUM Gaps (15 endpoints)
- Backlog listing/filtering
- Blueprint management
- Discovery opportunities
- AI Engine secondary endpoints (list, retrieve)
- Story health checks

### LOW Gaps (10 endpoints)
- Dashboard state APIs
- Screenshot uploads
- Metrics endpoints
- PR review queries

---

## Recommended Testing Priorities

### Phase 1: Core Business Logic (Sprint 1)
**Goal**: Cover critical user flows

1. **SDIP 7-Step Flow** (US-SDIP-001 to US-SDIP-007)
   - Chairman submission → AI enhancement → SD creation
   - **Estimated effort**: 3-4 hours
   - **Risk reduction**: HIGH

2. **Venture Lifecycle** (US-VENTURE-LIFECYCLE-001 to US-VENTURE-LIFECYCLE-005)
   - Create venture → stage progression → artifacts
   - **Estimated effort**: 2-3 hours
   - **Risk reduction**: HIGH

3. **AI Engines - Happy Path** (US-AI-ENGINE-001 to US-AI-ENGINE-003)
   - Generate name → financial projection → marketing content
   - **Estimated effort**: 4-5 hours
   - **Risk reduction**: MEDIUM-HIGH

### Phase 2: Integration & Discovery (Sprint 2)
**Goal**: Cover AI-powered features

4. **Competitor Analysis** (US-COMPETITOR-001 to US-COMPETITOR-003)
   - URL analysis → four-buckets → blueprint approval
   - **Estimated effort**: 3-4 hours
   - **Risk reduction**: MEDIUM

5. **Testing Campaign** (US-TESTING-CAMPAIGN-001 to US-TESTING-CAMPAIGN-004)
   - Start/stop campaign → monitor progress
   - **Estimated effort**: 2-3 hours
   - **Risk reduction**: MEDIUM

6. **Story Management** (US-STORY-001 to US-STORY-003)
   - Generate → verify → release gate
   - **Estimated effort**: 2-3 hours
   - **Risk reduction**: MEDIUM

### Phase 3: Quality & Multi-Tenancy (Sprint 3)
**Goal**: Cover advanced features

7. **Calibration & Quality** (US-CALIBRATION-001 to US-CALIBRATION-004)
   - Venture calibration → Truth Delta → adaptive thresholds
   - **Estimated effort**: 3-4 hours
   - **Risk reduction**: MEDIUM

8. **Venture-Scoped APIs** (US-VENTURE-SCOPE-001 to US-VENTURE-SCOPE-003)
   - Multi-tenancy isolation validation
   - **Estimated effort**: 2 hours
   - **Risk reduction**: HIGH (security)

9. **WebSocket Real-Time** (US-WEBSOCKET-001 to US-WEBSOCKET-004)
   - Connection → broadcasts → realtime subscriptions
   - **Estimated effort**: 3-4 hours
   - **Risk reduction**: MEDIUM

---

## Test Implementation Strategy

### 1. API-First Testing (Recommended)
- Use Playwright `@playwright/test` request fixture
- No UI dependencies (backend is API-only)
- Fast, reliable, deterministic
- **Example**: `/mnt/c/_EHG/EHG_Engineer/tests/e2e/api/marketing-distribution.spec.ts`

### 2. Test Data Management
**Options**:
1. **Seed database** (recommended for integration tests)
   - Use Supabase seeding scripts
   - Predictable test IDs
2. **Create-then-cleanup** (recommended for E2E)
   - Create test data in `beforeAll`
   - Delete in `afterAll`
3. **Fixtures** (for complex scenarios)
   - Reusable test data factories

### 3. Environment Setup
```bash
# .env.test
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=sk-test-... (for LLM tests)
API_BASE_URL=http://localhost:3000
```

### 4. Test Structure Template
```typescript
import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

test.describe('[Feature] API E2E', () => {
  test.describe.configure({ mode: 'serial' }); // For dependent tests

  let testId: string;

  test.beforeAll(async ({ request }) => {
    // Setup: Create test data
  });

  test('US-XXX-001: [Scenario]', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/endpoint`, {
      data: { /* payload */ }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toMatchObject({ /* assertions */ });
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Delete test data
  });
});
```

---

## User Story Coverage Mapping

### Example: SDIP Flow
| User Story | Endpoint | Test File | Status |
|------------|----------|-----------|--------|
| US-SDIP-001: Submit Chairman input | POST /api/sdip/submit | ❌ Missing | Not covered |
| US-SDIP-002: Update Step 2 data | PUT /api/sdip/submissions/:id/step/2 | ❌ Missing | Not covered |
| US-SDIP-003: AI enhancement | Background job | ❌ Missing | Not covered |
| US-SDIP-004: Create Strategic Directive | POST /api/sdip/create-strategic-directive | ❌ Missing | Not covered |

---

## Metrics & Success Criteria

### Current State (Estimated)
- **Total API Endpoints**: 73
- **Covered Endpoints**: ~18 (25%)
- **CRITICAL Gaps**: 26 (36%)
- **MEDIUM Gaps**: 15 (21%)
- **LOW Gaps**: 10 (14%)

### Target State (Post Phase 1-3)
- **Coverage Target**: ≥90% of CRITICAL endpoints
- **Coverage Target**: ≥70% of MEDIUM endpoints
- **Coverage Target**: ≥50% of LOW endpoints
- **Overall Coverage**: ≥80%

### Success Metrics
1. **Release Gate Compliance**: All SDs require ≥1 passing E2E test
2. **CI Integration**: E2E tests run on every PR
3. **Test Execution Time**: <10 minutes for full suite
4. **Flakiness Rate**: <2% (stable, deterministic tests)

---

## Appendix A: Existing Test Files

### E2E Tests (`/tests/e2e/`)
- ✅ **marketing-distribution.spec.ts** - EXCELLENT model
- ⚠️ **prd-management.spec.ts** - Partial coverage
- ⚠️ **strategic-directives-crud.spec.ts** - Partial coverage
- ⚠️ **phase-handoffs.spec.ts** - Phase orchestration
- ✅ **accessibility/wcag-check.spec.ts** - A11y testing
- ✅ **agents/** - Budget kill-switch, memory isolation
- ✅ **brand-variants/** - Brand management flows
- ✅ **venture-creation/** - Entry path selectors
- ✅ **venture-lifecycle/** - 6-phase journey

### UAT Tests (`/tests/uat/`)
- ⚠️ **auth.spec.js** - Basic auth flows
- ⚠️ **dashboard.spec.js** - Dashboard rendering
- ⚠️ **ventures.spec.js** - Venture CRUD
- ❌ **aiAgents.spec.js** - AI agent tests (unclear coverage)
- ❌ **analytics.spec.js** - Analytics (unclear coverage)
- ❌ **governance.spec.js** - Governance (unclear coverage)
- ❌ **portfolios.spec.js** - Portfolios (unclear coverage)

---

## Appendix B: Quick Wins (Highest ROI)

### 1. SDIP Complete Flow (US-SDIP-E2E-001)
**Estimated effort**: 3 hours
**Risk reduction**: HIGH
**Rationale**: Chairman's primary workflow, zero coverage

### 2. Venture Artifacts (US-VENTURE-ARTIFACTS-001)
**Estimated effort**: 2 hours
**Risk reduction**: HIGH
**Rationale**: 25-stage lifecycle depends on this

### 3. AI Engines Smoke Tests (US-AI-ENGINE-SMOKE-001)
**Estimated effort**: 2 hours
**Risk reduction**: MEDIUM
**Rationale**: Detects LLM integration failures early

### 4. Story Release Gate (US-STORY-GATE-001)
**Estimated effort**: 1.5 hours
**Risk reduction**: MEDIUM
**Rationale**: Blocks releases if broken

### 5. Calibration Threshold (US-CALIBRATION-THRESHOLD-001)
**Estimated effort**: 1.5 hours
**Risk reduction**: MEDIUM
**Rationale**: Affects all quality gates

---

## Appendix C: Reference Implementation

See `/mnt/c/_EHG/EHG_Engineer/tests/e2e/api/marketing-distribution.spec.ts` for a **model E2E test suite**:
- ✅ Serial execution for dependent tests
- ✅ Proper setup/teardown
- ✅ Validation error testing
- ✅ Status filtering
- ✅ Comprehensive assertions
- ✅ Cleanup in `afterAll`

---

## Next Steps

1. **Approve Priority List** (LEAD decision)
2. **Create User Stories** (PLAN phase)
   - Use `npm run prio:top3` to identify highest-value SDs
   - Map stories to gaps identified in this document
3. **Implement Phase 1 Tests** (EXEC phase)
   - Start with SDIP flow (highest risk)
   - Follow marketing-distribution.spec.ts pattern
4. **CI Integration** (EXEC phase)
   - Add to `.github/workflows/e2e-tests.yml`
   - Set up test reporting (Playwright HTML reporter)
5. **Review & Iterate** (PLAN verification)
   - QA Director review after each sprint
   - Update coverage metrics

---

**Document Owner**: QA Engineering Director (testing-agent)
**Last Updated**: 2026-01-05
**Related SDs**: SD-QA-E2E-COVERAGE-001 (if created)
