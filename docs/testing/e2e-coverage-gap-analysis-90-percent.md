# E2E Testing Coverage Gap Analysis - 90% Target
**Generated**: 2026-01-05
**Application**: EHG_Engineer (Backend API - Port 3000)
**Testing Agent**: QA Engineering Director
**Target Coverage**: 90%

## Executive Summary

This comprehensive analysis expands on the initial 25% coverage assessment to identify ALL gaps needed to achieve **90% E2E test coverage**. The analysis covers:

- **API Endpoints** (73 identified, 70 distinct routes)
- **Database Functions & Triggers** (20+ functions across migrations)
- **WebSocket/Real-time Features** (6 message types)
- **Background Jobs** (Testing campaign, AI enhancement pipeline)
- **Admin/Settings** (Supabase management, configuration)
- **Error Handling Paths** (EVA error handling, circuit breakers)
- **Edge Cases** (Rate limiting, validation failures, boundary conditions)
- **Multi-tenant Scenarios** (Venture scope enforcement)
- **RBAC Paths** (Chairman-only, venture-scoped, public)

### Coverage Metrics

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| **API Endpoints** | 18/73 (25%) | 66/73 (90%) | 48 endpoints |
| **Database Functions** | 1/20 (5%) | 18/20 (90%) | 17 functions |
| **WebSocket Features** | 0/6 (0%) | 5/6 (83%) | 5 features |
| **Background Jobs** | 0/4 (0%) | 4/4 (100%) | 4 jobs |
| **Error Paths** | 2/15 (13%) | 14/15 (93%) | 12 paths |
| **RBAC Scenarios** | 1/8 (13%) | 7/8 (88%) | 6 scenarios |
| **Overall Coverage** | **~25%** | **~90%** | **~65%** |

### Effort Estimation

| Phase | Sprint | Effort (hours) | Coverage Gain | Cumulative |
|-------|--------|----------------|---------------|------------|
| **Phase 1** | Sprint 1 | 32-40 | +25% | 50% |
| **Phase 2** | Sprint 2 | 28-36 | +20% | 70% |
| **Phase 3** | Sprint 3 | 24-32 | +12% | 82% |
| **Phase 4** | Sprint 4 | 16-20 | +8% | 90% |
| **TOTAL** | 4 sprints | **100-128 hours** | **+65%** | **90%** |

---

## Part 1: API Endpoints (Expanded from Initial Analysis)

### 1.1 SDIP (Directive Lab) APIs

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/sdip/submit` | POST | US-SDIP-001: As Chairman, I need to submit strategic input so that AI can enhance it into an actionable directive | 🔴 CRITICAL | 2.5 |
| `/api/sdip/submissions/:id/step/:stepNumber` | PUT | US-SDIP-002: As Chairman, I need to update step data so that I can refine my submission through the 7-step flow | 🔴 CRITICAL | 2.0 |
| `/api/sdip/submissions` | GET | US-SDIP-003: As Chairman, I need to view my submission history so that I can track past ideas | 🟡 MEDIUM | 1.0 |
| `/api/sdip/submissions/:id` | DELETE | US-SDIP-004: As Chairman, I need to delete test/draft submissions so that I can keep the workspace clean | 🟢 LOW | 0.5 |
| `/api/sdip/screenshot` | POST | US-SDIP-005: As Chairman, I need to upload screenshots so that I can provide visual context for my ideas | 🟢 LOW | 1.0 |
| `/api/sdip/progress/:id` | GET | US-SDIP-006: As Chairman, I need to track submission progress so that I know when AI processing is complete | 🟡 MEDIUM | 1.0 |
| `/api/sdip/create-strategic-directive` | POST | US-SDIP-007: As Chairman, I need to convert approved submissions into SDs so that they enter the execution pipeline | 🔴 CRITICAL | 3.0 |

**Test Scenarios Needed**:
1. ✅ Complete 7-step submission flow (happy path)
2. ⚠️ AI enhancement background processing (async validation)
3. ⚠️ Step validation errors (missing required fields, invalid data)
4. ⚠️ Duplicate submission prevention
5. ⚠️ Screenshot upload size limits (5MB max)
6. ⚠️ Create SD with existing submission_id (idempotency)
7. ⚠️ Chairman intent immutability validation

**Estimated Effort**: 11 hours

---

### 1.2 Backlog & Strategic Directives APIs

**Status**: ⚠️ PARTIAL (30% coverage - basic CRUD only)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/sd` | GET | US-SD-001: As Claude, I need to list all SDs so that I can select work | ⚠️ PARTIAL | 0.5 |
| `/api/sd/:id` | GET | US-SD-002: As Claude, I need to view SD details so that I can understand requirements | ⚠️ PARTIAL | 0.5 |
| `/api/backlog/strategic-directives` | GET | US-BACKLOG-001: As Claude, I need to filter SDs by tier/priority so that I can find highest-value work | 🔴 CRITICAL | 2.0 |
| `/api/backlog/strategic-directives-with-items` | GET | US-BACKLOG-002: As Claude, I need to see SDs with backlog items so that I can assess SD scope | 🔴 CRITICAL | 2.5 |
| `/api/backlog/strategic-directives/:sd_id` | GET | US-BACKLOG-003: As Claude, I need to view SD backlog detail so that I can see all work items | 🟡 MEDIUM | 1.5 |
| `/api/strategic-directives/:sd_id/backlog-summary` | GET | US-BACKLOG-004: As Chairman, I need AI-generated backlog summaries so that I can quickly assess SD complexity | 🔴 CRITICAL | 3.0 |

**Test Scenarios Needed**:
1. ✅ List SDs with default pagination
2. ⚠️ Filter by tier (Tier 1, Tier 2, Tier 3)
3. ⚠️ Filter by page_title (product area grouping)
4. ⚠️ Filter by must_have_pct (≥70%, ≥50%, custom)
5. ⚠️ Filter by rolled_triage status
6. ⚠️ AI backlog summary generation (OpenAI integration)
7. ⚠️ Cache invalidation (force_refresh parameter)
8. ⚠️ Large result set pagination (100+ SDs)
9. ⚠️ Empty backlog handling
10. ⚠️ SD status filtering (active, completed, deferred, cancelled)

**Estimated Effort**: 10 hours

---

### 1.3 Venture Management APIs

