# V1-Build Scope Definition

**SD**: SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-13
**Type**: Documentation
**Purpose**: Define what "building a venture" means operationally within the EHG Venture Vision lifecycle.

---

## 1. Build Loop Overview

The Build Loop spans **Phase 5: THE BUILD LOOP** (Stages 17-20) and **Phase 6: LAUNCH & LEARN** (Stages 21-22 for QA/Deploy, 23-25 for post-launch).

The analysis step implementations (stages 17-22) form the core build-to-deploy pipeline. Each stage consumes the previous stage's output and produces structured JSON artifacts via LLM analysis.

### Phase-Stage Mapping (Database Source of Truth)

| Stage | Name | Phase | Work Type | SD Required | SD Suffix | Dependencies |
|-------|------|-------|-----------|-------------|-----------|--------------|
| 17 | Environment & Agent Config | 5 - THE BUILD LOOP | sd_required | Yes | ENVCONFIG | [16] |
| 18 | MVP Development Loop | 5 - THE BUILD LOOP | sd_required | Yes | MVP | [17] |
| 19 | Integration & API Layer | 5 - THE BUILD LOOP | sd_required | Yes | INTEGRATION | [18] |
| 20 | Security & Performance | 5 - THE BUILD LOOP | sd_required | Yes | SECURITY | [19] |
| 21 | QA & UAT | 6 - LAUNCH & LEARN | sd_required | Yes | QA | [20] |
| 22 | Deployment & Infrastructure | 6 - LAUNCH & LEARN | sd_required | Yes | DEPLOY | [21] |

**All 6 stages require SDs** — each generates a LEO Protocol Strategic Directive for implementation tracking.

---

## 2. Stage Entry/Exit Criteria Matrix

### Stage 17: Environment & Agent Config (ENVCONFIG)

**Entry Criteria:**
- Stage 16 (Spec-Driven Schema Generation) complete
- API contracts and schema specs available
- Architecture decisions finalized (from Stage 14)

**Exit Criteria:**
- Build readiness assessment completed with `go` or `conditional_go` decision
- Minimum 3 readiness items across 3+ categories (architecture, team_readiness, tooling, environment, dependencies)
- All critical/high-priority items have status `complete`
- No critical blockers remain (blockers array empty or all resolved)

**Decision Gate:** `go` | `conditional_go` | `no_go`

**Required Artifacts:** `system_prompt`, `cicd_config`

---

### Stage 18: MVP Development Loop (MVP)

**Entry Criteria:**
- Stage 17 readiness decision is `go` or `conditional_go`
- Build readiness assessment available
- Product roadmap (Stage 13) and technical architecture (Stage 14) accessible

**Exit Criteria:**
- Sprint goal defined (specific, measurable)
- Minimum 1 sprint item generated
- Each item has: title, description, type, priority, estimatedLoc, acceptanceCriteria, architectureLayer, milestoneRef
- Items ordered by priority (critical first)
- Each item independently deliverable

**Sprint Item Types:** `feature` | `bugfix` | `enhancement` | `refactor` | `infra`

**Architecture Layers:** `frontend` | `backend` | `database` | `infrastructure` | `integration` | `security`

---

### Stage 19: Build Execution (Integration & API Layer)

**Entry Criteria:**
- Stage 18 sprint plan complete
- Sprint items defined with acceptance criteria

**Exit Criteria:**
- Each sprint item mapped to a task with status tracking
- Task statuses assigned: `pending` | `in_progress` | `done` | `blocked`
- Issues flagged with severity and status
- Sprint completion decision rendered

**Sprint Completion Decisions:**
- `complete` — all tasks done
- `continue` — in-progress work remains
- `blocked` — critical blockers exist

**QA Readiness:** `readyForQa = true` only when core functionality is testable

---

### Stage 20: Quality Assurance (Security & Performance)

**Entry Criteria:**
- Stage 19 build execution data available
- Sprint completion decision is `complete` or `continue` (not `blocked`)

**Exit Criteria:**
- Minimum 1 test suite with results
- Pass rate calculated across all suites
- Coverage percentage computed
- Quality decision rendered

**Quality Thresholds:**
- `pass`: Pass rate >= 95% AND coverage >= 60%
- `conditional_pass`: Close to thresholds (within 90% of targets)
- `fail`: Well below thresholds

**Test Suite Types:** `unit` | `integration` | `e2e`

**Defect Tracking:** Each defect has severity, status (`open` | `investigating` | `resolved` | `deferred` | `wont_fix`), and test suite reference.

**Required Artifacts:** `security_audit`

**Compliance Targets:** WCAG 2.1 AA, OWASP Top 10

---

### Stage 21: QA & UAT (Build Review)

**Entry Criteria:**
- Stage 20 QA assessment available
- Quality decision is `pass` or `conditional_pass`

**Exit Criteria:**
- All integration points tested with source/target/status/severity/environment
- Integration pass rate computed
- Review decision rendered

**Review Decisions:**
- `approve` — all integrations pass
- `conditional` — non-critical failures only
- `reject` — critical integrations fail

**Environments:** `development` | `staging` | `production`

**Required Artifacts:** `test_plan`, `uat_report`

**Test Coverage Minimum:** 80%

---

### Stage 22: Deployment & Infrastructure (Release Readiness)

**Entry Criteria:**
- Stage 20 (QA) AND Stage 21 (review) data available
- Both quality and review decisions are non-reject

**Exit Criteria:**
- Release items catalogued with category and approval status
- Release notes generated (markdown, minimum 10 chars)
- Target release date set (within 1-4 weeks)
- Release decision rendered
- Sprint retrospective completed (wentWell, wentPoorly, actionItems)
- Sprint summary with planned vs completed items

