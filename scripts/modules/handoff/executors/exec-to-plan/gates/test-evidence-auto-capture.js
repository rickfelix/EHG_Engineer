/**
 * Test Evidence Auto-Capture Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * LEO v4.4.2: Auto-ingest test reports before sub-agent orchestration
 * Evidence: story_test_mappings often empty because test evidence not captured during handoff
 */

/**
 * Create the TEST_EVIDENCE_AUTO_CAPTURE gate validator
 *
 * @returns {Object} Gate configuration
 */
export function createTestEvidenceAutoCaptureGate() {
  return {
    name: 'TEST_EVIDENCE_AUTO_CAPTURE',
    validator: async (ctx) => {
      console.log('\n🧪 TEST EVIDENCE AUTO-CAPTURE (LEO v4.4.2)');
      console.log('-'.repeat(50));

      // 1. Check SD type exemptions
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();
      const EXEMPT_TYPES = ['documentation', 'docs', 'infrastructure', 'orchestrator', 'qa', 'database'];

      if (EXEMPT_TYPES.includes(sdType)) {
        console.log(`   ℹ️  ${sdType} type SD - test evidence capture SKIPPED`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`Test evidence capture skipped for ${sdType} type SD`],
          details: { skipped: true, reason: `${sdType} type exempt` }
        };
      }

      const sdId = ctx.sd?.id || ctx.sdId;
      const fs = await import('fs');
      const path = await import('path');

      // 2. Check for fresh existing evidence (<60 min)
      try {
        const { checkTestEvidenceFreshness, getLatestTestEvidence } = await import('../../../../lib/test-evidence-ingest.js');

        const maxAgeMinutes = parseInt(process.env.LEO_TEST_EVIDENCE_MAX_AGE_MINUTES || '60');
        const freshnessCheck = await checkTestEvidenceFreshness(sdId, maxAgeMinutes);

        if (freshnessCheck?.isFresh) {
          console.log(`   ✅ Fresh test evidence exists (${freshnessCheck.ageMinutes?.toFixed(1) || '?'}min old)`);
          const latestEvidence = await getLatestTestEvidence(sdId);
          console.log(`      Verdict: ${latestEvidence?.verdict || 'UNKNOWN'}`);
          console.log(`      Pass Rate: ${latestEvidence?.pass_rate || '?'}%`);

          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [],
            details: {
              source: 'existing_fresh',
              age_minutes: freshnessCheck.ageMinutes,
              verdict: latestEvidence?.verdict
            }
          };
        }
      } catch (freshnessErr) {
        console.log(`   ⚠️  Could not check freshness: ${freshnessErr.message}`);
      }

      // 3. Scan for test reports in standard locations
      const repoPath = ctx.repoPath || process.cwd();
      const testReportPaths = [
        path.default.join(repoPath, 'playwright-report', 'report.json'),
        path.default.join(repoPath, 'test-results', '.last-run.json'),
        path.default.join(repoPath, 'coverage', 'coverage-summary.json'),
        path.default.join(repoPath, 'playwright-report', 'results.json')
      ];

      const foundReports = [];
      for (const reportPath of testReportPaths) {
        if (fs.default.existsSync(reportPath)) {
          const stats = fs.default.statSync(reportPath);
          const ageMinutes = (Date.now() - stats.mtime.getTime()) / 60000;
          foundReports.push({ path: reportPath, ageMinutes });
          console.log(`   📄 Found: ${path.default.basename(reportPath)} (${ageMinutes.toFixed(0)}min old)`);
        }
      }

      if (foundReports.length === 0) {
        console.log('   ⚠️  No test reports found in standard locations');
        console.log('   💡 To generate test evidence:');
        console.log('      - E2E: npx playwright test');
        console.log('      - Unit: npm test -- --coverage');

        return {
          passed: true, // Advisory gate - don't block
          score: 50,
          max_score: 100,
          issues: [],
          warnings: ['No test reports found - MANDATORY_TESTING_VALIDATION may fail'],
          details: { source: 'no_reports_found' }
        };
      }

      // 4. Call ingestTestEvidence() to capture and link to user stories
      try {
        const { ingestTestEvidence } = await import('../../../../lib/test-evidence-ingest.js');

        console.log('   📥 Ingesting test evidence...');

        const ingestResult = await ingestTestEvidence({
          sdId: sdId,
          source: 'auto_capture_gate',
          autoLink: true,
          reportPaths: foundReports.map(r => r.path)
        });

        if (ingestResult?.success) {
          console.log('   ✅ Test evidence ingested successfully');
          console.log(`      Test Run ID: ${ingestResult.testRunId || 'created'}`);
          console.log(`      Tests: ${ingestResult.totalTests || '?'} (${ingestResult.passedTests || '?'} passed)`);
          console.log(`      Stories Linked: ${ingestResult.storiesLinked || 0}`);

          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [],
            details: {
              source: 'auto_ingested',
              test_run_id: ingestResult.testRunId,
              total_tests: ingestResult.totalTests,
              passed_tests: ingestResult.passedTests,
              stories_linked: ingestResult.storiesLinked
            }
          };
        } else {
          console.log(`   ⚠️  Ingest returned non-success: ${ingestResult?.error || 'unknown'}`);
          return {
            passed: true, // Advisory - don't block
            score: 60,
            max_score: 100,
            issues: [],
            warnings: [`Test evidence ingest incomplete: ${ingestResult?.error || 'unknown'}`],
            details: { source: 'ingest_incomplete', error: ingestResult?.error }
          };
        }
      } catch (ingestErr) {
        console.log(`   ⚠️  Auto-ingest failed: ${ingestErr.message}`);
        console.log('   💡 Manual capture: node scripts/test-evidence-ingest.js --sd-id ' + sdId);

        return {
          passed: true, // Advisory gate - don't block
          score: 40,
          max_score: 100,
          issues: [],
          warnings: [`Test evidence auto-capture failed: ${ingestErr.message}`],
          details: { source: 'ingest_error', error: ingestErr.message }
        };
      }
    },
    required: false // Advisory gate - MANDATORY_TESTING_VALIDATION is the blocker
  };
}