**Status**: ⚠️ PARTIAL (20% coverage - basic listing only)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/ventures` | GET | US-VENTURE-001: As Claude, I need to list ventures so that I can select which to work on | ⚠️ PARTIAL | 0.5 |
| `/api/ventures` | POST | US-VENTURE-002: As Chairman, I need to create ventures so that I can capture raw_chairman_intent immutably | 🔴 CRITICAL | 2.5 |
| `/api/ventures/:id` | GET | US-VENTURE-003: As Claude, I need to view venture details so that I understand business context | 🟡 MEDIUM | 1.0 |
| `/api/ventures/:id/artifacts` | GET | US-VENTURE-004: As Claude, I need to retrieve stage artifacts so that I can see deliverables by stage | 🔴 CRITICAL | 2.0 |
| `/api/ventures/:id/artifacts` | POST | US-VENTURE-005: As Claude, I need to create/update artifacts so that I can deliver stage outputs | 🔴 CRITICAL | 3.0 |
| `/api/ventures/:id/stage` | PATCH | US-VENTURE-006: As Claude, I need to update lifecycle stage so that I can progress through the 25-stage journey | 🔴 CRITICAL | 2.5 |

**Test Scenarios Needed**:
1. ✅ List ventures with pagination
2. ⚠️ Create venture with origin_type=manual (raw_chairman_intent required)
3. ⚠️ Create venture with origin_type=competitor_clone
4. ⚠️ Create venture with origin_type=ai_generated
5. ⚠️ Stage progression validation (1 → 2 → 3, no skipping)
6. ⚠️ Stage regression prevention (cannot go backwards)
7. ⚠️ Artifact versioning (is_current flag, version incrementing)
8. ⚠️ Artifact retrieval by stage and type (filtering)
9. ⚠️ raw_chairman_intent immutability (cannot be changed after creation)
10. ⚠️ Stage gate validation (cannot progress without required artifacts)
11. ⚠️ Concurrent artifact updates (optimistic locking)
12. ⚠️ Venture soft deletion (is_active flag)

**Estimated Effort**: 11.5 hours

---

### 1.4 Competitor Analysis & Discovery APIs

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/competitor-analysis` | POST | US-COMP-001: As Claude, I need to analyze competitor websites so that I can generate venture blueprints | 🔴 CRITICAL | 3.5 |
| `/api/discovery/scan` | POST | US-DISCOVERY-001: As Chairman, I need to trigger AI discovery scans so that I can find new opportunities | 🔴 CRITICAL | 3.0 |
| `/api/discovery/opportunities` | GET | US-DISCOVERY-002: As Chairman, I need to view opportunities by box (green/yellow/red) so that I can prioritize ideas | 🟡 MEDIUM | 2.0 |
| `/api/discovery/scans` | GET | US-DISCOVERY-003: As Chairman, I need to view recent discovery scans so that I can track exploration history | 🟢 LOW | 1.0 |
| `/api/discovery/decision` | POST | US-DISCOVERY-004: As Chairman, I need to approve/reject blueprints so that I can control venture creation | 🔴 CRITICAL | 2.5 |
| `/api/blueprints` | GET | US-BLUEPRINT-001: As Chairman, I need to filter blueprints by source/status so that I can review AI-generated ideas | 🟡 MEDIUM | 2.0 |
| `/api/blueprints/:id` | GET | US-BLUEPRINT-002: As Chairman, I need to view blueprint details so that I can evaluate opportunity quality | 🟢 LOW | 1.0 |

**Test Scenarios Needed**:
1. ⚠️ Competitor URL analysis (live website scraping)
2. ⚠️ Four-Buckets Framework quality scoring (Facts, Assumptions, Simulations, Unknowns)
3. ⚠️ Opportunity box classification (green/yellow/red)
4. ⚠️ Chairman approval workflow (pending → approved → venture creation)
5. ⚠️ Fallback behavior when scraping fails (graceful degradation)
6. ⚠️ Discovery scan rate limiting (prevent abuse)
7. ⚠️ Invalid URL handling (malformed URLs, non-existent domains)
8. ⚠️ Blueprint confidence score calculation
9. ⚠️ Opportunity deduplication (prevent duplicate blueprints)
10. ⚠️ Market sizing estimation validation

**Estimated Effort**: 15 hours

---

### 1.5 AI Engines (Naming, Financial, Content Forge)

**Status**: ❌ MISSING (0% coverage)

#### 1.5.1 Naming Engine (SD-NAMING-ENGINE-001)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/v2/naming-engine/generate` | POST | US-NAMING-001: As Claude, I need to generate brand names so that ventures have memorable identities | 🔴 CRITICAL | 3.0 |
| `/api/v2/naming-engine/suggestions/:brand_genome_id` | GET | US-NAMING-002: As Chairman, I need to retrieve saved name suggestions so that I can review past options | 🟡 MEDIUM | 1.5 |

**Test Scenarios**:
1. ⚠️ LLM integration (OpenAI API key validation, error handling)
2. ⚠️ Input validation (venture_id, brand_genome_id required)
3. ⚠️ Quality scoring logic (uniqueness, memorability, domain availability)
4. ⚠️ Database persistence (saved suggestions)
5. ⚠️ Rate limiting (prevent excessive API calls)
6. ⚠️ Fallback names when LLM fails
7. ⚠️ Domain availability checks (optional)
8. ⚠️ Name length constraints (1-50 chars)

**Estimated Effort**: 4.5 hours

#### 1.5.2 Financial Engine (SD-FINANCIAL-ENGINE-001)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/v2/financial-engine/project` | POST | US-FINANCIAL-001: As Claude, I need to create financial projections so that ventures have revenue models | 🔴 CRITICAL | 3.5 |
| `/api/v2/financial-engine/:id` | GET | US-FINANCIAL-002: As Chairman, I need to view projections so that I can assess venture viability | 🟡 MEDIUM | 1.5 |
| `/api/v2/financial-engine/:id/scenario` | POST | US-FINANCIAL-003: As Claude, I need to create scenario analyses so that I can model best/worst cases | 🔴 CRITICAL | 3.0 |
| `/api/v2/financial-engine/:id/export` | GET | US-FINANCIAL-004: As Chairman, I need to export projections to Excel so that I can share with stakeholders | 🟢 LOW | 2.0 |
| `/api/v2/financial-engine/list/:venture_id` | GET | US-FINANCIAL-005: As Claude, I need to list financial models so that I can track projection history | 🟢 LOW | 1.0 |

**Test Scenarios**:
1. ⚠️ Create projection with valid assumptions (revenue, costs, growth rate)
2. ⚠️ Scenario analysis (optimistic, pessimistic, realistic)
3. ⚠️ NPV/IRR calculation validation (financial formulas)
4. ⚠️ Cash flow projection (monthly/yearly breakdown)
5. ⚠️ Excel export format validation (XLSX structure)
6. ⚠️ Currency handling (USD, EUR, etc.)
7. ⚠️ Negative cash flow warnings
8. ⚠️ Time horizon constraints (1-10 years)
9. ⚠️ Projection versioning (track changes over time)

**Estimated Effort**: 11 hours

#### 1.5.3 Content Forge (SD-CONTENT-FORGE-IMPL-001)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/v2/content-forge/generate` | POST | US-CONTENT-001: As Claude, I need to generate marketing content so that ventures have brand-consistent messaging | 🔴 CRITICAL | 3.5 |
| `/api/v2/content-forge/list` | GET | US-CONTENT-002: As Chairman, I need to list generated content so that I can review marketing materials | 🟡 MEDIUM | 1.5 |
| `/api/v2/content-forge/compliance-check` | POST | US-CONTENT-003: As Claude, I need to validate brand compliance so that content matches brand guidelines | 🔴 CRITICAL | 3.0 |
| `/api/v2/brand-genome/:id` | GET | US-CONTENT-004: As Claude, I need to retrieve brand genomes so that I can generate on-brand content | 🟡 MEDIUM | 1.5 |

**Test Scenarios**:
1. ⚠️ LLM content generation (OpenAI GPT-4 integration)
2. ⚠️ Content type selection (tagline, product description, email, social post)
3. ⚠️ Brand compliance scoring (tone, voice, values alignment)
4. ⚠️ Content length constraints (50-500 words)
5. ⚠️ Brand genome retrieval and application
6. ⚠️ Content approval workflow
7. ⚠️ Profanity filter (content moderation)
8. ⚠️ Localization support (multiple languages)
9. ⚠️ Content versioning (track edits)

**Estimated Effort**: 9.5 hours

**Total AI Engines Effort**: 25 hours

---

### 1.6 Marketing Distribution APIs

**Status**: ✅ COVERED (100% coverage - EXCELLENT!)

