/**
 * Pre-Handoff Warnings for LEAD-TO-PLAN
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * Query recent retrospectives to surface common issues before handoff execution.
 * This allows the team to proactively address known friction points.
 */

/**
 * PAT-LATE-REQ-001 + PAT-E2E-EARLY-001: Surface SD-type-specific requirements
 * BEFORE LEAD approval so implementers know what's expected upfront.
 *
 * @param {Object} sd - Strategic Directive
 */
function displayTypeRequirements(sd) {
  // Import inline to avoid circular deps at module level
  const SD_TYPE_REQUIREMENTS = {
    feature:        { prd: true,  e2e: true,  design: true,  minHandoffs: 4, threshold: '85%' },
    infrastructure: { prd: true,  e2e: false, design: false, minHandoffs: 3, threshold: '80%' },
    bugfix:         { prd: false, e2e: false, design: false, minHandoffs: 1, threshold: '70%' },
    fix:            { prd: false, e2e: false, design: false, minHandoffs: 1, threshold: '70%' },
    database:       { prd: true,  e2e: false, design: false, minHandoffs: 2, threshold: '80%' },
    security:       { prd: true,  e2e: true,  design: false, minHandoffs: 3, threshold: '90%' },
    refactor:       { prd: false, e2e: true,  design: false, minHandoffs: 2, threshold: '80%' },
    documentation:  { prd: false, e2e: false, design: false, minHandoffs: 1, threshold: '60%' },
    enhancement:    { prd: false, e2e: false, design: false, minHandoffs: 2, threshold: '75%' },
    library:        { prd: false, e2e: false, design: false, minHandoffs: 2, threshold: '75%' },
  };

  const sdType = (sd?.sd_type || 'feature').toLowerCase();
  const reqs = SD_TYPE_REQUIREMENTS[sdType] || SD_TYPE_REQUIREMENTS.feature;

  console.log('\n📋 SD TYPE REQUIREMENTS (surfaced at LEAD for early awareness):');
  console.log('='.repeat(70));
  console.log(`   SD Type:       ${sdType}`);
  console.log(`   PRD Required:  ${reqs.prd ? '✅ YES' : '⏭️  No'}`);
  console.log(`   E2E Required:  ${reqs.e2e ? '✅ YES - plan E2E strategy early' : '⏭️  No'}`);
  console.log(`   DESIGN Review: ${reqs.design ? '✅ YES' : '⏭️  No'}`);
  console.log(`   Min Handoffs:  ${reqs.minHandoffs}`);
  console.log(`   Gate Threshold: ${reqs.threshold}`);
  console.log('');
}

/**
 * Display pre-handoff warnings from recent retrospectives
 *
 * @param {string} handoffType - Type of handoff
 * @param {Object} supabase - Supabase client
 * @param {Object} [sd] - Strategic Directive (optional, for type-specific requirements)
 */
export async function displayPreHandoffWarnings(handoffType, supabase, sd) {
  try {
    // PAT-LATE-REQ-001 + PAT-E2E-EARLY-001: Show type requirements first
    if (sd && handoffType === 'LEAD-TO-PLAN') {
      displayTypeRequirements(sd);
    }

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
