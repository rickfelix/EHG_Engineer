/**
 * Pre-Handoff Warnings for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * Query recent retrospectives to surface common issues before handoff execution.
 * This allows the team to proactively address known friction points.
 */

/**
 * Display pre-handoff warnings from recent retrospectives
 *
 * @param {string} handoffType - Type of handoff
 * @param {Object} supabase - Supabase client
 */
export async function displayPreHandoffWarnings(handoffType, supabase) {
  try {
    console.log('\n⚠️  PRE-HANDOFF WARNINGS: Recent Friction Points');
    console.log('='.repeat(70));

    // Query recent retrospectives of this handoff type
    const { data: retrospectives, error } = await supabase
      .from('retrospectives')
      .select('what_needs_improvement, action_items, key_learnings')
      .eq('retrospective_type', handoffType)
      .eq('status', 'PUBLISHED')
      .order('conducted_date', { ascending: false })
      .limit(10);

    if (error || !retrospectives || retrospectives.length === 0) {
      console.log('   ℹ️  No recent retrospectives found for this handoff type');
      console.log('');
      return;
    }

    // Aggregate common issues
    const issueFrequency = {};
    retrospectives.forEach(retro => {
      const improvements = Array.isArray(retro.what_needs_improvement)
        ? retro.what_needs_improvement
        : [];

      improvements.forEach(item => {
        const improvement = typeof item === 'string' ? item : item.improvement || item;
        if (improvement) {
          issueFrequency[improvement] = (issueFrequency[improvement] || 0) + 1;
        }
      });
    });

    // Sort by frequency and display top 3
    const topIssues = Object.entries(issueFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topIssues.length > 0) {
      console.log('   📊 Most Common Issues (last 10 retrospectives):');
      topIssues.forEach(([issue, count], index) => {
        console.log(`   ${index + 1}. [${count}x] ${issue}`);
      });
    } else {
      console.log('   ✅ No common issues identified in recent retrospectives');
    }

    console.log('');
  } catch (error) {
    console.log(`   ⚠️  Could not load warnings: ${error.message}`);
    console.log('');
  }
}