| Endpoint | Method | Coverage | Notes |
|----------|--------|----------|-------|
| `/api/v2/marketing/channels` | GET | ✅ | Covered in `marketing-distribution.spec.ts` |
| `/api/v2/marketing/queue` | POST | ✅ | Covered |
| `/api/v2/marketing/queue/:venture_id` | GET | ✅ | Covered |
| `/api/v2/marketing/queue/:id/review` | PUT | ✅ | Covered |
| `/api/v2/marketing/distribute/:id` | POST | ✅ | Covered |
| `/api/v2/marketing/history/:venture_id` | GET | ✅ | Covered |

**Notes**:
- **EXCELLENT COVERAGE** - Full test suite exists (SD-MARKETING-AUTOMATION-001)
- Model for other API groups
- No additional work needed

**Estimated Effort**: 0 hours (already complete)

---

### 1.7 Testing Campaign APIs (QA Orchestration)

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/testing/campaign/status` | GET | US-TESTING-001: As Claude, I need to check campaign status so that I can see if tests are running | 🔴 CRITICAL | 2.0 |
| `/api/testing/campaign/health` | GET | US-TESTING-002: As Claude, I need to monitor heartbeat so that I can detect zombie processes | 🔴 CRITICAL | 1.5 |
| `/api/testing/campaign/apps` | GET | US-TESTING-003: As Claude, I need to see SD counts by app so that I can understand test scope | 🟡 MEDIUM | 1.0 |
| `/api/testing/campaign/start` | POST | US-TESTING-004: As Claude, I need to start testing campaigns so that I can run batch tests | 🔴 CRITICAL | 3.0 |
| `/api/testing/campaign/stop` | POST | US-TESTING-005: As Claude, I need to stop campaigns so that I can terminate long-running tests | 🔴 CRITICAL | 2.0 |
| `/api/testing/campaign/logs/:type` | GET | US-TESTING-006: As Claude, I need to view logs so that I can debug test failures | 🟢 LOW | 1.5 |

**Test Scenarios Needed**:
1. ⚠️ Start campaign for EHG app
2. ⚠️ Start campaign for EHG_Engineer app
3. ⚠️ Monitor heartbeat file updates (every 5 seconds)
4. ⚠️ PID validation (process still running)
5. ⚠️ Stop campaign (graceful SIGTERM)
6. ⚠️ Checkpoint recovery (resume after failure)
7. ⚠️ Concurrent campaign prevention (only one at a time)
8. ⚠️ Log rotation (prevent disk space issues)
9. ⚠️ Campaign timeout handling (max 2 hours)
10. ⚠️ File-based state management (/tmp/campaign-heartbeat.txt)

**Estimated Effort**: 11 hours

---

### 1.8 Story Management APIs (Release Gates)

**Status**: ⚠️ PARTIAL (20% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/stories/generate` | POST | US-STORY-001: As Claude, I need to generate stories from PRDs so that I have test coverage for features | 🔴 CRITICAL | 3.0 |
| `/api/stories` | GET | US-STORY-002: As Claude, I need to list stories with filters so that I can see failing tests | 🟡 MEDIUM | 2.0 |
| `/api/stories/verify` | POST | US-STORY-003: As CI, I need to update story status so that release gates reflect test results | 🔴 CRITICAL | 2.5 |
| `/api/stories/gate` | GET | US-STORY-004: As Claude, I need to check release gate status so that I know if SD is shippable | 🔴 CRITICAL | 2.0 |
| `/api/stories/health` | GET | US-STORY-005: As Claude, I need to check feature flags so that I know if auto-stories is enabled | 🟢 LOW | 1.0 |

**Test Scenarios Needed**:
1. ⚠️ Generate stories in dry_run mode (preview only)
2. ⚠️ Generate stories in create mode (insert new)
3. ⚠️ Generate stories in upsert mode (update existing)
4. ⚠️ List stories with status=passing filter
5. ⚠️ List stories with status=failing filter
6. ⚠️ List stories with status=not_run filter
7. ⚠️ CI webhook payload validation
8. ⚠️ Release gate calculation (passing_pct ≥ 80%)
9. ⚠️ Feature flag enforcement (FEATURE_AUTO_STORIES)
10. ⚠️ Story deduplication (prevent duplicate user stories)
11. ⚠️ GitHub Actions integration (webhook signature)

**Estimated Effort**: 10.5 hours

---

### 1.9 PRD Management APIs

**Status**: ⚠️ PARTIAL (40% coverage - basic CRUD only)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/prd` | GET | US-PRD-001: As Claude, I need to list PRDs so that I can see available specifications | ⚠️ PARTIAL | 0.5 |
| `/api/prd/:id` | GET | US-PRD-002: As Claude, I need to view PRD by ID so that I can read specification details | ⚠️ PARTIAL | 0.5 |
| `/api/prd/:sd_id` | GET | US-PRD-003: As Claude, I need to get PRD by SD so that I can find the spec for my current work | 🔴 CRITICAL | 2.0 |

**Test Scenarios Needed**:
1. ✅ List PRDs with pagination
2. ✅ Get PRD by ID
3. ⚠️ Get PRD by SD (JSON format)
4. ⚠️ Get PRD by SD (Markdown format)
5. ⚠️ Version ordering (latest version returned)
6. ⚠️ PRD not found (404 handling)
7. ⚠️ PRD status filtering (draft, approved, deprecated)
8. ⚠️ Multi-version PRDs (return all versions for SD)

**Estimated Effort**: 3 hours

---

### 1.10 Calibration & Quality APIs (EVA Scoring)

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/calibration/venture/:venture_id` | GET | US-CAL-001: As Claude, I need EVA calibration scores so that I can assess venture quality | 🔴 CRITICAL | 3.0 |
| `/api/calibration/threshold/:sd_id` | GET | US-CAL-002: As Claude, I need adaptive thresholds so that I can adjust quality bars by SD complexity | 🔴 CRITICAL | 2.5 |
| `/api/calibration/compute` | POST | US-CAL-003: As Claude, I need to compute Truth Delta so that I can measure calibration drift | 🔴 CRITICAL | 3.5 |
| `/api/calibration/portfolio` | GET | US-CAL-004: As Chairman, I need portfolio calibration so that I can see org-wide quality metrics | 🟡 MEDIUM | 2.5 |
| `/api/integrity-metrics` | GET | US-INTEGRITY-001: As Chairman, I need backlog/ideation integrity metrics so that I can track data quality | 🟡 MEDIUM | 2.0 |
| `/api/pr-reviews` | GET | US-PR-001: As Chairman, I need PR review history so that I can see agentic review performance | 🟢 LOW | 1.5 |
| `/api/pr-reviews/metrics` | GET | US-PR-002: As Chairman, I need PR metrics so that I can track pass rate and false positives | 🟢 LOW | 1.5 |

**Test Scenarios Needed**:
1. ⚠️ Venture calibration scoring (EVA algorithm)
2. ⚠️ Adaptive threshold calculation (gates 1-7)
3. ⚠️ Truth Delta computation (60/40 weighting: actual vs predicted)
4. ⚠️ Portfolio calibration (Chairman-only, requires special permission)
5. ⚠️ Integrity metrics (backlog completeness, ideation validation)
6. ⚠️ PR review aggregation (daily/weekly trends)
7. ⚠️ False positive rate calculation
8. ⚠️ Compliance rate tracking (LEO protocol adherence)
9. ⚠️ Calibration drift alerts (>10% deviation)
10. ⚠️ Historical calibration tracking (trend analysis)

