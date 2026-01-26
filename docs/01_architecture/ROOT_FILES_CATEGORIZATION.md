# Root-Level Files Categorization & Move Plan


## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: database, api, testing, e2e

**Date**: 2025-10-24
**Purpose**: Categorize 110 root-level markdown files and plan moves to appropriate directories
**Status**: Categorization complete - awaiting moves

---

## Executive Summary

**Total Files**: 110 markdown files at `/docs/` root level
**Should Remain**: ~5 files (README.md, DOCUMENTATION_STANDARDS.md, index files)
**Should Move**: ~105 files (95% of root files)

**Target State**: Clean root with only essential index/standards files

---

## Categorization by Target Directory

### Keep at Root (5 files)

| File | Reason |
|------|--------|
| `README.md` | Main documentation index |
| `DOCUMENTATION_STANDARDS.md` | Standards reference |
| `FILE_NUMBERING_AUDIT.md` | Cross-directory audit |
| `DIRECTORY_STRUCTURE.md` | (If exists - structural reference) |
| `CONTEXT_OPTIMIZATION_GUIDE.md` | Cross-cutting concern |

---

### Move to `/docs/guides/` (33 files)

**How-to guides, setup instructions, usage guides**

| File | New Location |
|------|--------------|
| `BACKLOG_MANAGEMENT_GUIDE.md` | `guides/backlog-management.md` |
| `CAMPAIGN-MONITORING-GUIDE.md` | `guides/campaign-monitoring.md` |
| `DATABASE_CONNECTION_GUIDE.md` | `guides/database-connection.md` |
| `DATABASE_MIGRATION_CHECKLIST.md` | `guides/database-migration-checklist.md` |
| `database-migration-validation-guide.md` | `guides/database-migration-validation.md` |
| `DESIGN_UI_UX_WORKFLOW.md` | `guides/design-ui-ux-workflow.md` |
| `PRD_CREATION_PROCESS.md` | `guides/prd-creation-process.md` |
| `PRD_DEVELOPER_GUIDE.md` | `guides/prd-developer-guide.md` |
| `QA-DIRECTOR-USAGE-GUIDE.md` | `guides/qa-director-usage.md` |
| `REAL-TESTING-CAMPAIGN-GUIDE.md` | `guides/real-testing-campaign.md` |
| `SD_KEY_FIX_GUIDE.md` | `guides/sd-key-fix.md` |
| `SEMANTIC_SEARCH_DEPLOYMENT_GUIDE.md` | `guides/semantic-search-deployment.md` |
| `SUB_AGENT_ACTIVATION_GUIDE.md` | `guides/sub-agent-activation.md` |
| `SUPABASE_CONNECTIVITY_GUIDE.md` | `guides/supabase-connectivity.md` |
| `bmad-user-guide.md` | `guides/bmad-user-guide.md` |
| `dashboard-guide.md` | `guides/dashboard-guide.md` |
| `lead-intent-clarification-guide.md` | `guides/lead-intent-clarification.md` |
| `learning-history-integration-guide.md` | `guides/learning-history-integration.md` |
| `leo-protocol-enforcement-guide.md` | `guides/leo-protocol-enforcement.md` |
| `team-migration-guide.md` | `guides/team-migration.md` |
| `uat-manual-test-logical-order.md` | `guides/uat-manual-test-logical-order.md` |
| `DATABASE_ARCHITECTURE_GUIDE.md` | `guides/database-architecture.md` |
| `LEO_CI_CD_INTEGRATION_SETUP.md` | `guides/leo-ci-cd-integration-setup.md` |
| `SEMANTIC_SEARCH_DEPLOYMENT_CHECKLIST.md` | `guides/semantic-search-deployment-checklist.md` |
| `TESTING_DEBUGGING_COLLABORATION_PLAYBOOK.md` | `guides/testing-debugging-collaboration-playbook.md` |
| `EHG_UAT_Script.md` | `guides/ehg-uat-script.md` |
| `ENHANCED_TESTING_INTEGRATION_GUIDE.md` | `guides/enhanced-testing-integration.md` |
| `ENHANCED_TESTING_TROUBLESHOOTING.md` | `guides/enhanced-testing-troubleshooting.md` |
| `integration-fixes-knowledge-001.md` | `guides/integration-fixes-knowledge-001.md` |
| `vision-qa-system.md` | `guides/vision-qa-system.md` |
| `LEO_PROTOCOL_QUICK_REFERENCE.md` | `guides/leo-protocol-quick-reference.md` |
| `multi-app-protocol.md` | `guides/multi-app-protocol.md` |
| `ARCHITECTURAL_GUIDELINES.md` | `guides/architectural-guidelines.md` |

