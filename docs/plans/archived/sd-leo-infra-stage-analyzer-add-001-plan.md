<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_followup-stage20-uat-capability.md -->
<!-- SD Key: SD-LEO-INFRA-STAGE-ANALYZER-ADD-001 -->
<!-- Archived at: 2026-05-30T21:03:08.850Z -->

# Stage-20 analyzer: add DB-sourced UAT + capability finding categories

## Type
infrastructure

## Priority
low

## Summary
Implement the four canonical Stage-20 finding categories deferred from SD-LEO-INFRA-STAGE-CODE-QUALITY-001: uat_test, bug_report, uat_signoff, and capability. Unlike the repo-scannable QA + Vision-Compliance categories already shipped, these are DB-sourced or environment-based and require their own data-source design rather than scanning the cloned venture repo.

## Background
SD-LEO-INFRA-STAGE-CODE-QUALITY-001 expanded the Stage-20 code-quality analyzer (lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js) from 4 to 8 repo-scannable canonical categories (added unit_test, e2e_test, feedback_widget_present, error_capture_wired). The canonical FINDING_CATEGORIES (lib/eva/quality-findings/finding-shape.js) defines 12 categories total; the analyzer now implements 8 and tracks the remaining 4 via the exported DEFERRED_CANONICAL_CATEGORIES constant.

## Scope
In-scope: implement uat_test (user-acceptance-test case failures), bug_report (chairman-filed bug reports), uat_signoff (UAT signoff rejections) sourced from venture UAT/bug DB records; and capability (missing-capability findings such as gh CLI / sandbox availability) which is environment-based. Wire them into analyzeStage20CodeQuality, map them through legacy-adapter (LEGACY_CHECK_MAP), and cover with tests. Out-of-scope: the repo-scannable categories already shipped, and the rescan/advance flow.

## Success Criteria
- The four deferred categories are implemented and emitted by the analyzer
- Their data sources (venture UAT/bug records; environment capability checks) are designed and documented
- legacy-adapter maps them to canonical; tests cover present/absent
- DEFERRED_CANONICAL_CATEGORIES in stage-20-code-quality.js becomes empty (all 12 canonical categories implemented)