**Estimated Effort**: 16.5 hours

---

### 1.11 Venture-Scoped APIs (Multi-Tenancy)

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/v2/ventures/:venture_id/strategic-directives` | GET | US-SCOPE-001: As Claude, I need venture-scoped SDs so that I only see relevant directives | 🔴 CRITICAL | 2.5 |
| `/api/v2/ventures/:venture_id/prds` | GET | US-SCOPE-002: As Claude, I need venture-scoped PRDs so that I don't leak data across ventures | 🔴 CRITICAL | 2.5 |
| `/api/v2/ventures/:venture_id/backlog` | GET | US-SCOPE-003: As Claude, I need venture-scoped backlog so that multi-tenancy isolation is enforced | 🔴 CRITICAL | 2.5 |

**Test Scenarios Needed**:
1. ⚠️ Venture scope enforcement (only return data for venture_id)
2. ⚠️ Authorization failures (invalid venture_id)
3. ⚠️ Empty results handling (no SDs/PRDs/backlog for venture)
4. ⚠️ Cross-venture data leakage prevention (security test)
5. ⚠️ Middleware `requireVentureScope` validation
6. ⚠️ Chairman bypass (can see all ventures)
7. ⚠️ Venture team member permissions (role-based)

**Estimated Effort**: 7.5 hours

---

### 1.12 Dashboard & State APIs

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/status` | GET | US-DASHBOARD-001: As UI, I need LEO status so that I can display current state | 🟢 LOW | 1.0 |
| `/api/state` | GET | US-DASHBOARD-002: As UI, I need full dashboard state so that I can render the UI | 🟢 LOW | 1.0 |
| `/api/context` | GET | US-DASHBOARD-003: As Claude, I need context usage so that I can monitor token consumption | 🟢 LOW | 1.0 |
| `/api/progress` | GET | US-DASHBOARD-004: As Chairman, I need progress tracking so that I can see overall completion | 🟢 LOW | 1.0 |
| `/api/handoff` | GET | US-DASHBOARD-005: As Chairman, I need handoff history so that I can see phase transitions | 🟢 LOW | 1.0 |
| `/api/ees` | GET | US-DASHBOARD-006: As Claude, I need execution sequences so that I can see SD task breakdowns | 🟢 LOW | 1.0 |
| `/api/eva/status` | GET | US-DASHBOARD-007: As UI, I need EVA status so that I can enable/disable voice assistant | 🟢 LOW | 0.5 |
| `/api/metrics` | GET | US-DASHBOARD-008: As UI, I need mock metrics so that I can display placeholder data | 🟢 LOW | 0.5 |

**Test Scenarios Needed**:
1. ⚠️ Status endpoint returns valid LEO protocol version
2. ⚠️ State endpoint returns complete dashboard structure
3. ⚠️ Context breakdown by file type (CLAUDE_CORE, CLAUDE_LEAD, etc.)
4. ⚠️ Progress calculation (overall and by phase)
5. ⚠️ Handoff history ordering (most recent first)
6. ⚠️ Empty state handling (no SDs, no PRDs)

**Estimated Effort**: 8 hours

---

### 1.13 GitHub Integration APIs

**Status**: ❌ MISSING (0% coverage)

| Endpoint | Method | User Story | Priority | Effort (hrs) |
|----------|--------|------------|----------|--------------|
| `/api/github/pr-review-webhook` | POST | US-GITHUB-001: As GitHub Actions, I need to send PR review results so that metrics are tracked | 🟡 MEDIUM | 2.5 |

**Test Scenarios Needed**:
1. ⚠️ Valid PR review payload
2. ⚠️ Save to database (pr_reviews table)
3. ⚠️ Broadcast to WebSocket clients
4. ⚠️ Invalid payload handling (malformed JSON)
5. ⚠️ Webhook signature validation (HMAC-SHA256)
6. ⚠️ Replay attack prevention (timestamp validation)
7. ⚠️ Rate limiting (prevent spam)

**Estimated Effort**: 2.5 hours

---

## Part 2: Database Functions & Triggers

### 2.1 Database Functions

**Status**: ❌ MISSING (1/20 = 5% coverage)

| Function | Purpose | User Story | Priority | Effort (hrs) |
|----------|---------|------------|----------|--------------|
| `semantic_code_search()` | Vector search for code snippets | US-DB-FUNC-001: As Claude, I need semantic search so that I can find relevant code patterns | 🔴 CRITICAL | 3.0 |
| `calculate_venture_progress()` | Compute venture % completion | US-DB-FUNC-002: As Chairman, I need progress calculation so that I can track venture status | 🔴 CRITICAL | 2.5 |
| `get_sd_execution_timeline()` | Fetch SD timeline data | US-DB-FUNC-003: As Claude, I need execution timelines so that I can see SD history | 🟡 MEDIUM | 2.0 |
| `validate_prd_schema()` | Enforce PRD structure | US-DB-FUNC-004: As PLAN, I need schema validation so that PRDs are well-formed | 🔴 CRITICAL | 2.5 |
| `check_orphaned_work()` | Find work items without SDs | US-DB-FUNC-005: As Chairman, I need orphan detection so that I can prevent data integrity issues | 🟡 MEDIUM | 2.0 |
| `compute_integrity_metrics()` | Calculate backlog quality | US-DB-FUNC-006: As Chairman, I need integrity metrics so that I can measure data health | 🟡 MEDIUM | 2.5 |
| `apply_rls_policies()` | Enforce row-level security | US-DB-FUNC-007: As System, I need RLS enforcement so that multi-tenancy is secure | 🔴 CRITICAL | 3.0 |
| `generate_embedding()` | Create vector embeddings | US-DB-FUNC-008: As System, I need embeddings so that semantic search works | 🟡 MEDIUM | 2.0 |

**Test Scenarios Needed**:
1. ⚠️ Semantic search with valid query (returns relevant results)
2. ⚠️ Semantic search with no results (empty array)
3. ⚠️ Progress calculation for venture at stage 1 (4% completion)
4. ⚠️ Progress calculation for venture at stage 25 (100% completion)
5. ⚠️ Execution timeline across multiple phases
6. ⚠️ PRD schema validation (valid JSON structure)
7. ⚠️ PRD schema validation failure (missing required fields)
8. ⚠️ Orphaned work detection (backlog items without SD)
9. ⚠️ Integrity metrics calculation (completeness scores)
10. ⚠️ RLS policy enforcement (venture isolation)
11. ⚠️ Embedding generation (vector output validation)

**Estimated Effort**: 19.5 hours

---

### 2.2 Database Triggers

**Status**: ❌ MISSING (0/10 = 0% coverage)

