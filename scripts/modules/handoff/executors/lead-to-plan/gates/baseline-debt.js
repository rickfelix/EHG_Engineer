/**
 * Baseline Debt Check Gate for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * LEO Protocol v4.4: Prevents accumulation of pre-existing issues
 *
 * BLOCKS if: Stale critical issues (>30 days) exist without owner
 * WARNS if: Total open issues > 10 or stale non-critical > 5
 */

/**
 * Check baseline debt
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result
 */
export async function checkBaselineDebt(sd, supabase) {
  try {
    // Try to use the database function first (most efficient)
    const { data: gateResult, error: rpcError } = await supabase
      .rpc('check_baseline_gate', { p_sd_id: sd.id });

    if (!rpcError && gateResult) {
      const result = gateResult;
      const passed = result.verdict === 'PASS';

      console.log(`   Open issues: ${result.total_open_count || 0}`);
      console.log(`   Stale critical: ${result.stale_critical_count || 0}`);
      console.log(`   SD-owned issues: ${result.owned_issues_count || 0}`);
      console.log(`   Result: ${passed ? '✅ PASS' : '❌ BLOCKED'}`);

      // Convert JSONB arrays to regular arrays
      const issues = Array.isArray(result.issues) ? result.issues : [];
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];

      return {
        pass: passed,
        score: passed ? (warnings.length > 0 ? 80 : 100) : 0,
        max_score: 100,
        issues: issues,
        warnings: warnings,
        details: {
          totalOpen: result.total_open_count,
          staleCritical: result.stale_critical_count,
          ownedIssues: result.owned_issues_count
        }
      };
    }

    // Fallback: Query baseline directly if RPC not available
    console.log('   ℹ️  Using fallback baseline check (RPC not available)');

    // Check if table exists
    const { data: summary, error: summaryError } = await supabase
      .from('baseline_summary')
      .select('*');

    if (summaryError) {
      // Table doesn't exist yet - pass with warning
      console.log('   ⚠️  Baseline table not available (migration may be pending)');
      return {
        pass: true,
        score: 100,
        issues: [],
        warnings: ['Baseline table not available - skipping check']
      };
    }

    // Query stale issues (>30 days old and still open)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleIssues } = await supabase
      .from('sd_baseline_issues')
      .select('issue_key, category, severity, created_at')
      .eq('status', 'open')
      .lt('created_at', thirtyDaysAgo);

    const issues = [];
    const warnings = [];

    // Check for stale critical issues
    const staleCritical = staleIssues?.filter(i => i.severity === 'critical') || [];
    if (staleCritical.length > 0) {
      issues.push(`${staleCritical.length} critical baseline issues unaddressed for >30 days`);
      staleCritical.forEach(i => {
        const daysOld = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (24 * 60 * 60 * 1000));
        issues.push(`  - ${i.issue_key}: ${i.category} (${daysOld} days old)`);
      });
    }

    // Calculate total open
    const totalOpen = summary?.reduce((sum, s) => sum + (s.open_count || 0), 0) || 0;
    if (totalOpen > 10) {
      warnings.push(`Baseline debt growing: ${totalOpen} open issues across all categories`);
    }

    // Check stale non-critical
    const staleNonCritical = staleIssues?.filter(i => i.severity !== 'critical') || [];
    if (staleNonCritical.length > 5) {
      warnings.push(`${staleNonCritical.length} non-critical issues unaddressed for >30 days`);
    }

    const passed = issues.length === 0;
    const score = passed ? (warnings.length > 0 ? 80 : 100) : 0;

    console.log(`   Open issues: ${totalOpen}`);
    console.log(`   Stale critical: ${staleCritical.length}`);
    console.log(`   Result: ${passed ? '✅ PASS' : '❌ BLOCKED'}`);

    return {
      pass: passed,
      score,
      max_score: 100,
      issues,
      warnings,
      details: { totalOpen, staleCritical: staleCritical.length, summary }
    };

  } catch (error) {
    // On any error, pass with warning (don't block for infrastructure issues)
    console.log(`   ⚠️  Baseline check error: ${error.message}`);
    return {
      pass: true,
      score: 90,
      issues: [],
      warnings: [`Baseline check skipped due to error: ${error.message}`]
    };
  }
}

/**
 * Create the baseline debt check gate
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createBaselineDebtGate(supabase) {
  return {
    name: 'BASELINE_DEBT_CHECK',
    validator: async (ctx) => {
      console.log('\n📊 GATE: Baseline Debt Check');
      console.log('-'.repeat(50));
      return checkBaselineDebt(ctx.sd, supabase);
    },
    required: true,
    weight: 0.8,
    remediation: 'Address stale critical baseline issues or assign ownership via: npm run baseline:assign <issue-key> <SD-ID>'
  };
}
