/**
 * Success Metrics Verification Gate for PLAN-TO-LEAD — Gap 2
 *
 * Companion to SUCCESS_METRICS_ACHIEVEMENT. While that gate checks if .actual
 * is populated and parses the format, this gate independently measures
 * verifiable metrics and flags mismatches.
 *
 * Prevents agents from self-reporting "100% tests pass" while tests are failing.
 *
 * Scoring per metric:
 * - Auto-verified + matches target = 100
 * - Auto-verified + mismatch = 0 (with issue)
 * - Self-reported (can't verify) = 50
 *
 * Overall threshold: 60 (allows some self-reported metrics)
 *
 * Applicability by SD type:
 * - feature, bugfix, security: REQUIRED
 * - infrastructure: OPTIONAL (advisory)
 * - documentation, orchestrator: DISABLED (auto-pass)
 */

import { verifyAllMetrics } from '../../../../../lib/metric-auto-verifier.js';

const DISABLED_SD_TYPES = new Set(['documentation', 'orchestrator']);
const ADVISORY_SD_TYPES = new Set(['infrastructure']);
const SCORE_THRESHOLD = 60;

export function createSuccessMetricsVerificationGate(supabase) {
  return {
    name: 'SUCCESS_METRICS_VERIFICATION',
    validator: async (ctx) => {
      console.log('\n🔍 SUCCESS METRICS VERIFICATION GATE');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();

      // ORCHESTRATOR / children bypass
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        console.log(`   ℹ️  Parent orchestrator SD (${childSDs.length} children) — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Orchestrator SD — verification deferred to children'],
          details: { is_orchestrator: true }
        };
      }

      // Child SD detection: child SDs have scoped metrics that typically can't be
      // independently verified (they report on sub-components, not full-system metrics
      // like "test pass rate" or "coverage %"). Treat as advisory.
      let isChildSD = false;
      try {
        const { data: parentCheck } = await supabase
          .from('strategic_directives_v2')
          .select('parent_sd_id')
          .eq('id', sdUuid)
          .single();
        isChildSD = !!parentCheck?.parent_sd_id;
      } catch {
        // Fail-open: if check fails, treat as standalone
      }

      // SD type check — disabled types auto-pass
      if (DISABLED_SD_TYPES.has(sdType)) {
        console.log(`   ℹ️  SD type '${sdType}' — metric verification disabled`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [`SD type '${sdType}' does not require metric verification`],
          details: { sd_type: sdType, verification_disabled: true }
        };
      }

      const isAdvisory = ADVISORY_SD_TYPES.has(sdType) || isChildSD;
      if (isChildSD) {
        console.log('   👶 Child SD detected — metric verification advisory (scoped metrics)');
      }
      console.log(`   SD Type: ${sdType} (${isAdvisory ? 'ADVISORY' : 'REQUIRED'})`);

      // Fetch SD success_metrics
      const { data: sdRecord, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .select('success_metrics')
        .eq('id', sdUuid)
        .single();

      if (sdError) {
        console.log(`   ⚠️  SD query error: ${sdError.message}`);
        return {
          passed: true, score: 50, max_score: 100,
          issues: [], warnings: [`Database error: ${sdError.message}`],
          details: { error: sdError.message }
        };
      }

      const metrics = sdRecord?.success_metrics;
      if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        console.log('   ℹ️  No success metrics defined — skipping verification');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['No success metrics to verify'],
          details: { metrics_count: 0 }
        };
      }

      // Run independent verification
      const repoRoot = process.cwd();
      const { results, overallScore } = verifyAllMetrics(metrics, repoRoot);

      // Log results
      console.log(`\n   Found ${results.length} metric(s) to verify:\n`);
      for (const r of results) {
        const icon = r.status === 'verified' ? '✅' : r.status === 'mismatch' ? '❌' : 'ℹ️ ';
        console.log(`   ${icon} ${r.metric}: ${r.status}`);
        if (r.measuredValue !== null) {
          console.log(`      Reported: ${r.reportedValue} | Measured: ${r.measuredValue}`);
        }
        if (r.issue) {
          console.log(`      ⚠️  ${r.issue}`);
        }
      }

      const issues = results
        .filter(r => r.status === 'mismatch')
        .map(r => r.issue);

      const warnings = results
        .filter(r => r.status === 'self_reported')
        .map(r => `${r.metric}: self-reported (no independent verification available)`);

      const passed = isAdvisory ? true : overallScore >= SCORE_THRESHOLD;

      console.log(`\n   Overall Score: ${overallScore}/100 (threshold: ${SCORE_THRESHOLD})`);
      console.log(`   ${passed ? '✅ PASSED' : '❌ FAILED'}${isAdvisory ? ' (advisory)' : ''}`);

      if (!passed) {
        console.log('\n   REMEDIATION:');
        console.log('   - Ensure reported metric values match actual measurements');
        console.log('   - Run tests and update success_metrics with real results');
        console.log('   - Generate coverage reports: npx vitest run --coverage');
      }

      return {
        passed,
        score: overallScore,
        max_score: 100,
        issues: isAdvisory ? [] : issues,
        warnings: isAdvisory ? [...issues, ...warnings] : warnings,
        ...(!passed && {
          remediation: 'Ensure reported metric values match actual measurements. Run tests and update success_metrics with real results.'
        }),
        details: {
          metrics_count: results.length,
          verification_results: results,
          overall_score: overallScore,
          threshold: SCORE_THRESHOLD,
          is_child_sd: isChildSD,
          enforcement: isAdvisory ? 'advisory' : 'required',
          verified_count: results.filter(r => r.status === 'verified').length,
          mismatch_count: results.filter(r => r.status === 'mismatch').length,
          self_reported_count: results.filter(r => r.status === 'self_reported').length
        }
      };
    },
    required: true
  };
}