| Trigger | Table | Purpose | User Story | Priority | Effort (hrs) |
|---------|-------|---------|------------|----------|--------------|
| `update_sd_updated_at` | `strategic_directives` | Auto-update timestamp | US-DB-TRIG-001: As System, I need auto-timestamps so that I can track last modified dates | 🟡 MEDIUM | 1.5 |
| `sync_prd_to_sd` | `product_requirements` | Keep PRD-SD link | US-DB-TRIG-002: As System, I need PRD-SD sync so that relationships stay consistent | 🔴 CRITICAL | 2.5 |
| `validate_stage_progression` | `ventures` | Enforce stage order | US-DB-TRIG-003: As System, I need stage validation so that ventures can't skip stages | 🔴 CRITICAL | 2.5 |
| `log_sd_status_change` | `strategic_directives` | Audit status changes | US-DB-TRIG-004: As Chairman, I need status audit so that I can see who changed what | 🟡 MEDIUM | 2.0 |
| `cascade_sd_deletion` | `strategic_directives` | Soft delete cascade | US-DB-TRIG-005: As System, I need soft delete so that related data is marked inactive | 🟡 MEDIUM | 2.0 |
| `update_phase_progress` | `execution_sequences` | Recalculate phase % | US-DB-TRIG-006: As System, I need phase progress so that dashboard shows real-time completion | 🟡 MEDIUM | 2.5 |
| `notify_realtime_clients` | Multiple tables | Broadcast changes | US-DB-TRIG-007: As System, I need realtime notifications so that UI updates instantly | 🔴 CRITICAL | 3.0 |
| `enforce_chairman_approval` | `opportunity_blueprints` | Require approval | US-DB-TRIG-008: As System, I need approval enforcement so that only Chairman can create ventures | 🔴 CRITICAL | 2.0 |
| `version_prd_changes` | `product_requirements` | Track PRD versions | US-DB-TRIG-009: As System, I need PRD versioning so that I can see spec history | 🟡 MEDIUM | 2.5 |
| `validate_artifact_upload` | `venture_artifacts` | Check file size | US-DB-TRIG-010: As System, I need artifact validation so that uploads don't exceed limits | 🟢 LOW | 1.5 |

**Test Scenarios Needed**:
1. ⚠️ Update SD → verify updated_at changes
2. ⚠️ Create PRD → verify sd_id link is set
3. ⚠️ Update venture stage 1 → 3 (should fail, must go to 2 first)
4. ⚠️ Update venture stage 2 → 3 (should succeed)
5. ⚠️ Change SD status → verify audit log entry
6. ⚠️ Soft delete SD → verify is_active=false cascades
7. ⚠️ Complete EES item → verify phase progress recalculated
8. ⚠️ Insert SD → verify WebSocket broadcast
9. ⚠️ Create blueprint without approval → should fail
10. ⚠️ Update PRD content → verify new version created
11. ⚠️ Upload 100MB artifact → should fail (max 50MB)

**Estimated Effort**: 22 hours

---

## Part 3: WebSocket/Real-time Features

### 3.1 WebSocket Message Types

**Status**: ❌ MISSING (0/6 = 0% coverage)

| Message Type | Purpose | User Story | Priority | Effort (hrs) |
|--------------|---------|------------|----------|--------------|
| `connection` | Initial state broadcast | US-WS-001: As UI, I need initial state so that dashboard shows current data on connect | 🔴 CRITICAL | 2.5 |
| `setActiveSD` | Set working_on flag | US-WS-002: As Claude, I need to mark active SD so that Chairman knows what I'm working on | 🔴 CRITICAL | 2.0 |
| `updateSDStatus` | Update SD status | US-WS-003: As Claude, I need to update SD status so that dashboard reflects current state | 🔴 CRITICAL | 2.0 |
| `updateSDPriority` | Update SD priority | US-WS-004: As Chairman, I need to change priority so that I can re-rank work | 🔴 CRITICAL | 2.0 |
| `realtime-update` | Database change broadcast | US-WS-005: As UI, I need realtime updates so that I see changes without refreshing | 🔴 CRITICAL | 3.0 |
| `file-change` | File system watch | US-WS-006: As UI, I need file change notifications so that I know when configs update | 🟢 LOW | 1.5 |

**Test Scenarios Needed**:
1. ⚠️ WebSocket connection + initial state broadcast
2. ⚠️ Set active SD (is_working_on=true)
3. ⚠️ Clear active SD (is_working_on=false)
4. ⚠️ Update SD status (active → completed)
5. ⚠️ Update SD priority (high → critical)
6. ⚠️ Broadcast to multiple clients (2+ connections)
7. ⚠️ Database realtime subscription (SD table changes)
8. ⚠️ Database realtime subscription (PRD table changes)
9. ⚠️ Database realtime subscription (EES table changes)
10. ⚠️ Client disconnect handling (cleanup)
11. ⚠️ Reconnection after disconnect (resume subscription)
12. ⚠️ File watcher (chokidar) - detect .env changes
13. ⚠️ Message rate limiting (prevent spam)

**Estimated Effort**: 13 hours

---

## Part 4: Background Jobs & Scheduled Tasks

### 4.1 Background Jobs

**Status**: ❌ MISSING (0/4 = 0% coverage)

| Job | Trigger | User Story | Priority | Effort (hrs) |
|-----|---------|------------|----------|--------------|
| **SDIP AI Enhancement** | Submission step 2 | US-BG-001: As Chairman, I need AI enhancement so that my raw input becomes a structured SD | 🔴 CRITICAL | 4.0 |
| **Codebase Analysis** | SDIP step 3 | US-BG-002: As Claude, I need codebase analysis so that I can generate decision questions | 🔴 CRITICAL | 3.5 |
| **Testing Campaign** | Manual trigger | US-BG-003: As Claude, I need batch testing so that I can run E2E tests across all SDs | 🔴 CRITICAL | 4.0 |
| **Real-time Subscriptions** | Database changes | US-BG-004: As System, I need realtime sync so that UI updates without polling | 🔴 CRITICAL | 3.0 |

**Test Scenarios Needed**:
1. ⚠️ SDIP AI enhancement (async, should complete within 30s)
2. ⚠️ AI enhancement failure (OpenAI API error) → graceful fallback
3. ⚠️ Codebase analysis (semantic search + context extraction)
4. ⚠️ Codebase analysis timeout (max 60s)
5. ⚠️ Testing campaign start (spawn child process)
6. ⚠️ Testing campaign heartbeat (file updates every 5s)
7. ⚠️ Testing campaign completion (exit code 0)
8. ⚠️ Testing campaign timeout (kill after 2 hours)
9. ⚠️ Real-time subscription (Supabase channel)
10. ⚠️ Real-time subscription reconnection (after disconnect)
11. ⚠️ Job queue management (prevent duplicate jobs)
12. ⚠️ Job retry logic (exponential backoff)

**Estimated Effort**: 14.5 hours

---

## Part 5: Error Handling Paths

### 5.1 EVA Error Handling

**Status**: ⚠️ PARTIAL (2/15 = 13% coverage)

| Error Path | Trigger | User Story | Priority | Effort (hrs) |
|------------|---------|------------|----------|--------------|
| **Database connection failure** | Supabase down | US-ERR-001: As System, I need DB failover so that API doesn't crash when Supabase is down | 🔴 CRITICAL | 2.5 |
| **OpenAI API rate limit** | Too many requests | US-ERR-002: As System, I need rate limit handling so that LLM calls degrade gracefully | 🔴 CRITICAL | 2.5 |
| **Circuit breaker open** | Too many failures | US-ERR-003: As System, I need circuit breaker so that I stop calling failing services | 🔴 CRITICAL | 3.0 |
| **Validation error (400)** | Invalid input | US-ERR-004: As Claude, I need validation errors so that I know what's wrong with my input | 🟡 MEDIUM | 1.5 |
| **Authorization error (403)** | No permission | US-ERR-005: As System, I need auth errors so that unauthorized access is blocked | 🔴 CRITICAL | 2.0 |
| **Not found error (404)** | Missing resource | US-ERR-006: As Claude, I need 404 errors so that I know when a resource doesn't exist | 🟡 MEDIUM | 1.0 |
| **Conflict error (409)** | Duplicate data | US-ERR-007: As System, I need conflict errors so that duplicates are prevented | 🟡 MEDIUM | 1.5 |
| **Internal error (500)** | Unexpected exception | US-ERR-008: As System, I need 500 errors so that crashes are logged and handled | 🔴 CRITICAL | 2.0 |
| **Timeout error (504)** | Slow response | US-ERR-009: As System, I need timeout handling so that long requests don't hang | 🟡 MEDIUM | 2.0 |
| **WebSocket disconnect** | Connection loss | US-ERR-010: As UI, I need reconnection logic so that realtime updates resume | 🟡 MEDIUM | 2.5 |
| **File upload too large** | >50MB file | US-ERR-011: As System, I need size limits so that uploads don't fill disk | 🟢 LOW | 1.5 |
| **Invalid JWT token** | Expired/malformed | US-ERR-012: As System, I need token validation so that auth is secure | 🔴 CRITICAL | 2.0 |
| **SQL injection attempt** | Malicious input | US-ERR-013: As System, I need SQL sanitization so that injection attacks are blocked | 🔴 CRITICAL | 2.5 |
| **XSS attack attempt** | Malicious script | US-ERR-014: As System, I need XSS prevention so that scripts can't be injected | 🔴 CRITICAL | 2.0 |
| **CORS violation** | Wrong origin | US-ERR-015: As System, I need CORS enforcement so that only EHG frontend can call API | 🟡 MEDIUM | 1.5 |

