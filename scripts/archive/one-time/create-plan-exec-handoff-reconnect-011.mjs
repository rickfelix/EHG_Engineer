#!/usr/bin/env node

/**
 * Create PLAN→EXEC Handoff for SD-RECONNECT-011
 * LEO Protocol v4.2.0 - Database-First
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createHandoff() {
  console.log('📋 CREATING PLAN→EXEC HANDOFF');
  console.log('='.repeat(70));

  const sdKey = 'SD-RECONNECT-011';

  // Get SD and PRD
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdKey)
    .single();

  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', 'PRD-RECONNECT-011')
    .single();

  if (!sd || !prd) {
    console.error('❌ SD or PRD not found');
    return;
  }

  // 7-Element Handoff Structure
  const handoff = {
    id: crypto.randomUUID(),
    sd_id: sd.uuid_id,
    from_agent: 'PLAN',
    to_agent: 'EXEC',
    handoff_type: 'technical_to_implementation',
    status: 'pending_acceptance',
    created_at: new Date().toISOString(),

    // Element 1: Executive Summary
    executive_summary: `
**PLAN Phase Complete**: PRD-RECONNECT-011 Approved - Ready for Implementation

**PRD Quality**: 92/100
**Estimated Effort**: 25 hours (UI-only work)
**Component Count**: 6 new components
**Estimated LOC**: 900 lines
**Backend Status**: COMPLETE (717 LOC, 5 APIs, 4 tables)

**Sub-Agent Approvals**:
✅ DESIGN: APPROVED (90% confidence - 6 components, Recharts + Shadcn UI)
✅ STORIES: COMPLETE (18 user stories, 42 story points, 4 epics)

**Implementation Scope**:
- DecisionAnalyticsDashboard (250 LOC)
- ThresholdCalibrationReview (200 LOC)
- DecisionHistoryTable (150 LOC)
- ConfidenceScoreChart (100 LOC)
- CalibrationPreview (120 LOC)
- FeatureFlagControls (80 LOC)

**Key Insight**: Zero backend work required. Pure UI integration wiring existing APIs.
    `.trim(),

    // Element 2: Completeness Report
    completeness_report: {
      overall_status: 'READY_FOR_IMPLEMENTATION',
      confidence_score: 92,

      requirements_validation: {
        functional: '5/5 requirements defined',
        non_functional: '3/3 requirements defined',
        technical: '3/3 requirements defined',
        acceptance_criteria: '10/10 defined',
        test_scenarios: '8/8 defined'
      },

      design_validation: {
        component_architecture: 'APPROVED (6 components, 75% reuse)',
        navigation_design: 'DEFINED (/chairman-analytics in AI & Automation)',
        layout_design: 'SPECIFIED (dashboard with tabs)',
        visualization_strategy: 'APPROVED (Recharts: Line, Bar, Area charts)',
        table_design: 'DETAILED (columns, filters, pagination)',
        form_design: 'SPECIFIED (calibration modify, feedback, flags)',
        accessibility: 'WCAG 2.1 AA requirements defined',
        interaction_patterns: 'DOCUMENTED (modals, confirmations, batch operations)'
      },

      backend_validation: {
        api_documentation: 'COMPLETE (decisions.ts 282 LOC, deltas.ts 435 LOC)',
        database_schema: 'VERIFIED (4 tables, 0 migrations needed)',
        endpoints_available: '5 endpoints operational',
        test_coverage: 'E2E tests exist (tests/e2e/decisions.spec.ts)',
        feature_flags: 'FEATURE_DECISION_LOG, FEATURE_CALIBRATION_REVIEW defined'
      },

      dependencies_validated: {
        required: ['recharts ^2.10.0', 'date-fns ^2.30.0'],
        shadcn_components: ['Table', 'Card', 'Dialog', 'Form', 'Badge', 'Switch', 'Select', 'Tabs'],
        reuse_from_sd_reconnect_006: ['NavigationCategory', 'FeatureSearch', 'OnboardingTour']
      }
    },

    // Element 3: Deliverables Manifest
    deliverables_manifest: [
      {
        deliverable: 'PRD-RECONNECT-011',
        status: 'APPROVED',
        quality_score: '92/100',
        location: 'product_requirements_v2 table'
      },
      {
        deliverable: 'DESIGN Sub-Agent Analysis',
        status: 'APPROVED',
        confidence: '90%',
        components: 6,
        location: 'SD metadata.design_analysis'
      },
      {
        deliverable: 'STORIES Sub-Agent Output',
        status: 'COMPLETE',
        user_stories: 18,
        story_points: 42,
        location: 'SD metadata.stories_analysis'
      },
      {
        deliverable: 'Backend API Documentation',
        status: 'ANALYZED',
        files: ['decisions.ts', 'deltas.ts'],
        endpoints: 5,
        location: '../ehg/src/api/'
      },
      {
        deliverable: 'Database Schema Documentation',
        status: 'VERIFIED',
        tables: 4,
        migration_file: '011_decision_log_schema.sql',
        location: '../ehg/database/migrations/'
      },
      {
        deliverable: 'TypeScript Interfaces (to create)',
        status: 'PENDING',
        interfaces: ['DecisionLogEntry', 'ThresholdDelta', 'CalibrationSession', 'RationaleTag'],
        location: 'Will create in ../ehg/src/types/decisions.ts'
      }
    ],

    // Element 4: Key Decisions & Rationale
    key_decisions: [
      {
        decision: 'Use Recharts for data visualization',
        rationale: 'Battle-tested React library. Declarative API. TypeScript support. Handles Line/Bar/Area charts needed for confidence trends and override patterns.',
        impact: 'HIGH',
        approved_by: 'DESIGN Sub-Agent',
        reversible: true,
        trade_offs: 'Bundle size +50KB vs developer productivity and type safety'
      },
      {
        decision: 'Dashboard with tabs (Analytics/Calibration/Settings)',
        rationale: 'Single-page dashboard improves context retention. Reduces navigation overhead. User stays in same mental model.',
        impact: 'MEDIUM',
        approved_by: 'DESIGN Sub-Agent',
        reversible: true,
        trade_offs: 'Initial load +0.5s vs better UX'
      },
      {
        decision: 'LocalStorage for feature flag UI state',
        rationale: 'Simple persistence. No backend changes. Follows SD-RECONNECT-006 pattern (NavigationCategory). Backend flags unchanged.',
        impact: 'LOW',
        approved_by: 'PLAN Agent',
        reversible: true,
        trade_offs: 'Per-browser settings vs per-user settings'
      },
      {
        decision: 'Desktop-first responsive design',
        rationale: 'Analytics dashboards require screen real estate. Charts and tables need space. Mobile is secondary use case for quick checks.',
        impact: 'MEDIUM',
        approved_by: 'DESIGN Sub-Agent',
        reversible: false,
        trade_offs: 'Mobile UX somewhat compromised vs optimal desktop experience'
      },
      {
        decision: 'Pagination default 25 rows (options: 10/25/50/100)',
        rationale: 'Balances initial load time with data visibility. User can increase if needed. Matches industry standards.',
        impact: 'LOW',
        approved_by: 'PLAN Agent',
        reversible: true,
        trade_offs: 'May require page navigation vs showing all data'
      }
    ],

    // Element 5: Known Issues & Risks
    known_issues: [
      {
        issue: 'Empty data states (no decisions logged initially)',
        severity: 'LOW',
        mitigation: 'Clear onboarding message linking to feature flag settings. Consider sample data generation script for demo.',
        status: 'PLANNED',
        owner: 'EXEC',
        action: 'Implement empty state UI with helpful copy and CTA'
      },
      {
        issue: 'Complex table state management (filters + pagination + sorting)',
        severity: 'MEDIUM',
        mitigation: 'Start with Shadcn Table built-in features. If insufficient, add react-table library. Document state management approach.',
        status: 'MONITOR',
        owner: 'EXEC',
        action: 'Prototype table with Shadcn first, escalate if complexity exceeds expectations'
      },
      {
        issue: 'Recharts bundle size impact (+50KB)',
        severity: 'LOW',
        mitigation: 'Tree-shake imports (import { LineChart } instead of import * as recharts). Lazy load chart components. Monitor bundle analyzer.',
        status: 'PLANNED',
        owner: 'EXEC',
        action: 'Use specific imports, lazy load DecisionAnalyticsDashboard'
      },
      {
        issue: 'Real-time data updates (WebSocket vs polling)',
        severity: 'LOW',
        mitigation: 'Start with manual refresh button. If real-time needed, add polling (30s interval). WebSocket is overkill for analytics.',
        status: 'DEFERRED',
        owner: 'PLAN',
        action: 'Document refresh strategy in implementation notes'
      }
    ],

    // Element 6: Resource Utilization
    resource_utilization: {
      total_plan_hours: 18,
      breakdown: {
        backend_analysis: 3,
        design_subagent: 4,
        stories_subagent: 2,
        prd_creation: 8,
        handoff_creation: 1
      },

      estimated_exec_hours: 25,
      exec_breakdown: {
        typescript_interfaces: 2,
        decision_analytics_dashboard: 6,
        threshold_calibration_review: 5,
        decision_history_table: 4,
        confidence_score_chart: 2,
        calibration_preview: 3,
        feature_flag_controls: 1,
        navigation_integration: 1,
        testing_manual: 1
      },

      estimated_verification_hours: 4,
      verification_breakdown: {
        plan_supervisor: 2,
        testing_subagent: 1,
        accessibility_check: 1
      },

      total_project_hours: 50,
      efficiency_projection: '75% (reuse from SD-RECONNECT-006 + existing backend)',

      business_value: {
        dev_value_unlocked: '$300K-500K',
        effort_investment: '50 hours (~$5K-7K cost)',
        roi_multiplier: '50-100x',
        strategic_impact: 'HIGH - Self-improving AI platform differentiator'
      }
    },

    // Element 7: Action Items for Receiver (EXEC)
    action_items: [
      {
        action: 'APPLICATION CHECK - Verify target application',
        priority: 'CRITICAL',
        deadline: 'Before ANY code',
        details: 'cd ../ehg && pwd (should show ../ehg). Verify git remote shows rickfelix/ehg.git. DO NOT implement in EHG_Engineer!',
        estimated_effort: '1 min'
      },
      {
        action: 'Install dependencies: recharts and date-fns',
        priority: 'CRITICAL',
        deadline: 'Before component creation',
        details: 'npm install recharts@^2.10.0 date-fns@^2.30.0 --save',
        estimated_effort: '5 min'
      },
      {
        action: 'Create TypeScript interfaces from API schemas',
        priority: 'CRITICAL',
        deadline: 'Before component creation',
        details: 'Create ../ehg/src/types/decisions.ts with DecisionLogEntry, ThresholdDelta, CalibrationSession, RationaleTag interfaces based on decisions.ts and deltas.ts schemas',
        estimated_effort: '2 hours'
      },
      {
        action: 'Implement DecisionAnalyticsDashboard component',
        priority: 'CRITICAL',
        deadline: 'Day 1',
        details: 'Dashboard shell with tabs (Analytics, Calibration, Settings). Summary cards. Date range selector. Feature flag status indicator.',
        estimated_effort: '6 hours'
      },
      {
        action: 'Build DecisionHistoryTable with filters',
        priority: 'CRITICAL',
        deadline: 'Day 2',
        details: 'Shadcn Table. Columns per DESIGN analysis. Filters: venture_id, stage_id, override_only, date_range. Pagination 25/50/100. Wire GET /api/decisions',
        estimated_effort: '4 hours'
      },
      {
        action: 'Create ConfidenceScoreChart visualization',
        priority: 'HIGH',
        deadline: 'Day 2',
        details: 'Recharts LineChart showing confidence trends over time. Wire GET /api/decisions/stats. ARIA labels for accessibility.',
        estimated_effort: '2 hours'
      },
      {
        action: 'Implement ThresholdCalibrationReview interface',
        priority: 'CRITICAL',
        deadline: 'Day 3',
        details: 'Table of proposals. Accept/Reject/Modify buttons. Wire POST /api/deltas/:id/accept and /api/deltas/:id/reject. Confirmation dialogs.',
        estimated_effort: '5 hours'
      },
      {
        action: 'Build CalibrationPreview modal',
        priority: 'MEDIUM',
        deadline: 'Day 3',
        details: 'Batch selection. Preview table. Impact summary (avg change %, risk level). Wire POST /api/deltas/preview. Apply All action.',
        estimated_effort: '3 hours'
      },
      {
        action: 'Add FeatureFlagControls to Settings',
        priority: 'MEDIUM',
        deadline: 'Day 4',
        details: 'Shadcn Switch components. FEATURE_DECISION_LOG and FEATURE_CALIBRATION_REVIEW toggles. LocalStorage persistence. Show status in dashboard header.',
        estimated_effort: '1 hour'
      },
      {
        action: 'Integrate with Navigation',
        priority: 'HIGH',
        deadline: 'Day 4',
        details: 'Add to navigationTaxonomy.ts in AI & Automation category. Update FeatureSearch index. Add NEW badge.',
        estimated_effort: '30 min'
      },
      {
        action: 'Create 3-step OnboardingTour',
        priority: 'LOW',
        deadline: 'Day 4',
        details: 'Reuse OnboardingTour component from SD-RECONNECT-006. Steps: (1) Dashboard overview, (2) Calibration review, (3) Feature flags.',
        estimated_effort: '30 min'
      },
      {
        action: 'Add route to App.tsx',
        priority: 'CRITICAL',
        deadline: 'Day 4',
        details: 'Lazy load DecisionAnalyticsDashboard. Route: /chairman-analytics. Protected route with AuthenticatedLayout.',
        estimated_effort: '15 min'
      },
      {
        action: 'Manual testing against acceptance criteria',
        priority: 'CRITICAL',
        deadline: 'Day 4',
        details: 'Test all 10 acceptance criteria. Test all 8 test scenarios. Document results.',
        estimated_effort: '1 hour'
      },
      {
        action: 'Commit implementation with SD-ID',
        priority: 'CRITICAL',
        deadline: 'After testing',
        details: 'Git commit with format: feat(SD-RECONNECT-011): Implement Chairman Decision Analytics Dashboard. Include AI attribution footer.',
        estimated_effort: '10 min'
      },
      {
        action: 'Create EXEC→PLAN handoff',
        priority: 'CRITICAL',
        deadline: 'After commit',
        details: 'Document implementation completion, LOC count, components created, commit hash, known issues',
        estimated_effort: '1 hour'
      }
    ],

    metadata: {
      handoff_version: '4.2.0',
      mandatory_elements: 7,
      elements_completed: 7,
      validation_status: 'COMPLETE',
      prd_id: 'PRD-RECONNECT-011',
      prd_quality_score: 92,
      design_confidence: 90,
      backend_status: 'COMPLETE',
      estimated_exec_hours: 25,
      component_count: 6,
      estimated_loc: 900,
      handed_off_by: 'PLAN Agent',
      handed_off_to: 'EXEC Agent',
      implementation_ready: true
    }
  };

  // Store handoff in SD metadata
  const { data: currentSD } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .single();

  const updatedMetadata = {
    ...(currentSD?.metadata || {}),
    plan_exec_handoff: handoff,
    current_phase: 'EXEC_IMPLEMENTATION'
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata,
      current_phase: 'EXEC_IMPLEMENTATION',
      updated_at: new Date().toISOString()
    })
    .eq('sd_key', sdKey);

  if (error) {
    console.error('❌ Error storing handoff:', error.message);
    return;
  }

  console.log('✅ PLAN→EXEC Handoff Created');
  console.log('='.repeat(70));
  console.log(`Handoff ID: ${handoff.id}`);
  console.log(`From: ${handoff.from_agent} → To: ${handoff.to_agent}`);
  console.log(`Elements: ${handoff.metadata.elements_completed}/7 (COMPLETE)`);
  console.log('');
  console.log('📊 Implementation Summary:');
  console.log(`  Components: ${handoff.metadata.component_count}`);
  console.log(`  Estimated LOC: ${handoff.metadata.estimated_loc}`);
  console.log(`  Estimated Hours: ${handoff.metadata.estimated_exec_hours}`);
  console.log(`  Backend Status: ${handoff.metadata.backend_status}`);
  console.log('');
  console.log('📋 EXEC Priority Actions:');
  handoff.action_items.filter(a => a.priority === 'CRITICAL').slice(0, 5).forEach(action => {
    console.log(`  • ${action.action}`);
  });
  console.log('');
  console.log('✅ SD Phase Updated: EXEC_IMPLEMENTATION');
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ HANDOFF COMPLETE - READY FOR EXEC PHASE');
}

createHandoff().catch(console.error);