---

### Move to `/docs/reference/` (12 files)

**Quick reference, patterns, system documentation**

| File | New Location |
|------|--------------|
| `AGENT_SUBAGENT_BACKSTORY_SYSTEM.md` | `reference/agent-subagent-backstory-system.md` |
| `boundary-examples.md` | `reference/boundary-examples.md` |
| `overflow-prevention-patterns.md` | `reference/overflow-prevention-patterns.md` |
| `parallel-execution-patterns.md` | `reference/parallel-execution-patterns.md` |
| `preventing-missed-subagents.md` | `reference/preventing-missed-subagents.md` |
| `refactoring-patterns.md` | `reference/refactoring-patterns.md` |
| `sd-completion-critical-fields.md` | `reference/sd-completion-critical-fields.md` |
| `leo-hook-feedback-system.md` | `reference/leo-hook-feedback-system.md` |
| `DESIGN_SUBAGENT_APPLICATION_EXPERTISE.md` | `reference/design-subagent-application-expertise.md` |
| `GENERIC_SUB_AGENT_EXECUTOR_FRAMEWORK.md` | `reference/generic-sub-agent-executor-framework.md` |
| `PRD_PREVENTION_IMPLEMENTATION.md` | `reference/prd-prevention-implementation.md` |
| `EXEC_CONTEXT.md` | `reference/exec-context.md` |

---

### Move to `/docs/database/` (8 files)

**Database-specific documentation**

| File | New Location |
|------|--------------|
| `DATABASE_ARCHITECTURE.md` | `database/architecture.md` |
| `DATABASE_LOADER_CONSOLIDATION.md` | `database/loader-consolidation.md` |
| `DATABASE_SUB_AGENT_VERIFICATION_REPORT.md` | `database/sub-agent-verification-report.md` |
| `SUPABASE_CONNECTION_FIXED.md` | `database/supabase-connection-fixed.md` |

---

### Move to `/docs/05_testing/` (14 files)

**Testing documentation**

| File | New Location |
|------|--------------|
| `TESTING_ARCHITECTURE.md` | `05_testing/architecture.md` |
| `ENHANCED_TESTING_API_REFERENCE.md` | `05_testing/enhanced-api-reference.md` |
| `ENHANCED_TESTING_ARCHITECTURE.md` | `05_testing/enhanced-architecture.md` |
| `ENHANCED_TESTING_DEBUGGING_README.md` | `05_testing/enhanced-debugging-readme.md` |
| `ENHANCED_TESTING_INDEX.md` | `05_testing/enhanced-index.md` |
| `E2E-TEST-RESULTS-SD-TEST-001.md` | `05_testing/e2e-test-results-sd-test-001.md` |
| `COMPLETED-SDS-TESTING-CAMPAIGN-REPORT.md` | `05_testing/completed-sds-testing-campaign-report.md` |
| `DASHBOARD_TEST_REPORT.md` | `05_testing/dashboard-test-report.md` |
| `SUB_AGENT_ENHANCEMENTS_TEST_PLAN.md` | `05_testing/sub-agent-enhancements-test-plan.md` |
| `REAL-TESTING-IMPLEMENTATION-SUMMARY.md` | `05_testing/real-testing-implementation-summary.md` |
| `UI_VALIDATION_REPORT.md` | `05_testing/ui-validation-report.md` |

---

### Move to `/docs/03_protocols_and_standards/` (5 files)

**Protocol documentation**