**Test Scenarios Needed**:
1. ⚠️ Database connection failure → return 503 with retry message
2. ⚠️ OpenAI rate limit → wait 60s and retry
3. ⚠️ Circuit breaker open → return 503 with fallback response
4. ⚠️ Invalid JSON → return 400 with validation errors
5. ⚠️ Missing required field → return 400 with specific error
6. ⚠️ Unauthorized venture access → return 403
7. ⚠️ SD not found → return 404
8. ⚠️ Duplicate submission → return 409
9. ⚠️ Uncaught exception → return 500 with generic message
10. ⚠️ Request timeout (>30s) → return 504
11. ⚠️ WebSocket reconnect after 5s
12. ⚠️ File upload 100MB → return 413
13. ⚠️ Expired JWT → return 401
14. ⚠️ SQL injection in query → sanitized, no execution
15. ⚠️ XSS in input → escaped, no script execution
16. ⚠️ Request from wrong origin → CORS error

**Estimated Effort**: 30 hours

---

## Part 6: Role-Based Access Control (RBAC)

### 6.1 RBAC Scenarios

**Status**: ⚠️ PARTIAL (1/8 = 13% coverage)

| Scenario | User Story | Priority | Effort (hrs) |
|----------|------------|----------|--------------|
| **Chairman-only endpoints** | US-RBAC-001: As System, I need Chairman enforcement so that only Chairman can approve blueprints | 🔴 CRITICAL | 2.5 |
| **Venture-scoped access** | US-RBAC-002: As System, I need venture scope so that users only see their ventures | 🔴 CRITICAL | 3.0 |
| **Public read-only** | US-RBAC-003: As Public, I need read-only access so that I can view published ventures | 🟡 MEDIUM | 2.0 |
| **Team member permissions** | US-RBAC-004: As Team Member, I need limited access so that I can contribute without full control | 🟡 MEDIUM | 2.5 |
| **Anonymous user limits** | US-RBAC-005: As Anonymous, I need restricted access so that I can't modify data | 🟡 MEDIUM | 2.0 |
| **Admin override** | US-RBAC-006: As Admin, I need override permissions so that I can fix data issues | 🟢 LOW | 2.0 |
| **API key authentication** | US-RBAC-007: As API Client, I need API key auth so that I can integrate programmatically | 🟡 MEDIUM | 2.5 |
| **Role inheritance** | US-RBAC-008: As System, I need role inheritance so that permissions cascade correctly | 🟢 LOW | 2.0 |

**Test Scenarios Needed**:
1. ⚠️ Chairman access to portfolio calibration (should succeed)
2. ⚠️ Non-chairman access to portfolio calibration (should fail with 403)
3. ⚠️ Venture-scoped SD list (only return SDs for venture_id)
4. ⚠️ Cross-venture data leak (should return empty)
5. ⚠️ Public read of published venture (should succeed)
6. ⚠️ Public write attempt (should fail with 401)
7. ⚠️ Team member read access (should succeed)
8. ⚠️ Team member delete attempt (should fail with 403)
9. ⚠️ Anonymous user list ventures (should return public only)
10. ⚠️ Admin delete venture (should succeed even if not owner)
11. ⚠️ API key authentication (valid key)
12. ⚠️ API key authentication (invalid key, should fail with 401)
13. ⚠️ Role inheritance (admin has all chairman permissions)

**Estimated Effort**: 18.5 hours

---

## Part 7: Edge Cases & Boundary Conditions

### 7.1 Edge Cases

**Status**: ❌ MISSING (0/20 = 0% coverage)

| Edge Case | User Story | Priority | Effort (hrs) |
|-----------|------------|----------|--------------|
| **Empty database** | US-EDGE-001: As System, I need empty state handling so that UI doesn't crash with no data | 🟡 MEDIUM | 1.5 |
| **Large result sets (1000+ items)** | US-EDGE-002: As System, I need pagination so that large datasets don't timeout | 🔴 CRITICAL | 2.5 |
| **Concurrent updates** | US-EDGE-003: As System, I need optimistic locking so that concurrent edits don't clobber data | 🔴 CRITICAL | 3.0 |
| **Duplicate submission** | US-EDGE-004: As System, I need idempotency so that duplicate requests don't create duplicates | 🔴 CRITICAL | 2.5 |
| **Invalid UUID format** | US-EDGE-005: As System, I need UUID validation so that malformed IDs return 400 | 🟡 MEDIUM | 1.0 |
| **Negative numbers in input** | US-EDGE-006: As System, I need numeric validation so that negative values are rejected | 🟡 MEDIUM | 1.0 |
| **Very long strings (10k+ chars)** | US-EDGE-007: As System, I need length limits so that DB doesn't overflow | 🟡 MEDIUM | 1.5 |
| **Special characters in input** | US-EDGE-008: As System, I need sanitization so that special chars don't break queries | 🟡 MEDIUM | 1.5 |
| **Unicode/emoji in text** | US-EDGE-009: As User, I need emoji support so that I can use modern text | 🟢 LOW | 1.0 |
| **Date in the past** | US-EDGE-010: As System, I need date validation so that scheduled_for can't be historical | 🟡 MEDIUM | 1.0 |
| **Date 100 years in future** | US-EDGE-011: As System, I need date range limits so that unrealistic dates are rejected | 🟢 LOW | 1.0 |
| **Null vs empty string** | US-EDGE-012: As System, I need null handling so that null and empty are treated correctly | 🟡 MEDIUM | 1.5 |
| **Float precision issues** | US-EDGE-013: As System, I need decimal handling so that 0.1 + 0.2 = 0.3 | 🟡 MEDIUM | 1.5 |
| **Race condition (2 requests)** | US-EDGE-014: As System, I need transaction locking so that simultaneous requests don't conflict | 🔴 CRITICAL | 3.0 |
| **Orphaned records** | US-EDGE-015: As System, I need orphan detection so that broken relationships are caught | 🟡 MEDIUM | 2.0 |
| **Circular dependencies** | US-EDGE-016: As System, I need cycle detection so that SD dependencies don't loop | 🟡 MEDIUM | 2.5 |
| **File path traversal** | US-EDGE-017: As System, I need path sanitization so that ../ attacks are blocked | 🔴 CRITICAL | 2.0 |
| **URL validation** | US-EDGE-018: As System, I need URL validation so that only valid URLs are accepted | 🟡 MEDIUM | 1.5 |
| **Email format validation** | US-EDGE-019: As System, I need email validation so that malformed emails are rejected | 🟢 LOW | 1.0 |
| **JSON parse errors** | US-EDGE-020: As System, I need JSON validation so that malformed JSON returns 400 | 🟡 MEDIUM | 1.5 |

