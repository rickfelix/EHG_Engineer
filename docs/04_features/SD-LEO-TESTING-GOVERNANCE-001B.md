# Strategic Directive Proposal: SD-LEO-TESTING-GOVERNANCE-001B


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, e2e, unit

## Test Evidence Auto-Capture Gate

**Proposed ID:** SD-LEO-TESTING-GOVERNANCE-001B
**Parent SD:** SD-LEO-TESTING-GOVERNANCE-001
**Type:** Feature (Child SD)
**Category:** protocol
**Priority:** HIGH
**Target Application:** EHG_Engineer
**Estimated Effort:** 15-20 hours

---

## 1. Strategic Intent

Add an advisory gate to the EXEC→PLAN handoff that automatically detects and ingests test reports, populating the `test_runs`, `test_results`, and `story_test_mappings` tables. This ensures test evidence is captured and linked to user stories before handoff validation.

---

## 2. Rationale

### Evidence Base
- `story_test_mappings` table is empty - no automatic population
- Test evidence read during handoff but not ingested
- Retrospectives report "No unified test evidence found"
- Dual schema problem: `test-result-capture.js` writes to legacy tables

### Current State
- `scripts/lib/test-evidence-ingest.js` exists with full functionality
- `ingestTestEvidence()`, `getLatestTestEvidence()`, `checkTestEvidenceFreshness()` available
- No automatic invocation during handoff flow
- Test reports exist but are not captured to database

### Target State
- New `TEST_EVIDENCE_AUTO_CAPTURE` gate runs before SUB_AGENT_ORCHESTRATION
- Gate scans standard report locations for test results
- Calls existing `ingestTestEvidence()` to populate unified schema
- Story-test mappings auto-created from test names

---

## 3. Scope

### In Scope
- Add new advisory gate to `ExecToPlanExecutor.getRequiredGates()`
- Scan for test reports in standard locations
- Call `ingestTestEvidence()` from existing module
- Populate `test_runs`, `test_results`, `story_test_mappings`
- Check for fresh existing evidence to avoid duplicates

### Out of Scope
- Changes to test-evidence-ingest.js module
- Changes to test report generation
- Removal of legacy test capture scripts
- UI for viewing test evidence

---

## 4. Key Changes

### File: `scripts/modules/handoff/executors/ExecToPlanExecutor.js`

**Add gate in `getRequiredGates()` after PREREQUISITE_HANDOFF_CHECK:**