| File | New Location |
|------|--------------|
| `LEO_PROTOCOL_COMPLIANCE_REPORT_SDIP.md` | `03_protocols_and_standards/compliance-report-sdip.md` |
| `LEO_PROTOCOL_OBSERVATIONS_2025-09-03.md` | `03_protocols_and_standards/observations-2025-09-03.md` |
| `LEO_PROTOCOL_v4.2_DYNAMIC_CHECKLISTS.md` | `03_protocols_and_standards/LEO_v4.2_dynamic_checklists.md` |
| `LEO_PROTOCOL_v4.3_SUBAGENT_ENFORCEMENT.md` | `03_protocols_and_standards/LEO_v4.3_subagent_enforcement.md` |
| `LEO_PRD_AUTOMATION.md` | `03_protocols_and_standards/leo-prd-automation.md` |

---

### Move to `/docs/summaries/` (25 files)

**Implementation summaries, completion reports**

| File | New Location |
|------|--------------|
| `AUTOMATION_COMPLETE.md` | `summaries/implementations/automation-complete.md` |
| `AUTOMATION_OVERVIEW.md` | `summaries/implementations/automation-overview.md` |
| `DOCUMENTATION_REORGANIZATION_COMPLETE.md` | `summaries/implementations/documentation-reorganization-complete.md` |
| `NAVIGATION_FIXES_COMPLETE.md` | `summaries/implementations/navigation-fixes-complete.md` |
| `PLAYWRIGHT_INTEGRATION_SUMMARY.md` | `summaries/implementations/playwright-integration-summary.md` |
| `REMEDIATION_COMPLETE.md` | `summaries/implementations/remediation-complete.md` |
| `SD_SCRIPT_FIX_FINAL_REPORT.md` | `summaries/implementations/sd-script-fix-final-report.md` |
| `SD_SCRIPT_FIX_PROGRESS.md` | `summaries/implementations/sd-script-fix-progress.md` |
| `SD_SCRIPT_FIX_SUMMARY.md` | `summaries/implementations/sd-script-fix-summary.md` |
| `SEMANTIC_COMPONENT_SELECTOR_DEPLOYMENT.md` | `summaries/implementations/semantic-component-selector-deployment.md` |
| `SUB_AGENT_DEPLOYMENT_SUMMARY.md` | `summaries/implementations/sub-agent-deployment-summary.md` |
| `SUB_AGENT_ENHANCEMENTS_SUMMARY.md` | `summaries/implementations/sub-agent-enhancements-summary.md` |
| `SUB_AGENT_IMPROVEMENTS_SUMMARY.md` | `summaries/implementations/sub-agent-improvements-summary.md` |
| `subagent-automation-implementation.md` | `summaries/implementations/subagent-automation-implementation.md` |
| `orchestrator-bug-fix-summary.md` | `summaries/implementations/orchestrator-bug-fix-summary.md` |
| `sd-knowledge-001-implementation-summary.md` | `summaries/implementations/sd-knowledge-001-implementation-summary.md` |
| `MONITORING-SYSTEM-SUMMARY.md` | `summaries/implementations/monitoring-system-summary.md` |
| `PRD_FIX_COMPLETE_REPORT.md` | `summaries/implementations/prd-fix-complete-report.md` |
| `CODE_REVIEW_SD-2025-001.md` | `summaries/sd-sessions/code-review-sd-2025-001.md` |
| `EXEC_AGENT_CLARIFICATION.md` | `summaries/sd-sessions/exec-agent-clarification.md` |
| `LEAD_APPROVAL_DECISION.md` | `summaries/sd-sessions/lead-approval-decision.md` |
| `LEAD_FINAL_APPROVAL_SD-2025-001.md` | `summaries/sd-sessions/lead-final-approval-sd-2025-001.md` |
| `PLAN-SD-2025-001-Technical-Specs.md` | `summaries/sd-sessions/plan-sd-2025-001-technical-specs.md` |
| `PLAN_VERIFICATION_COMPLETE_SD-2025-001.md` | `summaries/sd-sessions/plan-verification-complete-sd-2025-001.md` |
| `TUNING_PLAN_WEEK_1.md` | `summaries/tuning-plan-week-1.md` |

---