**Test Scenarios Needed** (5 examples):
1. ⚠️ List SDs when database is empty → return []
2. ⚠️ List 1000 SDs with pagination → return paginated results
3. ⚠️ Two users update same SD simultaneously → last write wins or conflict
4. ⚠️ Submit same SDIP submission twice → return existing SD
5. ⚠️ Pass invalid UUID 'abc123' → return 400 with validation error

**Estimated Effort**: 32.5 hours

---

## Part 8: Performance & Load Testing

### 8.1 Performance Scenarios

**Status**: ❌ MISSING (0/10 = 0% coverage)

| Scenario | User Story | Priority | Effort (hrs) |
|----------|------------|----------|--------------|
| **100 concurrent requests** | US-PERF-001: As System, I need load handling so that API doesn't crash under traffic | 🔴 CRITICAL | 3.0 |
| **10MB payload** | US-PERF-002: As System, I need payload limits so that large requests don't overwhelm memory | 🟡 MEDIUM | 2.0 |
| **1000 WebSocket connections** | US-PERF-003: As System, I need connection limits so that WebSocket doesn't exhaust resources | 🔴 CRITICAL | 3.5 |
| **Database query >5s** | US-PERF-004: As System, I need slow query detection so that I can optimize bottlenecks | 🟡 MEDIUM | 2.5 |
| **LLM call timeout (30s)** | US-PERF-005: As System, I need LLM timeouts so that slow AI calls don't hang | 🔴 CRITICAL | 2.5 |
| **Memory leak detection** | US-PERF-006: As System, I need memory monitoring so that leaks are caught early | 🟡 MEDIUM | 3.0 |
| **CPU spike >80%** | US-PERF-007: As System, I need CPU monitoring so that high usage is alerted | 🟡 MEDIUM | 2.5 |
| **Disk I/O bottleneck** | US-PERF-008: As System, I need I/O monitoring so that disk limits don't slow API | 🟢 LOW | 2.0 |
| **Cache hit rate <50%** | US-PERF-009: As System, I need cache monitoring so that I can tune caching | 🟢 LOW | 2.0 |
| **Response time >2s** | US-PERF-010: As System, I need latency tracking so that slow endpoints are identified | 🟡 MEDIUM | 2.5 |

**Test Scenarios Needed** (3 examples):
1. ⚠️ Send 100 GET /api/sd requests in parallel → all return 200 within 5s
2. ⚠️ Send 10MB JSON payload → return 413 (Payload Too Large)
3. ⚠️ Open 1000 WebSocket connections → server doesn't crash

**Estimated Effort**: 25.5 hours

---

## Part 9: Security Testing

### 9.1 Security Scenarios

**Status**: ❌ MISSING (0/12 = 0% coverage)

| Scenario | User Story | Priority | Effort (hrs) |
|----------|------------|----------|--------------|
| **SQL injection** | US-SEC-001: As System, I need SQL sanitization so that injections are blocked | 🔴 CRITICAL | 2.5 |
| **XSS attack** | US-SEC-002: As System, I need XSS prevention so that scripts can't be injected | 🔴 CRITICAL | 2.5 |
| **CSRF attack** | US-SEC-003: As System, I need CSRF tokens so that cross-site requests are rejected | 🔴 CRITICAL | 3.0 |
| **JWT tampering** | US-SEC-004: As System, I need JWT validation so that tampered tokens are rejected | 🔴 CRITICAL | 2.5 |
| **Rate limiting** | US-SEC-005: As System, I need rate limiting so that abuse is prevented | 🔴 CRITICAL | 3.0 |
| **CORS bypass attempt** | US-SEC-006: As System, I need CORS enforcement so that unauthorized origins are blocked | 🟡 MEDIUM | 2.0 |
| **Path traversal** | US-SEC-007: As System, I need path sanitization so that ../ attacks are blocked | 🔴 CRITICAL | 2.5 |
| **Insecure direct object reference** | US-SEC-008: As System, I need authorization checks so that users can't access others' data | 🔴 CRITICAL | 2.5 |
| **Mass assignment** | US-SEC-009: As System, I need input whitelisting so that users can't inject fields | 🟡 MEDIUM | 2.0 |
| **NoSQL injection** | US-SEC-010: As System, I need NoSQL sanitization so that JSON injections are blocked | 🟡 MEDIUM | 2.5 |
| **Session fixation** | US-SEC-011: As System, I need session regeneration so that fixation attacks fail | 🟡 MEDIUM | 2.5 |
| **Clickjacking** | US-SEC-012: As System, I need X-Frame-Options so that iframes can't embed API | 🟢 LOW | 1.5 |

**Test Scenarios Needed** (4 examples):
1. ⚠️ Send SQL injection in query param → return 400, no execution
2. ⚠️ Send XSS payload in POST body → return sanitized, no script execution
3. ⚠️ Tamper with JWT signature → return 401 Unauthorized
4. ⚠️ Send 1000 requests in 1 second → return 429 Too Many Requests

**Estimated Effort**: 29 hours

---

## Part 10: Integration Testing (Cross-System)

### 10.1 Integration Scenarios

**Status**: ❌ MISSING (0/8 = 0% coverage)

| Integration | User Story | Priority | Effort (hrs) |
|-------------|------------|----------|--------------|
| **Supabase + API** | US-INT-001: As System, I need DB integration so that API writes persist | 🔴 CRITICAL | 3.0 |
| **OpenAI + API** | US-INT-002: As System, I need LLM integration so that AI features work | 🔴 CRITICAL | 3.5 |
| **WebSocket + Database** | US-INT-003: As System, I need realtime sync so that DB changes broadcast | 🔴 CRITICAL | 3.5 |
| **GitHub Actions + API** | US-INT-004: As System, I need CI integration so that webhooks update story status | 🟡 MEDIUM | 2.5 |
| **File System + API** | US-INT-005: As System, I need file watcher so that config changes reload | 🟢 LOW | 2.0 |
| **Stripe + API (future)** | US-INT-006: As System, I need payment integration so that billing works | 🟢 LOW | 3.0 |
| **SendGrid + API (future)** | US-INT-007: As System, I need email integration so that notifications send | 🟢 LOW | 2.5 |
| **S3 + API (artifacts)** | US-INT-008: As System, I need S3 integration so that large files are stored | 🟡 MEDIUM | 3.0 |

**Test Scenarios Needed** (3 examples):
1. ⚠️ Create SD via API → verify in Supabase database
2. ⚠️ Generate name via API → verify OpenAI called and response returned
3. ⚠️ Update SD in DB → verify WebSocket broadcasts to all clients

**Estimated Effort**: 23 hours

---

## Coverage Summary Table