```javascript
// Position: After PREREQUISITE_HANDOFF_CHECK, before SUB_AGENT_ORCHESTRATION
gates.push({
  name: 'TEST_EVIDENCE_AUTO_CAPTURE',
  validator: async (ctx) => {
    console.log('\n📊 TEST EVIDENCE AUTO-CAPTURE (LEO v4.4.2)');
    console.log('-'.repeat(50));

    // Check SD type exemptions
    const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();
    const EXEMPT_TYPES = ['documentation', 'docs', 'infrastructure', 'orchestrator'];

    if (EXEMPT_TYPES.includes(sdType)) {
      console.log(`   ℹ️  ${sdType} type SD - evidence capture SKIPPED`);
      return { passed: true, score: 100, max_score: 100,
               details: { skipped: true } };
    }

    const sdUuid = ctx.sd?.id || ctx.sdId;

    try {
      // Import test evidence module
      const { ingestTestEvidence, checkTestEvidenceFreshness } =
        await import('../../../lib/test-evidence-ingest.js');

      // Check for fresh existing evidence
      const freshness = await checkTestEvidenceFreshness(sdUuid, 60);
      if (freshness.isFresh) {
        console.log('   ✅ Fresh test evidence exists');
        console.log(`      Age: ${freshness.ageMinutes}m`);
        return { passed: true, score: 100, max_score: 100,
                 details: { source: 'existing', age: freshness.ageMinutes } };
      }

      // Scan for test reports
      const fs = await import('fs').then(m => m.promises);
      const path = await import('path');
      const appPath = this.determineTargetRepository(ctx.sd);

      const reportPaths = [
        path.join(appPath, 'playwright-report', 'report.json'),
        path.join(appPath, 'test-results', '.last-run.json'),
        path.join(appPath, 'coverage', 'coverage-summary.json')
      ];

      let reportData = null;
      let reportType = null;

      for (const reportPath of reportPaths) {
        try {
          const content = await fs.readFile(reportPath, 'utf-8');
          reportData = JSON.parse(content);
          reportType = reportPath.includes('playwright') ? 'playwright' : 'vitest';
          console.log(`   📁 Found ${reportType} report`);
          break;
        } catch { /* Not found, try next */ }
      }

      if (!reportData) {
        console.log('   ⚠️  No test reports found');
        return { passed: true, score: 70, max_score: 100,
                 warnings: ['No test reports found - run tests first'] };
      }

      // Ingest test evidence
      console.log('   📥 Ingesting test evidence...');
      const result = await ingestTestEvidence({
        sdId: sdUuid,
        triggeredBy: 'EXEC_TO_PLAN_HANDOFF',
        runType: reportType,
        report: reportData
      });

      console.log(`   ✅ Captured: ${result.testResultsCount} tests, ${result.storyMappingsCount} mappings`);
      ctx._testEvidence = result;

      return { passed: true, score: 100, max_score: 100,
               details: { captured: result.testResultsCount } };

    } catch (error) {
      console.log(`   ⚠️  Capture error: ${error.message}`);
      return { passed: true, score: 50, max_score: 100,
               warnings: [`Evidence capture failed: ${error.message}`] };
    }
  },
  required: false  // Advisory - MANDATORY_TESTING_VALIDATION blocks
});
```

---

## 5. Gate Sequence

```
1. PREREQUISITE_HANDOFF_CHECK      (existing - validates PLAN-TO-EXEC)
2. TEST_EVIDENCE_AUTO_CAPTURE      (NEW - ingests test reports)
3. SUB_AGENT_ORCHESTRATION         (existing - runs TESTING sub-agent)
4. MANDATORY_TESTING_VALIDATION    (NEW from 001A - validates TESTING)
5. BMAD_EXEC_TO_PLAN               (existing)
6. GATE2_IMPLEMENTATION_FIDELITY   (existing)
7. RCA_GATE                        (existing)
8. HUMAN_VERIFICATION_GATE         (existing)
```

---

## 6. Success Criteria

| Criterion | Metric | Pass Threshold |
|-----------|--------|----------------|
| Reports detected | Playwright/coverage reports found | When present |
| Evidence ingested | test_runs record created | 100% |
| Tests captured | test_results populated | 100% |
| Story mappings | story_test_mappings created | ≥80% |
| No duplicates | Fresh evidence skipped | 100% |

---

## 7. Report Locations Scanned

| Path | Format | Source |
|------|--------|--------|
| `playwright-report/report.json` | Playwright JSON | E2E tests |
| `test-results/.last-run.json` | Playwright metadata | E2E tests |
| `coverage/coverage-summary.json` | Istanbul JSON | Unit tests |

---

## 8. Acceptance Testing

- [ ] Gate detects Playwright report when present
- [ ] Gate detects coverage report when present
- [ ] test_runs record created with correct sd_id
- [ ] test_results records created for each test
- [ ] story_test_mappings created from US-XXX in test names
- [ ] Fresh evidence (<60 min) skips re-ingestion
- [ ] Documentation SD bypasses capture
- [ ] Missing reports produce warning, not failure

---

## 9. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LEO_TEST_EVIDENCE_MAX_AGE_MINUTES` | `60` | Freshness threshold |

---

## 10. Estimated LOC

- Gate validator: ~90 lines
- Comments/logging: ~20 lines
- Error handling: ~10 lines
- **Total: ~120 lines**

---

*Part of SD-LEO-TESTING-GOVERNANCE-001 orchestrator*
