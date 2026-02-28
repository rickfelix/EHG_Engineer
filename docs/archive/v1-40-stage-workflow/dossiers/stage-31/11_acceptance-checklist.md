---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 31: MVP Launch — Acceptance Checklist


## Table of Contents

- [Scoring Rubric (8 Criteria, 100 Points Total)](#scoring-rubric-8-criteria-100-points-total)
- [Criterion 1: Canonical Accuracy (15 points)](#criterion-1-canonical-accuracy-15-points)
- [Criterion 2: Evidence Quality (15 points)](#criterion-2-evidence-quality-15-points)
- [Criterion 3: Actionability (15 points)](#criterion-3-actionability-15-points)
- [Criterion 4: Cross-Reference Integrity (10 points)](#criterion-4-cross-reference-integrity-10-points)
- [Criterion 5: Gap Analysis Depth (15 points)](#criterion-5-gap-analysis-depth-15-points)
- [Criterion 6: Agent/Recursion Design (10 points)](#criterion-6-agentrecursion-design-10-points)
- [Criterion 7: Metrics/Monitoring Completeness (10 points)](#criterion-7-metricsmonitoring-completeness-10-points)
- [Criterion 8: Professional Polish (10 points)](#criterion-8-professional-polish-10-points)
- [Final Score Calculation](#final-score-calculation)
- [Revision History (If Applicable)](#revision-history-if-applicable)
- [Evaluator Sign-Off](#evaluator-sign-off)
- [Self-Assessment (Optional Pre-Check)](#self-assessment-optional-pre-check)
- [Acceptance Criteria Summary](#acceptance-criteria-summary)
- [Sources Table](#sources-table)

**Purpose**: Score this Stage 31 Operating Dossier against 8 criteria (target ≥90/100 points) to validate completeness and quality.

**Version**: 1.0
**Date**: 2025-11-06
**Evaluator**: (To be completed by LEAD phase reviewer)

---

## Scoring Rubric (8 Criteria, 100 Points Total)

| # | Criterion | Weight | Max Points | Actual Score | Status |
|---|-----------|--------|------------|--------------|--------|
| 1 | **Canonical Accuracy** | 15% | 15 | ___ / 15 | ⬜ |
| 2 | **Evidence Quality** | 15% | 15 | ___ / 15 | ⬜ |
| 3 | **Actionability** | 15% | 15 | ___ / 15 | ⬜ |
| 4 | **Cross-Reference Integrity** | 10% | 10 | ___ / 10 | ⬜ |
| 5 | **Gap Analysis Depth** | 15% | 15 | ___ / 15 | ⬜ |
| 6 | **Agent/Recursion Design** | 10% | 10 | ___ / 10 | ⬜ |
| 7 | **Metrics/Monitoring Completeness** | 10% | 10 | ___ / 10 | ⬜ |
| 8 | **Professional Polish** | 10% | 10 | ___ / 10 | ⬜ |
| | **TOTAL** | **100%** | **100** | **___ / 100** | ⬜ |

**Pass Threshold**: ≥90/100 points
**Status Key**: ✅ Pass (≥90), ⚠️ Near Pass (80-89), ❌ Fail (<80)

---

## Criterion 1: Canonical Accuracy (15 points)

**Definition**: Dossier faithfully represents Stage 31 definition from `stages.yaml:1379-1425` without distortion or speculation.

**Scoring Guide**:
- **15 points**: 100% accurate (all YAML fields correctly transcribed, no invented details)
- **12 points**: 95-99% accurate (1-2 minor discrepancies, e.g., paraphrased substage titles)
- **9 points**: 90-94% accurate (3-4 minor errors, no major misrepresentations)
- **6 points**: 80-89% accurate (5+ errors or 1 major misrepresentation)
- **0 points**: <80% accurate (significant fabrication or missing core YAML fields)

**Checklist**:
- [ ] Stage ID 31 correctly stated (01_overview.md, all files)
- [ ] Title "MVP Launch" exact match (not paraphrased)
- [ ] Description matches YAML line 1381 exactly
- [ ] Dependency on Stage 30 correctly stated (no additional dependencies invented)
- [ ] 3 inputs listed (Launch plan, Marketing materials, Support resources) - exact match
- [ ] 3 outputs listed (Live product, Launch metrics, User feedback) - exact match
- [ ] 3 metrics listed (Launch success rate, User acquisition, Engagement metrics) - exact match
- [ ] 3 entry gates listed (Production stable, Marketing ready, Support trained) - exact match
- [ ] 3 exit gates listed (Launch executed, Users onboarded, Metrics flowing) - exact match
- [ ] 3 substages (31.1, 31.2, 31.3) with correct titles and `done_when` conditions
- [ ] Progression mode "Manual → Assisted → Auto (suggested)" noted (stages.yaml:1425)

**Evidence Sources**:
- 03_canonical-definition.md (full YAML excerpt, lines 1379-1425)
- All other files reference stages.yaml fields

**Evaluator Notes**:
_[Space for reviewer to note any discrepancies]_

**Score**: ___ / 15

---

## Criterion 2: Evidence Quality (15 points)

**Definition**: Every claim backed by source citation in format `{repo}@{shortSHA}:{path}:{lines} "excerpt"`.

**Scoring Guide**:
- **15 points**: ≥95% of claims have evidence (0-2 unsourced claims across all 11 files)
- **12 points**: 90-94% evidence coverage (3-5 unsourced claims)
- **9 points**: 85-89% evidence coverage (6-10 unsourced claims)
- **6 points**: 80-84% evidence coverage (11-15 unsourced claims)
- **0 points**: <80% evidence coverage (widespread speculation)

**Checklist**:
- [ ] All stages.yaml references include `EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:{lines}`
- [ ] All critique references include `docs/workflow/critique/stage-31.md:{lines}`
- [ ] Sources Tables present in all 11 files (footer of each file)
- [ ] Proposed SDs (SD-LAUNCH-AUTOMATION-001, etc.) clearly marked as "proposed" not "implemented"
- [ ] No speculation about unwritten code (e.g., "LaunchCrew is deployed" vs. "LaunchCrew proposed")
- [ ] Cross-references to other stages (17, 30, 32) are verifiable (linked to stages.yaml)

**Sample Evidence Audit** (spot-check 10 claims):
1. _[Claim from 01_overview.md]_: Source? ✅/❌
2. _[Claim from 04_current-assessment.md]_: Source? ✅/❌
3. _[Claim from 06_agent-orchestration.md]_: Source? ✅/❌
4. ... (continue for 10 claims)

**Evaluator Notes**:
_[Space for reviewer to note unsourced claims]_

**Score**: ___ / 15

---

## Criterion 3: Actionability (15 points)

**Definition**: Dossier provides clear, executable guidance for Stage 31 implementation (not just descriptive).

**Scoring Guide**:
- **15 points**: Highly actionable (SOP step-by-step, agent specs implementable, metrics queries runnable)
- **12 points**: Mostly actionable (90-95% implementable, 1-2 vague sections)
- **9 points**: Somewhat actionable (80-89% implementable, multiple vague sections)
- **6 points**: Minimally actionable (70-79% implementable, primarily descriptive)
- **0 points**: Not actionable (<70% implementable, no execution detail)

**Checklist**:
- [ ] **05_professional-sop.md**: Step-by-step procedures for Substages 31.1, 31.2, 31.3 (duration, owner, actions, deliverables)
- [ ] **06_agent-orchestration.md**: LaunchCrew agents have clear responsibilities, inputs, outputs, tool integrations
- [ ] **07_recursion-blueprint.md**: LAUNCH-001/002/003/004 triggers have detection methods, corrective actions, exit criteria
- [ ] **08_configurability-matrix.md**: Config parameters with default values, ranges, venture-specific guidance
- [ ] **09_metrics-monitoring.md**: Supabase queries are syntactically correct and runnable (SQL validated)
- [ ] **10_gaps-backlog.md**: Proposed SDs have problem statements, acceptance criteria, estimated effort
- [ ] **11_acceptance-checklist.md** (this file): Clear scoring rubric for self-evaluation

**Actionability Test** (can a developer implement Stage 31 from dossier alone?):
- [ ] Can create entry gate validation checklist (05_professional-sop.md Step 1.1)
- [ ] Can build LaunchCoordinator agent (06_agent-orchestration.md specs)
- [ ] Can implement LAUNCH-001 trigger (07_recursion-blueprint.md detection + actions)
- [ ] Can configure launch timing parameters (08_configurability-matrix.md)
- [ ] Can run Supabase query for user acquisition (09_metrics-monitoring.md)

**Evaluator Notes**:
_[Space for reviewer to note vague or unimplementable sections]_

**Score**: ___ / 15

---

## Criterion 4: Cross-Reference Integrity (10 points)

**Definition**: Links to other stages, SDs, and dossier files are accurate and consistent.

**Scoring Guide**:
- **10 points**: 100% cross-reference accuracy (all links valid, no broken references)
- **8 points**: 95-99% accuracy (1-2 minor errors, e.g., wrong line number)
- **6 points**: 90-94% accuracy (3-4 errors)
- **4 points**: 85-89% accuracy (5+ errors)
- **0 points**: <85% accuracy (widespread broken links)

**Checklist**:
- [ ] **Stage 30 (Production Deployment)**: Referenced as dependency (stages.yaml:1382-1383) in 01_overview, 02_stage-map, 03_canonical-definition
- [ ] **Stage 32 (Customer Success)**: Referenced as next stage in 01_overview, 02_stage-map, 05_professional-sop (handoff)
- [ ] **Stage 17 (GTM Strategy)**: Referenced as input provider (launch plan, marketing materials) in 02_stage-map, 05_professional-sop
- [ ] **SD-METRICS-FRAMEWORK-001**: Referenced as P0 blocker in 10_gaps-backlog, 09_metrics-monitoring
- [ ] **SD-DEPLOYMENT-AUTOMATION-001**: Referenced as Stage 30 prerequisite in 02_stage-map, 10_gaps-backlog
- [ ] **SD-LAUNCH-AUTOMATION-001**: Proposed in 10_gaps-backlog, referenced in 06_agent-orchestration, 07_recursion-blueprint
- [ ] **SD-LAUNCH-ROLLBACK-001**: Proposed in 10_gaps-backlog, referenced in 07_recursion-blueprint
- [ ] **Dossier file cross-links**: 01_overview "Next: See 02_stage-map", 06_agent-orchestration "see 07_recursion-blueprint", etc.

**Verification Sample** (spot-check 5 cross-references):
1. 02_stage-map.md "Stage 30" link → stages.yaml line 1382? ✅/❌
2. 10_gaps-backlog.md "SD-METRICS-FRAMEWORK-001" → status=queued? ✅/❌
3. 06_agent-orchestration.md "see 07_recursion-blueprint.md" → file exists? ✅/❌
4. ... (continue for 5 cross-refs)

**Evaluator Notes**:
_[Space for reviewer to note broken links]_

**Score**: ___ / 10

---

## Criterion 5: Gap Analysis Depth (15 points)

**Definition**: 10_gaps-backlog.md identifies real implementation gaps with evidence and proposes actionable solutions.

**Scoring Guide**:
- **15 points**: Comprehensive gap analysis (≥5 gaps identified, all with evidence, proposed SDs actionable)
- **12 points**: Strong gap analysis (4 gaps, mostly actionable SDs)
- **9 points**: Adequate gap analysis (3 gaps, some vague SDs)
- **6 points**: Weak gap analysis (1-2 gaps, no proposed SDs)
- **0 points**: No gap analysis (<1 gap identified)

**Checklist**:
- [ ] **Gap 1 (No Automation)**: Identified with critique line 24 evidence, SD-LAUNCH-AUTOMATION-001 proposed
- [ ] **Gap 2 (No Rollback)**: Identified with critique lines 25, 48-50 evidence, SD-LAUNCH-ROLLBACK-001 proposed
- [ ] **Gap 3 (No Thresholds)**: Identified with critique line 38 evidence, blocked by SD-METRICS-FRAMEWORK-001
- [ ] **Gap 4 (Unclear Data Flow)**: Identified with critique lines 44-45 evidence, addressed in 05_professional-sop.md
- [ ] **Gap 5 (Missing Tool Integrations)**: Identified with critique line 26 evidence, included in SD-LAUNCH-AUTOMATION-001
- [ ] **Gap 6 (No Error Handling)**: Identified with critique line 27 evidence, addressed in 07_recursion-blueprint.md
- [ ] **Proposed SDs have**: Problem statement, proposed solution, estimated effort, dependencies, acceptance criteria
- [ ] **Gap prioritization**: By severity (CRITICAL, HIGH, MODERATE) and proposed priority (P0, P1, P2)
- [ ] **Cross-stage impact**: Identifies how Stage 31 improvements enable Stages 32, 33, 34

**Gap Quality Test**:
- [ ] Gaps are real (not invented concerns without evidence)
- [ ] Gaps are significant (impact launch quality, not cosmetic)
- [ ] Proposed SDs address root causes (not just symptoms)

**Evaluator Notes**:
_[Space for reviewer to assess gap analysis quality]_

**Score**: ___ / 15

---

## Criterion 6: Agent/Recursion Design (10 points)

**Definition**: 06_agent-orchestration.md and 07_recursion-blueprint.md provide implementable AI agent architecture.

**Scoring Guide**:
- **10 points**: Fully specified (4 agents with responsibilities, tools, mermaid diagrams, 4 recursion triggers with thresholds)
- **8 points**: Well-specified (agents + recursion mostly complete, 1-2 missing details)
- **6 points**: Partially specified (agents outlined but vague responsibilities, recursion triggers incomplete)
- **4 points**: Minimally specified (agent names only, no recursion detail)
- **0 points**: Not specified (no agent architecture proposed)

**Checklist**:
- [ ] **4 Agents Proposed**: LaunchCoordinator, MarketingOrchestrator, SupportReadinessSpecialist, MetricsTracker
- [ ] **Agent Specs Include**: Role, substages covered, responsibilities (5+ items), inputs, outputs, automation capabilities, tool integrations
- [ ] **Crew Orchestration Flow**: Mermaid diagrams for Substages 31.1, 31.2, 31.3 (sequence diagrams showing agent collaboration)
- [ ] **4 Recursion Triggers**: LAUNCH-001 (issues detected), LAUNCH-002 (low acquisition), LAUNCH-003 (support overwhelmed), LAUNCH-004 (success confirmed)
- [ ] **Trigger Specs Include**: Condition, detection method, invoked agent, corrective actions (5+ steps), recursion exit, fallback
- [ ] **Recursion Decision Tree**: Mermaid diagram showing trigger logic and agent invocation
- [ ] **Configurable Thresholds**: Linked to 08_configurability-matrix.md (e.g., rollback_trigger_uptime: 90%)
- [ ] **Integration with Metrics**: LAUNCH-001/002/003/004 thresholds use metrics from 09_metrics-monitoring.md

**Agent Architecture Test**:
- [ ] Can an engineer implement LaunchCoordinator from spec? (responsibilities clear, tools specified)
- [ ] Can LAUNCH-001 trigger be coded? (detection method + corrective actions executable)

**Evaluator Notes**:
_[Space for reviewer to assess agent/recursion design]_

**Score**: ___ / 10

---

## Criterion 7: Metrics/Monitoring Completeness (10 points)

**Definition**: 09_metrics-monitoring.md defines measurable KPIs with Supabase queries and dashboards.

**Scoring Guide**:
- **10 points**: Complete metrics coverage (3 primary + 3 secondary metrics, Supabase queries, 3 dashboards, alerting strategy)
- **8 points**: Strong metrics coverage (3 primary metrics + queries + 2 dashboards)
- **6 points**: Adequate metrics coverage (3 primary metrics, queries incomplete, 1 dashboard)
- **4 points**: Weak metrics coverage (metrics listed, no queries or dashboards)
- **0 points**: Incomplete (<3 primary metrics or no measurement method)

**Checklist**:
- [ ] **3 Primary Metrics Defined**: Launch success rate, User acquisition, Engagement metrics (from stages.yaml:1392-1395)
- [ ] **Metrics Include**: Definition, type, target threshold, measurement frequency, formula, data sources
- [ ] **Supabase Queries**: SQL queries for launch_uptime_log, user_acquisition, user_activity_log (syntactically correct)
- [ ] **Secondary Metrics**: Marketing campaign performance, Support ticket volume, System health (DevOps)
- [ ] **3 Dashboards Designed**: Executive summary (LEAD), Operational details (DevOps/Marketing), User behavior analytics (Product)
- [ ] **Alerting Strategy**: Critical (P0), Warning (P1), Info (FYI) alerts with conditions, recipients, actions
- [ ] **Monitoring Tools**: Recommended stack (Datadog, Google Analytics, Mixpanel, Mailchimp, Zendesk, Supabase)
- [ ] **Validation Criteria**: Substage 31.3 exit gate "Metrics flowing" pass conditions (7 items)

**Metrics Quality Test**:
- [ ] Can Supabase queries be run as-written? (test SQL syntax in psql or Supabase dashboard)
- [ ] Are target thresholds realistic? (e.g., 95% uptime, 500 users in 7 days - not absurd like 100% uptime or 1M users)
- [ ] Are dashboards implementable? (mockup sufficient for Grafana/Metabase build)

**Evaluator Notes**:
_[Space for reviewer to assess metrics completeness]_

**Score**: ___ / 10

---

## Criterion 8: Professional Polish (10 points)

**Definition**: Dossier is well-formatted, readable, consistent, and error-free.

**Scoring Guide**:
- **10 points**: Excellent (consistent formatting, no typos, clear headers, professional tone)
- **8 points**: Good (minor formatting inconsistencies, 1-2 typos, mostly professional)
- **6 points**: Adequate (noticeable formatting issues, 3-5 typos, readable but rough)
- **4 points**: Poor (inconsistent formatting, 6+ typos, hard to follow)
- **0 points**: Unacceptable (unreadable, pervasive errors)

**Checklist**:
- [ ] **Consistent Formatting**: All 11 files use same header hierarchy (# > ## > ###), tables formatted uniformly
- [ ] **Headers Present**: Every file has title, purpose statement, sources table, footer
- [ ] **Footer Correct**: `<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->` on all files
- [ ] **No Typos**: Spell-checked (Stage "31" not "3l", "Launch" not "Lanch", etc.)
- [ ] **Markdown Valid**: Tables render correctly, mermaid diagrams valid syntax, code blocks formatted
- [ ] **Professional Tone**: No colloquialisms, emojis used sparingly (only in status indicators), clear technical language
- [ ] **Readable Length**: No file >10,000 words (except 05_professional-sop.md allowed longer for step-by-step detail)
- [ ] **Sources Tables**: Formatted consistently (5 columns: Source, Repo, Commit, Path, Lines, Excerpt)

**Formatting Audit** (spot-check 3 files):
1. 01_overview.md: Header hierarchy correct? ✅/❌
2. 06_agent-orchestration.md: Mermaid diagrams render? ✅/❌
3. 09_metrics-monitoring.md: Tables formatted? ✅/❌

**Evaluator Notes**:
_[Space for reviewer to note formatting issues or typos]_

**Score**: ___ / 10

---

## Final Score Calculation

| Criterion | Points Earned | Max Points |
|-----------|---------------|------------|
| 1. Canonical Accuracy | ___ | 15 |
| 2. Evidence Quality | ___ | 15 |
| 3. Actionability | ___ | 15 |
| 4. Cross-Reference Integrity | ___ | 10 |
| 5. Gap Analysis Depth | ___ | 15 |
| 6. Agent/Recursion Design | ___ | 10 |
| 7. Metrics/Monitoring Completeness | ___ | 10 |
| 8. Professional Polish | ___ | 10 |
| **TOTAL** | **___** | **100** |

**Final Status**:
- ✅ **PASS** (≥90 points): Dossier approved, ready for production use
- ⚠️ **NEAR PASS** (80-89 points): Minor revisions required, re-score after fixes
- ❌ **FAIL** (<80 points): Major revisions required, fundamental rework needed

---

## Revision History (If Applicable)

| Version | Date | Evaluator | Score | Status | Changes Made |
|---------|------|-----------|-------|--------|--------------|
| 1.0 | 2025-11-06 | (TBD) | ___ / 100 | ⬜ | Initial submission |
| 1.1 | (TBD) | (TBD) | ___ / 100 | ⬜ | (Revisions after feedback) |

---

## Evaluator Sign-Off

**Evaluator Name**: ___________________________
**Role**: LEAD / Technical Reviewer / QA Lead (circle one)
**Date**: ___________________________
**Signature**: ___________________________

**Comments**:
_[Space for overall assessment, strengths, weaknesses, recommendations]_

---

## Self-Assessment (Optional Pre-Check)

**Before submitting to LEAD, author can self-score using this rubric:**

**Author Self-Score**: ___ / 100

**Confidence Level**:
- [ ] High confidence (≥90 self-scored, ready for review)
- [ ] Medium confidence (80-89 self-scored, expect minor revisions)
- [ ] Low confidence (<80 self-scored, request pre-review feedback)

**Known Weaknesses** (to address before submission):
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## Acceptance Criteria Summary

**To PASS (≥90/100), dossier must demonstrate**:
1. ✅ **Canonical Accuracy**: 100% faithful to stages.yaml (no fabrication)
2. ✅ **Evidence Quality**: ≥95% of claims sourced (EHG_Engineer@6ef8cf4)
3. ✅ **Actionability**: Step-by-step SOPs, implementable agent specs, runnable queries
4. ✅ **Cross-Reference Integrity**: All stage/SD links valid and consistent
5. ✅ **Gap Analysis Depth**: ≥5 gaps identified with evidence, actionable SDs proposed
6. ✅ **Agent/Recursion Design**: 4 agents + 4 recursion triggers fully specified
7. ✅ **Metrics/Monitoring**: 3 primary metrics + Supabase queries + 3 dashboards + alerts
8. ✅ **Professional Polish**: Consistent formatting, no typos, clear writing

**If ANY criterion scores <6 points, automatic FAIL (requires major rework)**

---

## Sources Table

| Source | Repo | Commit | Path | Lines | Excerpt |
|--------|------|--------|------|-------|---------|
| Rubric framework | EHG_Engineer | 6ef8cf4 | docs/workflow/dossiers/stage-01/11_acceptance-checklist.md | N/A | "Template adapted from Stage 1 dossier" |
| Overall score target | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-31.md | 16 | "Overall: 2.9" (target improvement to ≥3.5) |
| Stages.yaml | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1379-1425 | "Stage 31: MVP Launch" (canonical source) |

---

<!-- Generated by Claude Code Phase 11 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
