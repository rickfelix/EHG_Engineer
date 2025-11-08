#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_KEY = 'SD-RECONNECT-011';

console.log('\n📝 GENERATING RETROSPECTIVE: SD-RECONNECT-011');
console.log('======================================================================\n');

// Retrieve SD
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', SD_KEY)
  .single();

if (sdError || !sd) {
  console.error('❌ Failed to retrieve SD:', sdError?.message);
  process.exit(1);
}

console.log(`📋 SD: ${sd.title}`);
console.log(`   Status: ${sd.status}`);
console.log(`   Completion Date: ${sd.completion_date}\n`);

// Generate comprehensive retrospective
const retrospective = {
  sd_id: sd.id,
  sd_key: SD_KEY,
  generated_at: new Date().toISOString(),

  // Executive Summary
  executive_summary: `SD-RECONNECT-011 successfully delivered a comprehensive Chairman Decision Analytics & Calibration Suite. The implementation consisted of 6 React components (1,318 LOC) with zero backend changes, fully reusing existing APIs and database infrastructure. Testing revealed critical protocol gaps that were addressed mid-stream, resulting in improved LEO Protocol adherence.`,

  // What Went Well
  what_went_well: [
    {
      item: 'Sub-Agent Validation Excellence',
      details: 'All 5 sub-agents (TESTING, SECURITY, PERFORMANCE, DATABASE, ACCESSIBILITY) provided thorough analysis with actionable recommendations. DATABASE sub-agent confirmed 100% reuse of existing infrastructure, preventing scope creep.',
      impact: 'High - Prevented over-engineering and validated simplicity-first approach'
    },
    {
      item: 'PLAN Supervisor Verification',
      details: 'Comprehensive CONDITIONAL_PASS verdict (81% confidence) with detailed sub-agent summaries prevented premature approval and identified testing gaps.',
      impact: 'High - Caught missing manual testing requirement before final approval'
    },
    {
      item: 'Authentication Testing Infrastructure',
      details: 'Existing test fixtures (tests/fixtures/auth.ts with authenticateUser helper) enabled rapid authenticated testing without creating workarounds.',
      impact: 'Medium - Saved time and aligned with existing patterns'
    },
    {
      item: 'Component Modularity',
      details: '6 standalone components (DecisionAnalyticsDashboard, DecisionHistoryTable, ConfidenceScoreChart, ThresholdCalibrationReview, FeatureFlagControls, TypeScript interfaces) with clear separation of concerns.',
      impact: 'High - Enables independent testing and future enhancements'
    },
    {
      item: 'Feature Flag Architecture',
      details: 'localStorage-based feature flags (FEATURE_DECISION_LOG, FEATURE_CALIBRATION_REVIEW) allow incremental rollout without backend changes.',
      impact: 'Medium - Supports phased deployment and user testing'
    }
  ],

  // What Needs Improvement
  what_needs_improvement: [
    {
      item: 'Premature LEAD Approval Without Testing',
      details: 'LEAD agent approved SD as COMPLETED without executing the mandatory manual testing specified in PLAN→LEAD handoff action items. This violated LEO Protocol v4.2.0 requirements.',
      impact: 'Critical - Required rollback of approval and re-execution of entire approval workflow',
      root_cause: 'LEAD agent did not validate that action items from PLAN→LEAD handoff were completed before approving',
      how_caught: 'User challenge: "Did you perform all the appropriate testing?"'
    },
    {
      item: 'Testing Without Authentication',
      details: 'Initial E2E tests (chairman-analytics.spec.ts) were written without authentication, failing on protected routes. This was EXPECTED behavior but initially misinterpreted as implementation bug.',
      impact: 'Medium - Wasted time debugging correct behavior',
      root_cause: 'Did not review existing test infrastructure before writing new tests',
      how_caught: 'All tests failed with redirects to /login'
    },
    {
      item: 'Build Issues Blocking Playwright',
      details: 'Playwright tests failed due to unrelated build error (missing projection-algorithms file in financial module). This blocked E2E testing framework.',
      impact: 'Medium - Required alternative testing approach (Puppeteer)',
      root_cause: 'Unrelated code changes in financial module broke build',
      resolution: 'Created custom playwright.config.test.ts to use existing dev server, then used Puppeteer as fallback'
    },
    {
      item: 'Duplicate Component Declarations',
      details: 'App.tsx had duplicate lazy declarations for CreativeMediaPage, FeedbackLoopsPage, QualityAssurancePage causing build failures.',
      impact: 'Low - Quick fix, but delayed testing',
      root_cause: 'Previous code changes left duplicate declarations',
      resolution: 'Removed duplicates, verified with grep'
    }
  ],

  // Key Learnings
  key_learnings: [
    {
      lesson: 'LEAD Must Validate Action Items Before Approval',
      description: 'LEAD agent MUST explicitly check that all action items from PLAN→LEAD handoff are completed with evidence before marking SD as COMPLETED.',
      protocol_impact: 'Add explicit checklist to LEAD approval script: "Have all PLAN→LEAD action items been completed with evidence?"',
      implementation: 'Update lead-final-approval template to query metadata for action_items_completed flag'
    },
    {
      lesson: 'Review Existing Test Infrastructure Before Creating New',
      description: 'Always search for existing test patterns, fixtures, and helpers before implementing custom solutions.',
      protocol_impact: 'Add mandatory step to EXEC phase: "Search codebase for existing test fixtures matching requirement"',
      implementation: 'Use grep/glob to find tests/fixtures/, tests/helpers/ before writing new test code'
    },
    {
      lesson: 'Protected Routes Require Authentication in Tests',
      description: 'Routes wrapped in ProtectedRoute redirect unauthenticated users. This is SECURITY FEATURE, not a bug. Tests must authenticate first.',
      protocol_impact: 'Add note to TESTING sub-agent: "Check for ProtectedRoute wrapper before diagnosing redirect issues"',
      implementation: 'Update test templates to include authentication step by default'
    },
    {
      lesson: 'Dev Server Restarts Required After Dependency Changes',
      description: 'Adding new dependencies (recharts, date-fns) requires dev server restart to optimize dependencies. Tests will timeout during optimization.',
      protocol_impact: 'Add to EXEC implementation checklist: "Restart dev server after npm install, wait for dependency optimization"',
      implementation: 'Document in CLAUDE.md: "After adding dependencies, restart server and verify Vite optimization complete"'
    },
    {
      lesson: 'Rollback Mechanisms Are Critical',
      description: 'Ability to roll back premature approvals saved the project. Without rollback script, would have required manual database edits.',
      protocol_impact: 'Ensure all phase transitions have corresponding rollback scripts',
      implementation: 'Create rollback-*.mjs scripts for each major status change (approval, completion, handoff)'
    }
  ],

  // Action Items for Future SDs
  action_items: [
    {
      item: 'Create LEAD Approval Checklist Script',
      priority: 'HIGH',
      description: 'Add automated checklist to lead-final-approval scripts that validates all PLAN→LEAD action items are marked complete before allowing approval',
      assignee: 'LEAD agent',
      estimated_effort: '1 hour'
    },
    {
      item: 'Add Test Infrastructure Discovery to EXEC Phase',
      priority: 'MEDIUM',
      description: 'Update EXEC implementation checklist to include step: "Search for existing test fixtures and helpers before creating new ones"',
      assignee: 'EXEC agent',
      estimated_effort: '30 minutes'
    },
    {
      item: 'Document Dev Server Restart Requirements',
      priority: 'MEDIUM',
      description: 'Add section to CLAUDE.md covering when dev server restarts are required (dependency changes, new components, route changes)',
      assignee: 'Documentation',
      estimated_effort: '15 minutes'
    },
    {
      item: 'Create Rollback Script Templates',
      priority: 'LOW',
      description: 'Generate templates for common rollback scenarios (approval, handoff, phase transition) to speed up error recovery',
      assignee: 'LEO Protocol maintenance',
      estimated_effort: '2 hours'
    }
  ],

  // Metrics
  metrics: {
    total_duration_days: 3,
    implementation_loc: 1318,
    components_created: 6,
    dependencies_added: 2,
    backend_changes: 0,
    database_tables_added: 0,
    apis_created: 0,
    test_pass_rate: '80%',
    sub_agent_confidence: '81%',
    rollbacks_required: 1,
    protocol_violations: 1,
    user_interventions: 4
  },

  // Protocol Adherence
  protocol_adherence: {
    overall_grade: 'B',
    phases_completed_correctly: ['LEAD_STRATEGIC_APPROVAL', 'PLAN_PRD_CREATION', 'EXEC_IMPLEMENTATION', 'PLAN_SUPERVISOR_VERIFICATION'],
    phases_requiring_rework: ['LEAD_FINAL_APPROVAL'],
    handoffs_created: 2,
    handoffs_valid: 2,
    sub_agents_activated: 5,
    sub_agents_successful: 5,
    notes: 'One protocol violation (premature approval without testing) was caught by user intervention and corrected through proper rollback procedure. All other phases followed LEO Protocol v4.2.0 correctly.'
  },

  // Recommendations for Next SD
  recommendations: [
    'Always check PLAN→LEAD action items before LEAD approval',
    'Review existing test infrastructure before writing new tests',
    'Restart dev server after dependency changes and wait for optimization',
    'Verify screenshot evidence before marking testing as complete',
    'Use Puppeteer as fallback when Playwright build issues occur',
    'Keep retrospectives in database, not markdown files (database-first architecture)'
  ]
};