### Move to `/docs/reports/` (13 files)

**Audit reports, analysis reports**

| File | New Location |
|------|--------------|
| `DASHBOARD_AUDIT_REPORT.md` | `reports/audits/dashboard-audit-report.md` |
| `DASHBOARD_RESILIENCE_IMPROVEMENTS.md` | `reports/audits/dashboard-resilience-improvements.md` |
| `DASHBOARD_UI_ANALYSIS_REPORT.md` | `reports/audits/dashboard-ui-analysis-report.md` |
| `DASHBOARD_VERIFICATION_BUG_REPORT.md` | `reports/audits/dashboard-verification-bug-report.md` |
| `DESIGN_SUBAGENT_VERIFICATION_REPORT.md` | `reports/audits/design-subagent-verification-report.md` |
| `DOCUMENTATION_ORGANIZATION_AUDIT_REPORT.md` | `reports/audits/documentation-organization-audit-report.md` |
| `PERFORMANCE_ANALYSIS_SD-2025-001.md` | `reports/performance/performance-analysis-sd-2025-001.md` |
| `PERFORMANCE_SUB_AGENT_FINAL_REPORT.md` | `reports/performance/performance-sub-agent-final-report.md` |
| `PLAN_VERIFICATION_REPORT.md` | `reports/audits/plan-verification-report.md` |
| `PRD_SCHEMA_AUDIT_REPORT.md` | `reports/audits/prd-schema-audit-report.md` |
| `PRD_SCRIPTS_AUDIT_SUMMARY.md` | `reports/audits/prd-scripts-audit-summary.md` |
| `SD_SCRIPT_VALIDATION_REPORT.md` | `reports/audits/sd-script-validation-report.md` |
| `RECOMMENDATIONS-FROM-EHG-PLATFORM.md` | `reports/recommendations-from-ehg-platform.md` |

---

### Move to `/docs/02_api/` (1 file)

| File | New Location |
|------|--------------|
| `API-DOCUMENTATION.md` | `02_api/api-documentation-overview.md` |

---

### Move to `/docs/04_features/` (1 file)

| File | New Location |
|------|--------------|
| `ENHANCED-FAILURE-TRACKING.md` | `04_features/enhanced-failure-tracking.md` |

---

## Move Strategy

### Phase 1: Create Missing Subdirectories
```bash
mkdir -p /mnt/c/_EHG/EHG_Engineer/docs/guides
mkdir -p /mnt/c/_EHG/EHG_Engineer/docs/reports/audits
mkdir -p /mnt/c/_EHG/EHG_Engineer/docs/reports/performance
mkdir -p /mnt/c/_EHG/EHG_Engineer/docs/summaries/implementations
mkdir -p /mnt/c/_EHG/EHG_Engineer/docs/summaries/sd-sessions
```

### Phase 2: Move Files by Category
Execute moves in batches by target directory

### Phase 3: Update Cross-References
Scan moved files for broken internal links and update

### Phase 4: Update Navigation
Update README files to reflect new locations

---

## Priority Order

1. **Guides** (33 files) - High usage, immediate clarity improvement
2. **Summaries** (25 files) - Historical records, easy moves
3. **Reports** (13 files) - Audit reports, clear categorization
4. **Testing** (14 files) - Consolidate with existing testing docs
5. **Reference** (12 files) - Pattern documentation
6. **Database** (8 files) - Consolidate database docs
7. **Protocols** (5 files) - Protocol-specific
8. **API/Features** (2 files) - Misc additions

---

## Benefits

**Before**: 110 files at root (chaotic navigation)
**After**: 5 files at root (clean, organized)

**User Benefits**:
- Clear navigation structure
- Logical grouping by purpose
- Easier to find documentation
- Better discoverability

**Maintenance Benefits**:
- Easier to update related docs
- Clear ownership by category
- Reduced naming conflicts
- Scalable structure

---

## Implementation Plan

**Estimated Time**: 30-45 minutes
**Risk**: Low (files are documentation only, no code changes)
**Testing**: Verify no broken links after moves

---

**Status**: Ready for implementation
**Next Action**: Execute Phase 1 (create directories)