| Category | Current | Target | Gap | Effort (hrs) |
|----------|---------|--------|-----|--------------|
| **API Endpoints** | 18/73 (25%) | 66/73 (90%) | 48 | 160.5 |
| **Database Functions** | 1/20 (5%) | 18/20 (90%) | 17 | 19.5 |
| **Database Triggers** | 0/10 (0%) | 9/10 (90%) | 9 | 22.0 |
| **WebSocket Features** | 0/6 (0%) | 5/6 (83%) | 5 | 13.0 |
| **Background Jobs** | 0/4 (0%) | 4/4 (100%) | 4 | 14.5 |
| **Error Handling** | 2/15 (13%) | 14/15 (93%) | 12 | 30.0 |
| **RBAC Scenarios** | 1/8 (13%) | 7/8 (88%) | 6 | 18.5 |
| **Edge Cases** | 0/20 (0%) | 18/20 (90%) | 18 | 32.5 |
| **Performance Testing** | 0/10 (0%) | 9/10 (90%) | 9 | 25.5 |
| **Security Testing** | 0/12 (0%) | 11/12 (92%) | 11 | 29.0 |
| **Integration Testing** | 0/8 (0%) | 7/8 (88%) | 7 | 23.0 |
| **TOTAL** | **22/186 (12%)** | **168/186 (90%)** | **146** | **388 hours** |

---

## Sprint Breakdown (4 Sprints to 90%)

### Sprint 1: Core Business Logic (Weeks 1-2)
**Goal**: Cover critical user flows
**Effort**: 80 hours (2 weeks @ 40 hrs/week)

| Priority | Feature | Effort | Coverage Gain |
|----------|---------|--------|---------------|
| 🔴 CRITICAL | SDIP 7-Step Flow | 11 hrs | +7 endpoints |
| 🔴 CRITICAL | Venture Lifecycle | 11.5 hrs | +6 endpoints |
| 🔴 CRITICAL | Backlog APIs | 10 hrs | +5 endpoints |
| 🔴 CRITICAL | Competitor Analysis | 15 hrs | +7 endpoints |
| 🔴 CRITICAL | WebSocket Features | 13 hrs | +5 features |
| 🔴 CRITICAL | Testing Campaign | 11 hrs | +6 endpoints |
| 🔴 CRITICAL | Error Handling (partial) | 8 hrs | +5 paths |

**Sprint 1 Total**: 79.5 hours → **+41 items** → **Cumulative: 63/186 (34%)**

---

### Sprint 2: AI Engines & Quality (Weeks 3-4)
**Goal**: Cover AI-powered features
**Effort**: 80 hours (2 weeks @ 40 hrs/week)

| Priority | Feature | Effort | Coverage Gain |
|----------|---------|--------|---------------|
| 🔴 CRITICAL | Naming Engine | 4.5 hrs | +2 endpoints |
| 🔴 CRITICAL | Financial Engine | 11 hrs | +5 endpoints |
| 🔴 CRITICAL | Content Forge | 9.5 hrs | +4 endpoints |
| 🔴 CRITICAL | Story Management | 10.5 hrs | +5 endpoints |
| 🔴 CRITICAL | Calibration APIs | 16.5 hrs | +7 endpoints |
| 🔴 CRITICAL | Database Functions | 19.5 hrs | +8 functions |
| 🟡 MEDIUM | Background Jobs | 14.5 hrs | +4 jobs |

**Sprint 2 Total**: 86 hours → **+35 items** → **Cumulative: 98/186 (53%)**

---

### Sprint 3: Security & RBAC (Weeks 5-6)
**Goal**: Cover advanced features
**Effort**: 80 hours (2 weeks @ 40 hrs/week)

| Priority | Feature | Effort | Coverage Gain |
|----------|---------|--------|---------------|
| 🔴 CRITICAL | Venture-Scoped APIs | 7.5 hrs | +3 endpoints |
| 🔴 CRITICAL | Database Triggers | 22 hrs | +9 triggers |
| 🔴 CRITICAL | Security Testing | 29 hrs | +11 scenarios |
| 🔴 CRITICAL | RBAC Scenarios | 18.5 hrs | +6 scenarios |
| 🟡 MEDIUM | PRD APIs | 3 hrs | +1 endpoint |

**Sprint 3 Total**: 80 hours → **+30 items** → **Cumulative: 128/186 (69%)**

---

### Sprint 4: Edge Cases & Performance (Weeks 7-8)
**Goal**: Reach 90% coverage
**Effort**: 80 hours (2 weeks @ 40 hrs/week)

| Priority | Feature | Effort | Coverage Gain |
|----------|---------|--------|---------------|
| 🔴 CRITICAL | Edge Cases (partial) | 32.5 hrs | +18 cases |
| 🔴 CRITICAL | Performance Testing | 25.5 hrs | +9 scenarios |
| 🔴 CRITICAL | Integration Testing | 23 hrs | +7 integrations |
| 🟡 MEDIUM | Dashboard APIs | 8 hrs | +8 endpoints |

**Sprint 4 Total**: 89 hours → **+42 items** → **Cumulative: 170/186 (91%)**

---

## Implementation Roadmap

### Week 1-2: EXEC Phase (Sprint 1)
1. **Day 1-3**: SDIP + Venture Lifecycle tests
2. **Day 4-6**: Backlog + Competitor Analysis tests
3. **Day 7-9**: WebSocket + Testing Campaign tests
4. **Day 10**: Error handling tests

### Week 3-4: EXEC Phase (Sprint 2)
1. **Day 1-3**: AI Engines (Naming, Financial, Content Forge)
2. **Day 4-5**: Story Management tests
3. **Day 6-7**: Calibration APIs tests
4. **Day 8-9**: Database Functions tests
5. **Day 10**: Background Jobs tests

### Week 5-6: EXEC Phase (Sprint 3)
1. **Day 1-2**: Venture-Scoped APIs tests
2. **Day 3-5**: Database Triggers tests
3. **Day 6-8**: Security Testing
4. **Day 9-10**: RBAC Scenarios tests

### Week 7-8: EXEC Phase (Sprint 4)
1. **Day 1-4**: Edge Cases tests
2. **Day 5-7**: Performance Testing
3. **Day 8-9**: Integration Testing
4. **Day 10**: Dashboard APIs + final review

---

## Success Metrics

### Coverage Targets
- **Overall**: ≥90% (168/186 items)
- **API Endpoints**: ≥90% (66/73 endpoints)
- **Database Functions**: ≥90% (18/20 functions)
- **Database Triggers**: ≥90% (9/10 triggers)
- **Security**: ≥90% (11/12 scenarios)

### Quality Targets
- **Test Execution Time**: <15 minutes for full suite
- **Flakiness Rate**: <2% (stable, deterministic tests)
- **CI Integration**: E2E tests run on every PR
- **Release Gate Compliance**: All SDs require ≥1 passing E2E test

---

## Next Steps

### Immediate Actions (LEAD Approval Required)
1. **Review and approve** this expanded gap analysis
2. **Create Strategic Directive** (SD-E2E-COVERAGE-90-001)
3. **Allocate resources** (1 developer @ 40 hrs/week for 8 weeks)
4. **Set up tracking** (GitHub Project board for 186 test scenarios)

### PLAN Phase
1. Generate detailed PRD for Sprint 1
2. Break down 79.5 hours into daily tasks
3. Create user story acceptance criteria
4. Define test data fixtures

### EXEC Phase
1. Follow sprint roadmap (Week 1-8)
2. Daily standup to track progress
3. Weekly demo to Chairman
4. Continuous refactoring of test utilities

---

**Document Owner**: QA Engineering Director (testing-agent)
**Last Updated**: 2026-01-05
**Related SDs**: SD-E2E-COVERAGE-90-001 (to be created)
**Estimated Total Effort**: 320-400 hours (8-10 weeks @ 40 hrs/week)
**Target Completion**: 90% coverage by end of Sprint 4
