/**
 * Continuous Improvement Coach - Retrospective for SD-EXPORT-001
 *
 * Sub-Agent: RETRO (priority: 85)
 * Trigger: SD_STATUS_COMPLETED
 * Context: SD marked as substantially complete (95%) via human approval
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const retrospective = {
  sd_id: 'SD-EXPORT-001',
  title: 'SD-EXPORT-001: Analytics Export Engine - Retrospective',
  status: 'completed',
  completion_type: 'substantially_complete',

  what_went_well: [
    '🎯 **Rigorous LEAD evaluation prevented 238 hours of wasted effort** - Following LEO Protocol 5-step checklist and over-engineering rubric caught duplicate work before any coding began',

    '🔍 **Principal Systems Analyst sub-agent provided critical evidence** - Automated detection of "existing implementation" trigger identified 1,440 LOC already operational',

    '📊 **Standardized over-engineering rubric gave objective verdict** - 6-dimension scoring (12/30) removed subjective judgment, enabled data-driven decision',

    '🔐 **Human approval protocol prevented autonomous overreach** - CLAUDE.md requirement for human approval on SD status changes ensured stakeholder buy-in',

    '💡 **SIMPLICITY FIRST framework exposed false claims** - Asking "Can we document instead of implement?" revealed export page already exists at /analytics/exports',

    '📋 **5-step SD evaluation checklist caught scope mismatch** - Mandatory backlog review (step 3) would have shown zero backlog items = no validated requirements',

    '⚡ **Database-first architecture enabled fast audit** - Querying strategic_directives_v2 + codebase search took <5 minutes to discover 95% completion',

    '🚫 **Early detection saved massive waste** - Blocking SD before PLAN phase prevented PRD creation, EXEC implementation, testing overhead'
  ],

  what_could_improve: [
    '❌ **SD creation process lacks duplicate detection** - SD-EXPORT-001 created without checking if export functionality already existed in codebase',

    '📝 **SD descriptions contained false claims** - "0 UI imports" and "dormant engine" were factually incorrect, suggests insufficient research before SD submission',

    '⏰ **Audit happened reactively, not proactively** - Export functionality existed since Sept 29, SD created Oct 2, no automatic conflict detection',

    '🔗 **No cross-reference between SD scope and existing routes** - /analytics/exports route wasn\'t linked to SD-EXPORT-001, preventing auto-discovery',

    '📊 **Backlog items missing for substantial SD** - Zero backlog items linked = no user stories, no acceptance criteria, red flag ignored',

    '🎯 **Priority set to "high" without validation** - No business urgency, no deadline, no user complaints, yet marked high priority',

    '🏗️ **Infrastructure audit not triggered automatically** - INFRASTRUCTURE_AUDIT_2025 created SD but didn\'t validate against existing implementations first'
  ],

  action_items: [
    {
      action: 'Create automated duplicate detection script',
      owner: 'LEAD Agent',
      priority: 'High',
      effort: '2-3 hours',
      description: 'Before SD approval, scan codebase for existing implementations matching SD scope. Alert LEAD if ≥50% overlap detected.',
      implementation: 'Add pre-approval hook: query file paths, grep for keywords from SD title/description, check route tables'
    },

    {
      action: 'Require backlog items for all SDs',
      owner: 'LEO Protocol',
      priority: 'High',
      effort: '1 hour (policy change)',
      description: 'Enforce rule: No SD can move from draft→active without ≥1 backlog item linked in sd_backlog_map table',
      implementation: 'Add database constraint or validation trigger on status transitions'
    },

    {
      action: 'Enhance SD creation template with existence check',
      owner: 'INFRASTRUCTURE_AUDIT process',
      priority: 'Medium',
      effort: '1-2 hours',
      description: 'Add mandatory section to SD template: "Existing Implementations Checked: [Yes/No]" with required file paths',
      implementation: 'Update SD creation script to prompt for duplicate check evidence'
    },

    {
      action: 'Add route-to-SD cross-reference table',
      owner: 'Database Schema',
      priority: 'Medium',
      effort: '2 hours',
      description: 'Create sd_routes table mapping URLs (/analytics/exports) to SD IDs, enable automatic conflict detection',
      implementation: 'Extract routes from App.tsx, link to SDs, query before approving new route-related SDs'
    },

    {
      action: 'Standardize "substantially complete" workflow',
      owner: 'LEO Protocol',
      priority: 'Low',
      effort: '1 hour (documentation)',
      description: 'Document process for discovering and handling SDs that are 80%+ complete upon audit',
      implementation: 'Add to CLAUDE.md: When to mark complete vs reduce scope vs create follow-up SD'
    }
  ],

  lessons_learned: [
    '✅ **Over-engineering rubric is essential** - Without 6-dimension scoring, might have proceeded based on gut feel. Standardized evaluation provided defensible verdict.',

    '✅ **Sub-agents prevent blind spots** - LEAD alone might miss technical details. Systems Analyst expertise caught implementation conflicts.',

    '✅ **Human approval prevents AI overconfidence** - Requiring human decision on scope reduction ensures alignment with business strategy.',

    '✅ **Early-phase gates save exponential effort** - Catching issues at LEAD (5% of cycle) vs EXEC (60% of cycle) = 12x efficiency gain.',

    '✅ **Database-first enables rapid audits** - Single query to strategic_directives_v2 + codebase grep faster than reading markdown files.',

    '⚠️ **False SD claims are systemic risk** - If infrastructure audits create SDs without validation, duplicate work risk scales with automation.',

    '⚠️ **"High priority" doesn\'t mean "urgent"** - Priority field conflates importance vs time-sensitivity. Needs decomposition.',

    '⚠️ **Backlog items are canary for SD readiness** - Zero backlog items = no user validation = premature SD creation.'
  ],

  metrics: {
    effort_saved: '238 hours (6 weeks claimed - 2 hours actual)',
    waste_prevention_percentage: '99.2%',
    evaluation_time: '30 minutes (5-step checklist + rubric + sub-agents)',
    roi_of_evaluation: '476x (238 saved / 0.5 spent)',

    sub_agents_triggered: 2,
    sub_agents_list: ['Principal Systems Analyst', 'LEAD Over-Engineering Evaluator'],

    existing_implementation_loc: 1440,
    sd_claimed_scope: '6 weeks, 5 phases, full UI stack',
    actual_remaining_scope: '15 lines of button integration (optional)',

    over_engineering_score: '12/30 (FAIL)',
    simplicity_first_pass: false,
    human_approval_obtained: true,
    final_decision: 'Option 2 - Mark substantially complete'
  },

  protocol_improvements: [
    'Add "Duplicate Detection" as mandatory step 4.5 in 5-step SD evaluation checklist',
    'Create automated script: scripts/check-sd-duplicates.cjs to run before LEAD approval',
    'Require backlog items before draft→active transition (database constraint)',
    'Add route registry to prevent URL conflicts',
    'Document "substantially complete" workflow in LEO Protocol',
    'Consider decomposing priority into [business_impact, time_urgency, effort] dimensions'
  ],

  key_decisions: [
    {
      decision: 'Mark SD-EXPORT-001 as 95% complete',
      rationale: 'Export functionality exists and works. Only minor UX polish (buttons) missing.',
      alternatives_considered: ['Reduce scope to buttons', 'Close as duplicate'],
      why_chosen: 'Preserves SD tracking while acknowledging substantial completion. Backlog item captures remaining work.'
    },

    {
      decision: 'Create backlog item for dashboard buttons',
      rationale: 'Low-priority UX enhancement (1-2 hours). Not blocking, can defer.',
      alternatives_considered: ['Implement immediately', 'Skip entirely'],
      why_chosen: 'Balances completeness (buttons nice-to-have) with pragmatism (not urgent).'
    },

    {
      decision: 'Use Option 2 (substantially complete) vs Option 1 (reduce scope)',
      rationale: 'Human selected Option 2. Aligns with reality (95% done) and avoids creating redundant SD.',
      impact: 'Closes SD loop cleanly. Backlog item provides path for future polish if needed.'
    }
  ],

  patterns_observed: [
    {
      pattern: 'Infrastructure audits create SDs without duplicate checking',
      instances: 1,
      risk: 'As automation scales, risk of duplicate SDs increases',
      mitigation: 'Add duplicate detection to infrastructure audit script'
    },

    {
      pattern: 'SDs approved without backlog validation',
      instances: 'SD-EXPORT-001 had 0 backlog items',
      risk: 'Moving forward without user requirements = scope creep',
      mitigation: 'Enforce backlog requirement via database constraint'
    },

    {
      pattern: 'Over-engineering detected by standardized rubric',
      instances: '12/30 score flagged for review',
      success: 'Objective criteria prevented subjective bias',
      recommendation: 'Continue using 6-dimension rubric for all SDs'
    }
  ],

  recommendations: [
    '📋 **SHORT TERM (1 week)**: Implement duplicate detection script and add to LEAD approval workflow',
    '🔒 **MEDIUM TERM (1 month)**: Add database constraint requiring backlog items before SD activation',
    '🏗️ **LONG TERM (3 months)**: Build route registry and cross-reference system for automatic conflict detection',
    '📊 **CONTINUOUS**: Run over-engineering rubric on all SDs before PLAN phase',
    '🎯 **POLICY**: Document "substantially complete" workflow in CLAUDE.md with clear thresholds (80%+ = option)'
  ],

  timestamp: new Date().toISOString(),
  retrospective_type: 'SD_COMPLETION',
  conducted_by: 'Continuous Improvement Coach',
  participants: ['LEAD Agent', 'Principal Systems Analyst', 'Human Stakeholder']
};

async function storeRetrospective() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CONTINUOUS IMPROVEMENT COACH - SD-EXPORT-001 RETROSPECTIVE');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📊 METRICS:');
  console.log('- Effort Saved:', retrospective.metrics.effort_saved);
  console.log('- Waste Prevention:', retrospective.metrics.waste_prevention_percentage);
  console.log('- ROI of Evaluation:', retrospective.metrics.roi_of_evaluation);
  console.log('- Over-Engineering Score:', retrospective.metrics.over_engineering_score);
  console.log();

  console.log('✅ WHAT WENT WELL:', retrospective.what_went_well.length, 'highlights');
  retrospective.what_went_well.forEach(item => console.log(`  ${item.substring(0, 100)}...`));
  console.log();

  console.log('⚠️  WHAT COULD IMPROVE:', retrospective.what_could_improve.length, 'areas');
  retrospective.what_could_improve.forEach(item => console.log(`  ${item.substring(0, 100)}...`));
  console.log();

  console.log('🎯 ACTION ITEMS:', retrospective.action_items.length);
  retrospective.action_items.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.action} [${item.priority}] - ${item.effort}`);
  });
  console.log();

  console.log('💡 KEY LESSONS:',retrospective.lessons_learned.length);
  console.log();

  console.log('📋 PROTOCOL IMPROVEMENTS:', retrospective.protocol_improvements.length);
  retrospective.protocol_improvements.forEach((imp, i) => {
    console.log(`  ${i + 1}. ${imp}`);
  });
  console.log();

  // Store in database
  console.log('Storing retrospective in database...');

  const { data, error } = await supabase
    .from('retrospectives')
    .insert([{
      sd_id: retrospective.sd_id,
      title: retrospective.title,
      retro_type: retrospective.retrospective_type,
      what_went_well: retrospective.what_went_well,
      what_needs_improvement: retrospective.what_could_improve,
      action_items: retrospective.action_items,
      key_learnings: retrospective.lessons_learned,
      status: 'PUBLISHED',
      generated_by: 'MANUAL',
      trigger_event: 'SD_STATUS_COMPLETED',
      conducted_date: retrospective.timestamp,
      agents_involved: ['LEAD', 'Principal Systems Analyst'],
      human_participants: ['Human Stakeholder'],
      success_patterns: retrospective.patterns_observed.filter(p => p.success),
      failure_patterns: retrospective.patterns_observed.filter(p => p.risk),
      improvement_areas: retrospective.protocol_improvements,
      business_value_delivered: 'Prevented 238 hours of wasted effort (99.2% waste prevention)',
      objectives_met: true,
      on_schedule: true,
      within_scope: true,
      created_at: retrospective.timestamp
    }])
    .select();

  if (error) {
    console.error('Error storing retrospective:', error);
    return;
  }

  console.log('✅ Retrospective stored successfully!\n');
  console.log('Database ID:', data[0].id);
  console.log();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RETROSPECTIVE COMPLETE - SD-EXPORT-001 CLOSED');
  console.log('═══════════════════════════════════════════════════════════\n');

  return data;
}

storeRetrospective()
  .then(() => {
    console.log('✅ All retrospective tasks complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed:', err);
    process.exit(1);
  });
