# Strategic Directive Proposal: SD-LEO-TESTING-GOVERNANCE-001


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, e2e, unit

## LEO Protocol Testing Governance Enhancement

**Proposed ID:** SD-LEO-TESTING-GOVERNANCE-001
**Type:** Orchestrator (Parent SD)
**Category:** protocol
**Priority:** HIGH
**Target Application:** EHG_Engineer
**Estimated Effort:** 50-65 hours (4 child SDs)

---

## 1. Strategic Intent

Strengthen LEO Protocol testing governance by implementing mandatory test validation gates, automated evidence capture, proactive schema documentation, and quantitative retrospective metrics. This addresses systemic testing gaps identified in retrospective analysis of 27+ protocol improvement suggestions.

---

## 2. Rationale

### Evidence Base
- **16 retrospectives** cited: "Mandate TESTING sub-agent execution before EXEC→PLAN handoff"
- **14.6% of SDs** (20/137) completed without test validation
- **42-95 hours/year** lost to schema mismatches
- **4 retrospectives** requested: "Add test coverage metrics to retrospectives"

### Current State Problems
| Problem | Evidence | Impact |
|---------|----------|--------|
| TESTING sub-agent optional | SD-TECH-DEBT-DOCS-001 blocking | Quality gaps |
| Test evidence not captured | story_test_mappings empty | No traceability |
| Schema docs not in preflight | 90+ scripts with mismatches | Rework |
| Retrospectives lack metrics | No FK to test_runs | No trend analysis |

### Business Impact
- **Risk Reduction:** Prevent untested code from passing handoff gates
- **Time Savings:** 42-95 hours/year from schema mismatch prevention
- **Quality Improvement:** Quantitative test tracking enables trend analysis
- **Compliance:** Enforce protocol's stated "MANDATORY" testing policy

---

## 3. Scope

### Child Strategic Directives

| Child SD | Title | Priority | Effort |
|----------|-------|----------|--------|
| **001A** | Mandate TESTING Sub-Agent Gate | CRITICAL | 10-15h |
| **001B** | Test Evidence Auto-Capture Gate | HIGH | 15-20h |
| **001C** | Schema Documentation Loading | MEDIUM | 10-15h |
| **001D** | Test Coverage Metrics in Retrospectives | MEDIUM | 15-20h |

### In Scope
- EXEC→PLAN handoff gate additions
- Test evidence ingestion automation
- Schema context loading in phase-preflight.js
- Retrospective schema enhancement
- Unit and integration tests for new components

### Out of Scope
- UI changes to LEO Dashboard
- Changes to other handoff types (LEAD→PLAN, PLAN→EXEC)
- Test infrastructure changes (Playwright, Vitest configs)
- Coverage threshold policy changes

---

## 4. Strategic Objectives

1. **SO-1:** Achieve 100% TESTING sub-agent execution for code-producing SDs
2. **SO-2:** Automate test evidence capture with story-test mapping
3. **SO-3:** Reduce schema mismatch incidents by 80%
4. **SO-4:** Enable quantitative test trend analysis via retrospective metrics

---

## 5. Success Criteria

| Criterion | Metric | Pass Threshold |
|-----------|--------|----------------|
| TESTING enforcement | % of code SDs with TESTING pass | 100% |
| Evidence capture | story_test_mappings population rate | ≥90% |
| Schema loading | Preflight displays schema for DB SDs | 100% |
| Retro metrics | Retrospectives with test_run_id FK | ≥90% |
| No regressions | Existing handoffs continue to work | 100% |

---

## 6. Implementation Approach

### Phase 1: Testing Gates (Child A + B)
- Add MANDATORY_TESTING_VALIDATION gate (blocking)
- Add TEST_EVIDENCE_AUTO_CAPTURE gate (advisory)
- SD type exemptions for documentation/infrastructure

### Phase 2: Schema Context (Child C)
- Create schema-context-loader.js module
- Integrate into phase-preflight.js for PLAN/EXEC

### Phase 3: Retrospective Metrics (Child D)
- Database migration for new columns
- RETRO sub-agent integration
- Query v_sd_test_readiness for metrics

---

## 7. Dependencies

1. **Existing Infrastructure:**
   - `scripts/lib/test-evidence-ingest.js` (exists)
   - `v_sd_test_readiness` view (exists)
   - `docs/reference/schema/engineer/` (exists)

2. **Prerequisites:**
   - None - all infrastructure in place

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing SDs blocked unexpectedly | Medium | High | SD type exemptions, clear remediation |
| Performance impact on handoffs | Low | Medium | Lazy loading, caching |
| Schema doc parsing errors | Low | Low | Graceful fallback, warnings |
| Migration breaks retrospectives | Low | High | IF NOT EXISTS, backward compatible |

---

## 9. Child SD Summaries

### SD-LEO-TESTING-GOVERNANCE-001A: Mandate TESTING Gate
- Add `MANDATORY_TESTING_VALIDATION` gate to ExecToPlanExecutor
- Query sub_agent_execution_results for TESTING verdict
- Require PASS/CONDITIONAL_PASS, block on FAIL
- Exempt: documentation, infrastructure, orchestrator types

### SD-LEO-TESTING-GOVERNANCE-001B: Evidence Auto-Capture
- Add `TEST_EVIDENCE_AUTO_CAPTURE` gate (advisory)
- Scan playwright-report/, coverage/, test-results/
- Call ingestTestEvidence() to populate test_runs, test_results
- Auto-create story_test_mappings

### SD-LEO-TESTING-GOVERNANCE-001C: Schema Documentation Loading
- Create lib/schema-context-loader.js module
- Extract table names from SD description
- Load pre-generated schema docs
- Display in phase-preflight for PLAN/EXEC phases

### SD-LEO-TESTING-GOVERNANCE-001D: Retrospective Test Metrics
- Add test_run_id FK to retrospectives table
- Add test_pass_rate, test_total_count, story_coverage_percent columns
- Modify RETRO sub-agent to populate metrics from v_sd_test_readiness

---

## 10. Acceptance Testing Requirements

### Gate 1: Child A Complete
- [ ] TESTING gate blocks handoff when TESTING not run
- [ ] TESTING gate passes when TESTING verdict is PASS
- [ ] Documentation SDs exempt from TESTING requirement
- [ ] Remediation message guides user to fix

### Gate 2: Child B Complete
- [ ] Test reports auto-detected and ingested
- [ ] test_runs record created with correct metadata
- [ ] story_test_mappings populated from test names
- [ ] Fresh evidence skips re-ingestion

### Gate 3: Child C Complete
- [ ] Schema context displayed for PLAN phase
- [ ] Table names extracted from SD description
- [ ] Schema docs loaded from docs/reference/schema/
- [ ] Graceful handling when no tables detected

### Gate 4: Child D Complete
- [ ] Migration applies without errors
- [ ] Retrospectives include test_run_id FK
- [ ] test_pass_rate populated from v_sd_test_readiness
- [ ] Historical retrospectives unaffected (NULL values)

---

## 11. Related Documents

- `/home/rickf/.claude/plans/optimized-percolating-lynx.md` - Detailed implementation plan
- `/mnt/c/_EHG/EHG_Engineer/docs/sd-proposals/SD-E2E-UAT-COVERAGE-001.md` - Related testing SD
- `/mnt/c/_EHG/EHG_Engineer/docs/test-management/README.md` - Test management system

---

## 12. Approval

**Proposed by:** LEO Protocol Analysis (Retrospective Mining)
**Date:** 2026-01-05
**Status:** DRAFT - Pending LEAD Approval

---

*This SD follows LEO Protocol v4.3.3 standards.*
