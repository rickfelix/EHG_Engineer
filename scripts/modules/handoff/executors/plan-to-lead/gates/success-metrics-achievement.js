/**
 * Success Metrics Achievement Gate for PLAN-TO-LEAD
 *
 * Validates that SD success metrics have been measured (actual values populated)
 * and that targets have been met. Prevents SDs from completing without
 * demonstrating measurable outcomes.
 *
 * BLOCKING gate — score >= 70 AND no metric has empty actual value.
 */

/**
 * Parse a numeric value from a metric string.
 * Handles: "95%", ">=90%", "95", "3/5", "100ms"
 * Returns null if not parseable.
 */
function parseMetricValue(value) {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Handle percentage: "95%" or ">=90%"
  const pctMatch = str.match(/([<>=]*)\s*([\d.]+)\s*%/);
  if (pctMatch) return parseFloat(pctMatch[2]);

  // Handle fraction: "3/5" → 60
  const fracMatch = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) return (parseFloat(fracMatch[1]) / parseFloat(fracMatch[2])) * 100;

  // Handle plain number
  const num = parseFloat(str);
  if (!isNaN(num)) return num;

  return null;
}

/**
 * Check if a comparison operator is met.
 * Extracts operator from target string (>=, >, <=, <, or default >=).
 */
function meetsTarget(actual, target) {
  if (actual == null || target == null) return null;

  const actualNum = parseMetricValue(String(actual));
  const targetStr = String(target).trim();

  // Extract operator from target
  const opMatch = targetStr.match(/^([<>=]+)/);
  const operator = opMatch ? opMatch[1] : '>=';
  const targetNum = parseMetricValue(targetStr);

  if (actualNum == null || targetNum == null) return null;

  switch (operator) {
    case '>=': return actualNum >= targetNum;
    case '>':  return actualNum > targetNum;
    case '<=': return actualNum <= targetNum;
    case '<':  return actualNum < targetNum;
    case '=':
    case '==': return actualNum === targetNum;
    default:   return actualNum >= targetNum;
  }
}

export function createSuccessMetricsAchievementGate(supabase) {
  return {
    name: 'SUCCESS_METRICS_ACHIEVEMENT',
    validator: async (ctx) => {
      console.log('\n📊 SUCCESS METRICS ACHIEVEMENT GATE');
      console.log('-'.repeat(50));

      const sdUuid = ctx.sd?.id || ctx.sdId;
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();

      // ORCHESTRATOR BYPASS
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        console.log(`   ℹ️  Parent orchestrator SD (${childSDs.length} children) — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: ['Orchestrator SD — metrics deferred to children'],
          details: { is_orchestrator: true, child_count: childSDs.length }
        };
      }

      // SD TYPE CHECK — does this type require metrics?
      const { data: profile } = await supabase
        .from('sd_type_validation_profiles')
        .select('requires_user_stories, description')
        .eq('sd_type', sdType)
        .single();

      // Types without user stories typically don't have success metrics either
      // (infrastructure, documentation, etc.)
      if (profile && profile.requires_user_stories === false) {
        console.log(`   ℹ️  SD type '${sdType}' does not require metrics — bypassing`);
        return {
          passed: true, score: 100, max_score: 100,
          issues: [], warnings: [`SD type '${sdType}' does not require success metrics`],
          details: { sd_type: sdType, metrics_required: false }
        };
      }

      // Fetch SD success_metrics
      const { data: sdRecord, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .select('success_metrics')
        .eq('id', sdUuid)
        .single();

      if (sdError) {
        console.log(`   ⚠️  SD query error: ${sdError.message}`);
        return {
          passed: false, score: 0, max_score: 100,
          issues: [`Database error: ${sdError.message}`],
          warnings: [], remediation: 'Check database connectivity and retry'
        };
      }

      const rawMetrics = sdRecord?.success_metrics;

      // No metrics defined — pass with warning (some SDs may legitimately lack them)
      if (!rawMetrics || !Array.isArray(rawMetrics) || rawMetrics.length === 0) {
        console.log('   ⚠️  No success metrics defined on this SD');
        return {
          passed: true, score: 100, max_score: 100,
          issues: [],
          warnings: ['No success metrics defined — consider adding measurable outcomes'],
          details: { metrics_count: 0 }
        };
      }

      // Normalize metrics: plain strings → objects with {name, target, actual}
      const metrics = rawMetrics.map(m => {
        if (typeof m === 'string') {
          return { name: m, target: 'N/A', actual: null };
        }
        return m;
      });

      console.log(`   Found ${metrics.length} success metric(s)\n`);

      // Score each metric
      const metricScores = [];
      for (const metric of metrics) {
        const name = metric.metric || metric.name || 'Unnamed metric';
        const actual = metric.actual;
        const target = metric.target;
        const hasActual = actual != null && String(actual).trim() !== '';

        if (!hasActual) {
          metricScores.push({ name, score: 0, reason: 'No actual value recorded', target, actual });
          console.log(`   ❌ ${name}: No actual value (target: ${target || 'N/A'})`);
          continue;
        }

        const met = meetsTarget(actual, target);
        if (met === true) {
          metricScores.push({ name, score: 100, reason: 'Target met', target, actual });
          console.log(`   ✅ ${name}: ${actual} meets target ${target}`);
        } else if (met === false) {
          metricScores.push({ name, score: 50, reason: 'Target not met', target, actual });
          console.log(`   ⚠️  ${name}: ${actual} does NOT meet target ${target}`);
        } else {
          // Non-numeric comparison — actual exists but can't compare
          metricScores.push({ name, score: 75, reason: 'Actual recorded (non-numeric)', target, actual });
          console.log(`   ℹ️  ${name}: actual="${actual}" (non-numeric, target="${target || 'N/A'}")`);
        }
      }

      // Calculate overall score
      const overallScore = Math.round(
        metricScores.reduce((sum, m) => sum + m.score, 0) / metricScores.length
      );
      const hasEmptyActual = metricScores.some(m => m.score === 0);
      const passed = overallScore >= 70 && !hasEmptyActual;

      const issues = metricScores
        .filter(m => m.score === 0)
        .map(m => `${m.name}: No actual value recorded (target: ${m.target || 'N/A'})`);

      const warnings = metricScores
        .filter(m => m.score > 0 && m.score <= 50)
        .map(m => `${m.name}: ${m.actual} does not meet target ${m.target}`);

      console.log(`\n   Overall Score: ${overallScore}/100 (threshold: 70, no empty actuals allowed)`);
      console.log(`   ${passed ? '✅ PASSED' : '❌ FAILED'}`);

      if (!passed) {
        console.log('\n   REMEDIATION:');
        if (hasEmptyActual) {
          console.log('   - Record actual values for all success metrics');
          console.log('   - Update: strategic_directives_v2.success_metrics[].actual');
        }
        if (overallScore < 70) {
          console.log('   - Work toward meeting defined target values');
        }
      }

      return {
        passed,
        score: overallScore,
        max_score: 100,
        issues,
        warnings,
        ...((!passed) && {
          remediation: 'Record actual values for all success metrics and ensure targets are met'
        }),
        details: {
          metrics_count: metrics.length,
          metric_scores: metricScores,
          overall_score: overallScore,
          has_empty_actual: hasEmptyActual
        }
      };
    },
    required: true
  };
}
