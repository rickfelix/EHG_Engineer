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
 * PAT-HF-LEADTOPLAN-b891d12d: Surface translation fidelity gaps BEFORE gates run.
 *
 * When an SD has an architecture plan linked (arch_key), query the most recent
 * eva_translation_gates result for this SD and show any gaps with remediation
 * instructions. This turns a blocking gate failure into an actionable pre-check
 * that teams can fix before the handoff is attempted.
 *
 * Called from LeadToPlanExecutor.setup() — runs before gate validation.
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 */
export async function displayTranslationFidelityPreview(sd, supabase) {
  const archKey = sd?.metadata?.arch_key || sd?.metadata?.architecture_plan_key;
  if (!archKey) return;

  console.log('\n🔍 TRANSLATION FIDELITY PRE-CHECK (Architecture Plan → SD)');
  console.log('='.repeat(70));
  console.log(`   Arch Plan: ${archKey}`);

  try {
    const sdKey = sd?.sd_key || sd?.id;
    const { data, error } = await supabase
      .from('eva_translation_gates')
      .select('coverage_score, gaps, passed, created_at')
      .eq('gate_type', 'architecture_to_sd')
      .filter('target_ref->>key', 'eq', sdKey)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.log(`   ⚠️  Could not query gate history: ${error.message}`);
      _showTranslationChecklist();
      console.log('');
      return;
    }

    if (!data || data.length === 0) {
      console.log('   ℹ️  No prior gate result found — checklist for first run:');
      _showTranslationChecklist();
      console.log('');
      return;
    }

    const latest = data[0];
    const age = Math.round((Date.now() - new Date(latest.created_at).getTime()) / 60000);

    if (latest.passed) {
      console.log(`   ✅ Last run PASSED (score: ${latest.coverage_score}/100, ${age}m ago)`);
      console.log('');
      return;
    }

    console.log(`   ❌ Last run FAILED (score: ${latest.coverage_score}/100, ${age}m ago)`);
    console.log('   Fix these gaps in SD description / key_changes / success_criteria BEFORE retrying:\n');

    const gaps = latest.gaps || [];
    const critical = gaps.filter(g => g.severity === 'critical');
    const major = gaps.filter(g => g.severity === 'major');
    const minor = gaps.filter(g => g.severity === 'minor');

    for (const gap of critical) {
      console.log(`   ❌ [CRITICAL] ${gap.item}`);
      console.log(`      Source: ${gap.source}`);
    }
    for (const gap of major) {
      console.log(`   ⚠️  [MAJOR]    ${gap.item}`);
      console.log(`      Source: ${gap.source}`);
    }
    for (const gap of minor) {
      console.log(`   ℹ️  [MINOR]    ${gap.item}`);
    }

    if (critical.length > 0 || major.length > 0) {
      console.log('\n   📋 Remediation: Update the SD fields to explicitly mention each gap above.');
      console.log('      • description: add workflow constraints, tool restrictions, platform rules');
      console.log('      • key_changes: list specific API endpoints, components, and constraints');
      console.log('      • success_criteria: include vision-level success criteria');
    }

    console.log('');
  } catch (err) {
    console.log(`   ⚠️  Translation fidelity preview error: ${err.message}`);
    _showTranslationChecklist();
    console.log('');
  }
}

/**
 * General checklist for orchestrator SDs derived from architecture plans.
 * Shown when no historical gate result is available.
 */
function _showTranslationChecklist() {
  console.log('   📋 Orchestrator SD checklist (common translation gaps):');
  console.log('      • description:    workflow sequencing constraints (e.g., mobile-first, desktop inherits)');
  console.log('      • description:    tool/system restrictions (e.g., "generate X via Claude, not Stitch")');
  console.log('      • key_changes:    all API endpoints (e.g., /qa, /upload) mentioned in arch plan');
  console.log('      • key_changes:    platform-specific requirements (PWA, mobile touch targets)');
  console.log('      • success_criteria: strategic success criteria from Vision Document');
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