// Store retrospective in SD metadata (table doesn't exist yet)
const updatedMetadata = {
  ...sd.metadata,
  retrospective: retrospective
};

const { error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: updatedMetadata
  })
  .eq('id', sd.id);

if (updateError) {
  console.error('❌ Failed to store retrospective:', updateError.message);
  console.log('\n📝 Retrospective content (for manual storage):');
  console.log(JSON.stringify(retrospective, null, 2));
  process.exit(1);
}

console.log('✅ Retrospective generated and stored in database\n');
console.log('📊 Key Metrics:');
console.log(`   Duration: ${retrospective.metrics.total_duration_days} days`);
console.log(`   Implementation: ${retrospective.metrics.implementation_loc} LOC`);
console.log(`   Components: ${retrospective.metrics.components_created}`);
console.log(`   Test Pass Rate: ${retrospective.metrics.test_pass_rate}`);
console.log(`   Protocol Grade: ${retrospective.protocol_adherence.overall_grade}\n`);

console.log('🎓 Key Learnings: ${retrospective.key_learnings.length}');
console.log('✅ What Went Well: ${retrospective.what_went_well.length}');
console.log('⚠️  What Needs Improvement: ${retrospective.what_needs_improvement.length}');
console.log('📋 Action Items: ${retrospective.action_items.length}\n');

console.log('🎉 SD-RECONNECT-011 is now DONE DONE!\n');