**Release Decisions:**
- `release` — both QA and review pass
- `hold` — one passes, one conditional
- `cancel` — both rejected or critical failures

**Release Categories:** `feature` | `bugfix` | `infrastructure` | `documentation` | `security` | `performance` | `configuration`

**Required Artifacts:** `deployment_runbook`

---

## 3. Artifact Manifest per Stage

| Stage | Required Artifacts | Generated JSON Keys |
|-------|-------------------|---------------------|
| 17 | system_prompt, cicd_config | readinessItems, blockers, buildReadiness |
| 18 | *(none explicit)* | sprintGoal, sprintItems, totalEstimatedLoc |
| 19 | *(none explicit)* | tasks, issues, sprintCompletion |
| 20 | security_audit | testSuites, knownDefects, qualityDecision |
| 21 | test_plan, uat_report | integrations, reviewDecision |
| 22 | deployment_runbook | releaseItems, releaseNotes, releaseDecision, sprintRetrospective, sprintSummary |

### Data Flow Chain

```
Stage 13 (Roadmap) ──┐
Stage 14 (Architecture)──┤
Stage 15 (Resources) ──┤──► Stage 17 (Readiness) ──► Stage 18 (Sprint Plan)
Stage 16 (Financial) ──┘                                    │
                                                            ▼
                                                    Stage 19 (Execution)
                                                            │
                                                            ▼
                                              Stage 20 (QA) ──► Stage 21 (Review)
                                                            │           │
                                                            └─────┬─────┘
                                                                  ▼
                                                          Stage 22 (Release)
```

---

## 4. Decision Gate Documentation

Three stages contain formal decision gates with enumerated outcomes:

### Gate 1: Build Readiness (Stage 17)
- **Location:** `analyzeStage17()` in `stage-17-build-readiness.js`
- **Decisions:** `go`, `conditional_go`, `no_go`
- **Logic:** `go` if all critical/high items complete; `conditional_go` if non-critical items pending; `no_go` if critical blockers exist
- **Conditions array:** Required for `conditional_go`, empty otherwise
- **Categories assessed:** architecture, team_readiness, tooling, environment, dependencies

### Gate 2: Quality Assessment (Stage 20)
- **Location:** `analyzeStage20()` in `stage-20-quality-assurance.js`
- **Decisions:** `pass`, `conditional_pass`, `fail`
- **Logic:** Based on composite pass rate (>= 95%) and coverage (>= 60%)
- **Derived metrics:** overallPassRate, coveragePct, totalFailures, openDefects

### Gate 3: Build Review (Stage 21)
- **Location:** `analyzeStage21()` in `stage-21-build-review.js`
- **Decisions:** `approve`, `conditional`, `reject`
- **Logic:** `approve` if all integrations pass; `reject` if critical integration fails; `conditional` otherwise
- **Conditions array:** Required for `conditional`, empty otherwise

### Gate 4: Release Decision (Stage 22)
- **Location:** `analyzeStage22()` in `stage-22-release-readiness.js`
- **Decisions:** `release`, `hold`, `cancel`
- **Logic:** `release` if both QA and review pass; `hold` if one passes; `cancel` if both fail

---

## 5. SD Generation Rules

All 6 stages in the build-to-deploy pipeline require LEO Protocol SDs:

| Stage | SD Suffix | SD Key Pattern | SD Type |
|-------|-----------|----------------|---------|
| 17 | ENVCONFIG | `SD-{VENTURE}-ENVCONFIG` | infrastructure |
| 18 | MVP | `SD-{VENTURE}-MVP` | feature |
| 19 | INTEGRATION | `SD-{VENTURE}-INTEGRATION` | feature |
| 20 | SECURITY | `SD-{VENTURE}-SECURITY` | infrastructure |
| 21 | QA | `SD-{VENTURE}-QA` | infrastructure |
| 22 | DEPLOY | `SD-{VENTURE}-DEPLOY` | infrastructure |

### SD Creation Triggers
- Stage transition from N to N+1 triggers SD creation for stage N+1
- SD `current_phase` starts at `LEAD_APPROVAL`
- SD follows full LEO Protocol: LEAD → PLAN → EXEC → handoffs → completion
- Stage cannot advance until its SD reaches `completed` status

### SD Dependency Chain
Each stage's SD depends on the previous stage's SD being completed:
```
SD-ENVCONFIG → SD-MVP → SD-INTEGRATION → SD-SECURITY → SD-QA → SD-DEPLOY
```

### LLM Integration
- All stages use `getLLMClient({ purpose: 'content-generation' })`
- Timeout: 120 seconds per stage analysis
- Output: Structured JSON with Four Buckets annotation
- Fallback: Default/minimal valid output if LLM returns insufficient data

---

## 6. Implementation Files Reference

| File | Stage | Function |
|------|-------|----------|
| `lib/eva/stage-templates/analysis-steps/stage-17-build-readiness.js` | 17 | `analyzeStage17()` |
| `lib/eva/stage-templates/analysis-steps/stage-18-sprint-planning.js` | 18 | `analyzeStage18()` |
| `lib/eva/stage-templates/analysis-steps/stage-19-build-execution.js` | 19 | `analyzeStage19()` |
| `lib/eva/stage-templates/analysis-steps/stage-20-quality-assurance.js` | 20 | `analyzeStage20()` |
| `lib/eva/stage-templates/analysis-steps/stage-21-build-review.js` | 21 | `analyzeStage21()` |
| `lib/eva/stage-templates/analysis-steps/stage-22-release-readiness.js` | 22 | `analyzeStage22()` |
| `database/migrations/20251206_lifecycle_stage_config.sql` | All | Stage/phase definitions |
| `tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts` | 17-22 | E2E test coverage |

---

*Generated by SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-13 | 2026-02-27*
