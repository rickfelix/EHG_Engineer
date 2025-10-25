#!/usr/bin/env node

/**
 * Update SD-RECONNECT-013 with comprehensive automation control center strategy
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDRECONNECT013() {
  console.log('📋 Updating SD-RECONNECT-013 with comprehensive automation control center strategy...\n');

  const updatedSD = {
    description: `Build comprehensive UI for self-improving automation system with chairman feedback learning, pattern detection, and progressive automation (manual → assisted → auto). Complete infrastructure exists: automationEngine.ts (557 LOC, 20KB), automation_learning_schema.sql (264 LOC, 12KB with 5 tables), AutomationDashboard.tsx (603 LOC), BUT limited UI integration and no centralized control center at /automation-control route.

**CURRENT STATE - PARTIAL AUTOMATION UI**:
- ✅ AutomationEngine class: 557 LOC, 20KB complete implementation with AI learning
- ✅ Database schema: 5 tables (automation_rules, automation_feedback, automation_history, automation_patterns, automation_learning_queue) + automation_metrics view + trigger function
- ✅ 40 pre-initialized rules: One per stage with default confidence, conditions, automation states
- ✅ Progressive automation: 3 states (manual <60%, assisted 60-85%, auto >85%) with automatic transitions
- ✅ Chairman feedback loop: recordFeedback() adjusts confidence (+2 agree, -5 disagree), updates automation state
- ✅ Pattern detection: identifyPatterns() finds consistent agreement/disagreement, batch learning processLearningBatch()
- ✅ AutomationDashboard component: 603 LOC with recommendations, feedback UI, state badges
- ✅ Historical context: getHistoricalContext() queries similar ventures, previous outcomes
- ⚠️ Limited integration: 11 imports of automationEngine, but no centralized /automation-control route
- ❌ No rules management UI: Cannot view/edit 40 automation rules, conditions, actions
- ❌ No pattern visualization: automation_patterns table exists, no UI displays detected patterns
- ❌ No performance metrics dashboard: automation_metrics view exists, not visualized
- ❌ No learning queue visibility: automation_learning_queue table exists, no UI shows pending batches
- ❌ No rule CRUD: Cannot create custom rules, edit conditions, delete rules
- ❌ No audit trail: automation_history table exists, no comprehensive history UI

**AUTOMATION INFRASTRUCTURE ANALYSIS (557 LOC engine + 264 LOC schema + 603 LOC dashboard = 1424 LOC total)**:

**AutomationEngine (automationEngine.ts, 557 LOC, 20KB)**:

**Core Capabilities**:
- analyzeVenture(): Main API - analyzes venture, returns AutomationRecommendation[] with action, confidence, requiresApproval
- recordFeedback(): Chairman provides feedback (agree/disagree/modify), updates rule confidence, triggers learning
- getAutomationStatus(): Returns metrics - totalRules, autoRules, assistedRules, manualRules, averageConfidence, learningProgress
- executeAutomation(): Auto-executes if requiresApproval=false (confidence >85%), updates venture stage, records history

**Learning System (Lines 373-494)**:
- recordFeedback(): Stores in learningBuffer, updates rule confidence (+2 agree, -5 disagree), recalculates automation state
- processLearningBatch(): Processes buffer when ≥10 items, calls identifyPatterns(), applies pattern-based adjustments
- identifyPatterns(): Groups by stage, detects consistent_agreement (≥3 agree, 0 disagree → +5 confidence) or consistent_disagreement (≥3 disagree, 0 agree → -10 confidence)
- persistFeedback(): Inserts to automation_feedback table
- persistRuleUpdate(): Upserts to automation_rules table with new confidence, automation_state

**40 Pre-initialized Rules (Lines 60-175)**:
- Stage 1-10: Manual, confidence 30%, condition: 'metadata.validation_passed === true'
- Stage 11-20: Manual, confidence 50%, condition: 'validation_passed && dwell_days < 7'
- Stage 21-26: Assisted, confidence 70%, condition: 'validation_passed && gate_retries_7d < 2'
- Stage 27: Assisted, confidence 80%, action: 'skip', condition: 'skip_recommended === true'
- Stage 28-35: Assisted, confidence 60%
- Stage 36, 39: Auto, confidence 85%, parallel execution

**Confidence Calculation (Lines 282-303)**:
- Base: rule.confidence (0-100)
- Learning boost: +20% max from successRate if totalExecutions >10
- Penalties: -20% if dwellDays >14, -30% if retries >3
- Boost: +10% if dwellDays <3 and retries=0
- Thresholds: ≥85 = auto, ≥60 = assisted, <60 = manual

**Database Schema (automation_learning_schema.sql, 264 LOC, 12KB)**:

**Tables (5)**:
1. automation_rules (Lines 5-15): id, stage_id, condition (TEXT), action (progress/approve/reject/skip/retry), confidence (0-100), automation_state (manual/assisted/auto), learning_data (JSONB: totalExecutions, successfulExecutions, successRate, lastUpdated)
2. automation_feedback (Lines 22-32): venture_id, stage_id, recommended_action, actual_action, feedback (agree/disagree/modify), reasoning, confidence_at_recommendation
3. automation_history (Lines 40-51): venture_id, stage_id, action, confidence, automation_state, outcome (success/failure/pending), error_message, execution_time_ms
4. automation_patterns (Lines 60-69): pattern_type, stage_id, pattern_data (JSONB), confidence_impact, occurrences, last_seen
5. automation_learning_queue (Lines 76-82): batch_data (JSONB), processed (boolean), processed_at

**Automation Metrics View (Lines 88-107)**:
- SELECT: total_rules, auto_rules, assisted_rules, manual_rules, avg_confidence, learning_progress (% with >10 executions), total_feedback_count, agree_count, disagree_count, total_executions, success_rate
- FROM: automation_rules LEFT JOIN automation_feedback, automation_history (last 30 days)

**Trigger Function (Lines 110-137)**:
- update_rule_confidence(): ON INSERT automation_feedback, updates automation_rules
- Logic: agree → +2 confidence (max 100), disagree → -5 (min 0), modify → -1
- Auto-transition: confidence ≥85 → 'auto', ≥60 → 'assisted', <60 → 'manual'
- AFTER INSERT ON automation_feedback FOR EACH ROW

**Existing UI (AutomationDashboard.tsx, 603 LOC)**:
- Current features: Recommendations display, feedback buttons (agree/disagree), automation state badges, confidence scores
- Integration: Imports automationEngine, calls analyzeVenture(), recordFeedback()
- Limitations: Embedded in ventures context, not standalone route, no rules management, no pattern visualization

**GAPS IDENTIFIED**:
1. **No Centralized Route**: /automation-control does not exist, no main navigation entry
2. **No Rules Manager**: Cannot view all 40 rules, edit conditions, adjust confidence thresholds, create custom rules
3. **No Pattern Visualization**: automation_patterns table exists, but no UI shows detected patterns (consistent_agreement, consistent_disagreement, etc.)
4. **No Performance Dashboard**: automation_metrics view provides rich data, not visualized in comprehensive dashboard
5. **No Learning Queue UI**: automation_learning_queue table tracks batch processing, no visibility into pending/processed batches
6. **No Audit Trail**: automation_history table comprehensive, but no searchable history UI with filters
7. **No Bulk Operations**: Cannot batch update states, bulk adjust confidence, mass enable/disable automation
8. **No Simulation Mode**: Cannot test rule changes before applying, no dry-run capability`,

    scope: `**8-Week Automation Control Center Implementation**:

**PHASE 1: Core Control Center UI (Weeks 1-2)**
- Create AutomationControlCenter component (main page at /automation-control)
- Build RulesManagerPanel: Table of 40 rules with stage, condition, action, confidence, state
- Add rule editing: Modal to edit condition, action, confidence, automation state
- Display automation_metrics view data: Total rules, state distribution, learning progress, success rate

**PHASE 2: Feedback & Learning Interface (Week 3)**
- Create FeedbackInterfacePanel: Show recent recommendations, provide feedback UI
- Build LearningQueueMonitor: Display automation_learning_queue, show processed/pending counts
- Add batch processing controls: Trigger manual batch processing, view processing results
- Show real-time confidence adjustments: Visualize how feedback impacts confidence

**PHASE 3: Pattern Detection & Visualization (Weeks 4-5)**
- Create PatternDetectionDashboard: Query automation_patterns, display by pattern_type
- Build pattern cards: consistent_agreement, consistent_disagreement with stage_id, occurrences, confidence_impact
- Add pattern insights: Suggest automation opportunities based on detected patterns
- Show pattern timeline: When patterns were detected, how they evolved

**PHASE 4: Performance Metrics & History (Week 6)**
- Build PerformanceMetricsPanel: Visualize automation_metrics view with charts
- Add success rate trends: Line chart of success_rate over time
- Create AutomationHistoryViewer: Searchable table of automation_history with filters (venture, stage, outcome, date range)
- Show efficiency metrics: Time saved, manual tasks reduced, automation adoption rate

**PHASE 5: Advanced Features (Week 7)**
- Add rule CRUD: Create custom rules, delete rules, bulk edit
- Build simulation mode: Test rule changes with historical data before applying
- Add export/import: Export rules as JSON, import rule sets
- Create progressive automation scheduler: Plan state transitions (manual → assisted → auto over time)

**PHASE 6: Integration & Polish (Week 8)**
- Add /automation-control to navigation with Bot icon
- Integrate with existing AutomationDashboard (603 LOC) - link to control center
- Add role-based access: Chairman full control, users view-only
- Polish UI: Loading states, error handling, success toasts, confirmation dialogs

**OUT OF SCOPE**:
- ❌ Real-time learning (batch processing sufficient)
- ❌ Multi-stage automation orchestration (single-stage focus)
- ❌ External AI model integration (rule-based learning sufficient)`,

    strategic_objectives: [
      'Build centralized Automation Control Center at /automation-control route, consolidating 40 automation rules management, feedback interface, pattern visualization, and performance metrics in single dashboard',
      'Create RulesManagerPanel for viewing/editing all 40 automation rules: Edit conditions, actions, confidence thresholds, automation states with real-time impact preview',
      'Implement comprehensive feedback interface: Show recommendations, capture chairman feedback (agree/disagree/modify), visualize confidence adjustments in real-time as learning happens',
      'Build PatternDetectionDashboard visualizing automation_patterns table: Display detected patterns (consistent_agreement, consistent_disagreement), suggest automation opportunities, show pattern evolution over time',
      'Create PerformanceMetricsPanel using automation_metrics view: Charts for success rate trends, state distribution, learning progress, efficiency metrics (time saved, tasks automated)',
      'Implement AutomationHistoryViewer with search/filters: Browse automation_history table by venture/stage/outcome/date, export audit trails, analyze automation decisions',
      'Enable progressive automation control: Transition rules through states (manual → assisted → auto) based on confidence thresholds, schedule state transitions, monitor adoption',
      'Achieve 40-60% manual work reduction: Target 60% of stages in assisted/auto states within 3 months, demonstrating learning system effectiveness and chairman trust'
    ],

    success_criteria: [
      '✅ AutomationControlCenter live at /automation-control: Full dashboard with 4+ panels (Rules Manager, Feedback, Patterns, Metrics)',
      '✅ Rules management functional: View all 40 rules, edit conditions/actions/confidence, changes persist to automation_rules table, real-time preview',
      '✅ Feedback interface operational: Display recommendations from analyzeVenture(), capture feedback, call recordFeedback(), show confidence adjustments',
      '✅ Pattern visualization complete: Query automation_patterns table, display patterns with stage_id/occurrences/confidence_impact, suggest opportunities',
      '✅ Performance metrics visualized: automation_metrics view data in charts - success rate trend, state distribution pie, learning progress bar',
      '✅ Automation history searchable: Browse automation_history with filters (venture, stage, outcome, date range), export CSV, pagination',
      '✅ Progressive automation working: Can transition states via UI, thresholds configurable (default 60/85), bulk state updates',
      "✅ Navigation integration: 'Automation Control' in nav sidebar with Bot icon, loads <2 seconds",
      '✅ State distribution target: ≥20% auto rules, ≥40% assisted rules within 3 months (up from initial: 5% auto, 15% assisted)',
      '✅ Learning adoption: ≥500 feedback events within 30 days, ≥70% agree rate (shows good recommendations)',
      '✅ Manual work reduction: 40-60% reduction measured by (auto_executions / total_decisions), target 50%+ within 3 months',
      '✅ Pattern detection active: ≥10 patterns detected, ≥5 applied to rule adjustments, ≥3 automation opportunities identified'
    ],

    key_principles: [
      '**Chairman in Control**: Always require approval for confidence <85%, never auto-execute without sufficient learning, provide override capability at all times',
      '**Progressive Trust**: Start manual (confidence <60%), move to assisted (60-85) with chairman review, only auto (>85) after proven success',
      '**Transparent Learning**: Show exactly how feedback impacts confidence (+2 agree, -5 disagree), display pattern detection logic, explain all automation decisions',
      '**Pattern-Driven Improvement**: Use detected patterns (consistent_agreement, consistent_disagreement) to suggest automation opportunities, not force them',
      '**Audit Everything**: Record every automation decision in automation_history, make searchable, enable compliance and learning analysis',
      '**Batch Processing**: Process feedback in batches (≥10 items) for pattern detection, not real-time - reduces noise, finds stronger patterns',
      '**Safety First**: Simulation mode for rule changes, dry-run before applying, rollback capability if automation degrades',
      '**Efficiency Metrics**: Prove value with time saved, tasks automated, success rate - metrics justify progressive automation adoption'
    ],

    implementation_guidelines: [
      '**PHASE 1: Core Control Center (Weeks 1-2)**',
      '',
      '1. Create AutomationControlCenter.tsx component:',
      '   - Route: /automation-control',
      '   - Layout: 4 main panels - Rules Manager (top-left), Feedback Interface (top-right), Pattern Detection (bottom-left), Performance Metrics (bottom-right)',
      "   - Import: import { automationEngine } from '@/services/automationEngine';",
      '',
      '2. Build RulesManagerPanel component:',
      "   - Fetch rules: const rules = await supabase.from('automation_rules').select('*').order('stage_id');",
      '   - Table columns: Stage ID, Condition, Action, Confidence, Automation State, Last Updated, Actions (Edit, Delete)',
      '   - Filter: Dropdown for state (All, Manual, Assisted, Auto)',
      '   - Sort: By stage_id, confidence, last updated',
      '',
      '3. Add rule editing modal:',
      '   - Form fields: Condition (textarea), Action (select: progress/approve/reject/skip/retry), Confidence (slider 0-100), Automation State (radio: manual/assisted/auto)',
      '   - Validation: Confidence 0-100, state matches confidence (manual <60, assisted 60-85, auto >85), condition is valid expression',
      "   - Save handler: await supabase.from('automation_rules').update({ condition, action, confidence, automation_state }).eq('id', ruleId);",
      "   - Preview: Show impact - 'Changing confidence from 70 to 80 will keep assisted state (60-85 range)'",
      '',
      '4. Display automation_metrics view:',
      "   - Query: const { data: metrics } = await supabase.from('automation_metrics').select('*').single();",
      '   - Cards: Total Rules (metrics.total_rules), Auto (metrics.auto_rules), Assisted (metrics.assisted_rules), Manual (metrics.manual_rules)',
      "   - Progress bar: Learning Progress (metrics.learning_progress * 100)% - '15 of 40 rules have >10 executions'",
      '   - Success rate badge: (metrics.success_rate * 100).toFixed(1)% - color: green if >80%, yellow 60-80%, red <60%',
      '',
      '**PHASE 2: Feedback & Learning (Week 3)**',
      '',
      '5. Create FeedbackInterfacePanel component:',
      "   - Fetch recent feedback: const { data: recentFeedback } = await supabase.from('automation_feedback').select('*').order('created_at', { ascending: false }).limit(20);",
      '   - Display: Table with columns - Venture, Stage, Recommended Action, Actual Action, Feedback (badge), Reasoning, Timestamp',
      '   - Feedback buttons: Agree (green ThumbsUp), Disagree (red ThumbsDown), Modify (yellow Edit)',
      '   - Handler: await automationEngine.recordFeedback({ ventureId, stageId, recommendedAction, actualAction, feedback, reasoning, timestamp });',
      '',
      '6. Build LearningQueueMonitor component:',
      "   - Query: const { data: queue } = await supabase.from('automation_learning_queue').select('*').order('created_at', { ascending: false });",
      '   - Stats: Pending count (processed=false), Processed count (processed=true), Last processed timestamp',
      "   - Batch processing button: 'Process Learning Batch' → calls automationEngine.processLearningBatch() (note: method is private, may need to expose or trigger via feedback threshold)",
      '   - Progress indicator: Show when batch processing, display results (patterns identified, rules updated)',
      '',
      '7. Add real-time confidence adjustment visualization:',
      "   - When feedback submitted: Show before/after confidence - 'Confidence: 70% → 72% (+2 from agree)'",
      "   - State transition indicator: If state changes, show 'Automation State: assisted → assisted (stays in 60-85 range)'",
      '   - Animation: Smooth transition, green flash on increase, red on decrease',
      '',
      '**PHASE 3: Pattern Detection (Weeks 4-5)**',
      '',
      '8. Create PatternDetectionDashboard component:',
      "   - Query: const { data: patterns } = await supabase.from('automation_patterns').select('*').order('occurrences', { ascending: false });",
      '   - Group by pattern_type: consistent_agreement, consistent_disagreement, custom patterns',
      '   - Pattern cards: Pattern Type (badge), Stage ID, Occurrences, Confidence Impact (+5%, -10%), Last Seen (relative time)',
      '',
      '9. Build pattern insights:',
      "   - For consistent_agreement patterns (≥3 occurrences): Suggest 'Stage {stage_id} shows consistent agreement - consider increasing confidence or moving to auto'",
      "   - For consistent_disagreement patterns: Suggest 'Stage {stage_id} has frequent disagreements - review condition or reduce confidence'",
      "   - Automation opportunities: Show stages with high agreement (>80%) but still manual/assisted - 'Stage 15: 90% agreement, confidence 65% - ready for auto?'",
      '',
      '10. Show pattern timeline:',
      '     - Line chart: X-axis = date, Y-axis = pattern occurrences per day',
      '     - Filter by pattern_type, stage_id',
      '     - Annotate: Mark when confidence adjustments were made, show impact on occurrence rate',
      '',
      '**PHASE 4: Performance Metrics & History (Week 6)**',
      '',
      '11. Build PerformanceMetricsPanel component:',
      '     - Use automation_metrics view data',
      '     - Charts:',
      '       - Pie chart: State distribution (auto, assisted, manual) with percentages',
      '       - Bar chart: Avg confidence per stage group (1-10, 11-20, 21-26, 27, 28-35, 36-40)',
      '       - Line chart: Success rate trend over last 30 days (query automation_history, group by day)',
      '     - Metrics cards: Total Executions (metrics.total_executions), Agree Rate (metrics.agree_count / metrics.total_feedback_count * 100)',
      '',
      '12. Add success rate trend:',
      "     - Query: SELECT DATE(created_at) as date, COUNT(CASE WHEN outcome='success' THEN 1 END)::float / COUNT(*) as success_rate FROM automation_history WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date",
      '     - Line chart: X-axis = date, Y-axis = success_rate (0-1), target line at 0.8 (80%)',
      '',
      '13. Create AutomationHistoryViewer component:',
      "     - Fetch: const { data: history } = await supabase.from('automation_history').select('*, ventures(name)').order('created_at', { ascending: false }).limit(50);",
      '     - Table: Venture Name, Stage ID, Action, Confidence, Automation State, Outcome (badge), Execution Time (ms), Timestamp',
      '     - Filters: Venture ID (dropdown), Stage ID (multi-select), Outcome (All/Success/Failure/Pending), Date range (date picker)',
      '     - Search: Text search on venture name',
      '     - Export: CSV button downloads filtered results',
      '',
      '**PHASE 5: Advanced Features (Week 7)**',
      '',
      '14. Add rule CRUD:',
      '     - Create rule: Modal with form (stage_id, condition, action, initial confidence), insert to automation_rules',
      '     - Delete rule: Confirmation dialog, DELETE FROM automation_rules WHERE id=?, warn if has history',
      '     - Bulk edit: Select multiple rules (checkboxes), apply confidence adjustment (add/subtract N%), update automation_state',
      '',
      '15. Build simulation mode:',
      '     - Test rule changes: Load historical data (last 100 automation_history records), apply new rule, show predicted outcomes',
      "     - Dry-run: 'If confidence was 80 instead of 70, would have auto-executed 12 more times, with 91% success rate'",
      '     - Visual diff: Show before/after metrics, highlight impact',
      '',
      '16. Add export/import:',
      '     - Export: JSON.stringify(rules) → download as automation_rules_export.json',
      '     - Import: File upload, validate schema, bulk upsert to automation_rules, show confirmation',
      '',
      '17. Create progressive automation scheduler:',
      '     - UI: Select stage, set target state (assisted/auto), set timeframe (30/60/90 days)',
      '     - Logic: Calculate confidence increase needed (e.g., 60 → 85 in 60 days = +0.42/day)',
      '     - Schedule: Create plan, show milestones, trigger confidence boosts on schedule (via cron or manual)',
      '',
      '**PHASE 6: Integration (Week 8)**',
      '',
      '18. Add navigation route:',
      "     - App.tsx: <Route path='/automation-control' element={<AutomationControlCenter />} />",
      "     - Navigation.tsx or ModernNavigationSidebar.tsx: { title: 'Automation Control', icon: Bot, href: '/automation-control' }",
      '',
      '19. Integrate with existing AutomationDashboard (603 LOC):',
      "     - Add 'View Control Center' button in AutomationDashboard → link to /automation-control",
      '     - Share state: Use same automationEngine singleton, updates in control center reflect in dashboard',
      '',
      '20. Add role-based access:',
      "     - Check user role: const { data: userRole } = await supabase.from('user_company_access').select('role').eq('user_id', auth.uid()).single();",
      "     - If role = 'admin' or 'system_admin': Full control (edit, delete, bulk operations)",
      "     - If role = 'user': View-only mode (no edit buttons, read-only tables)",
      "     - Show indicator: Badge 'Chairman Mode' or 'View-Only Mode'"
    ],

    risks: [
      {
        risk: "Over-automation without sufficient learning: Users push rules to 'auto' prematurely (confidence <70%), automation makes bad decisions, trust erodes",
        probability: 'Medium (50%)',
        impact: 'High - Loss of trust, manual override burden, system abandonment',
        mitigation: 'Enforce minimum confidence thresholds (auto ≥85%, assisted ≥60%), require ≥10 successful executions before auto, show warnings, provide simulation mode'
      },
      {
        risk: 'Feedback fatigue: Chairman overwhelmed by feedback requests (100+ per day), stops providing feedback, learning stalls',
        probability: 'High (60%)',
        impact: 'High - Learning stops, automation improvement halts, system stagnates',
        mitigation: 'Smart feedback sampling (only ask for low-confidence or disagreement cases), batch feedback (review 10 at once), auto-agree on high-confidence (>90%), feedback limits (max 20/day)'
      },
      {
        risk: 'Pattern detection noise: Too many false patterns detected (coincidental agreement, small sample sizes), irrelevant suggestions, users ignore',
        probability: 'Medium (40%)',
        impact: 'Medium - Low signal-to-noise, pattern insights not trusted',
        mitigation: 'Require minimum occurrences (≥5) for pattern, confidence scoring on patterns, statistical significance tests, allow pattern dismissal'
      },
      {
        risk: 'Rule editing errors: Users edit conditions with invalid syntax, automation breaks, ventures stuck',
        probability: 'Medium (40%)',
        impact: 'High - Broken automation, manual intervention needed, data inconsistency',
        mitigation: 'Condition syntax validation, preview impact before saving, dry-run testing, rollback capability, audit trail of changes, confirmation dialogs'
      }
    ],

    success_metrics: [
      {
        metric: 'Automation state distribution',
        target: '≥20% auto rules, ≥40% assisted rules within 3 months (from initial 5% auto, 15% assisted)',
        measurement: 'SELECT automation_state, COUNT(*) FROM automation_rules GROUP BY automation_state'
      },
      {
        metric: 'Learning adoption',
        target: '≥500 feedback events within 30 days, ≥70% agree rate',
        measurement: "SELECT COUNT(*) as total, SUM(CASE WHEN feedback='agree' THEN 1 END)::float/COUNT(*) as agree_rate FROM automation_feedback WHERE created_at > NOW() - INTERVAL '30 days'"
      },
      {
        metric: 'Manual work reduction',
        target: '40-60% reduction measured by auto_executions / total_decisions, target 50%+',
        measurement: "SELECT SUM(CASE WHEN automation_state='auto' THEN 1 END)::float / COUNT(*) FROM automation_history"
      },
      {
        metric: 'Pattern detection activity',
        target: '≥10 patterns detected, ≥5 applied to rule adjustments',
        measurement: 'SELECT COUNT(*) FROM automation_patterns; Track rule updates triggered by patterns'
      },
      {
        metric: 'Control center usage',
        target: '≥80% of admins access /automation-control weekly, ≥50% edit rules',
        measurement: "Analytics events: 'automation_control_viewed', 'rule_edited', group by user"
      },
      {
        metric: 'Automation success rate',
        target: '≥80% success rate for auto executions, ≥90% for assisted with approval',
        measurement: "SELECT automation_state, SUM(CASE WHEN outcome='success' THEN 1 END)::float/COUNT(*) FROM automation_history GROUP BY automation_state"
      }
    ],

    metadata: {
      'automation_infrastructure': {
        'automationEngine': '557 LOC, 20KB, 40 pre-initialized rules',
        'database_schema': '264 LOC, 12KB, 5 tables + 1 view + 1 trigger',
        'existing_ui': 'AutomationDashboard 603 LOC, AutomationStateBadge 244 LOC',
        'total_loc': '1424 LOC (557 + 264 + 603)'
      },
      'learning_system': {
        'feedback_mechanism': 'agree (+2 confidence), disagree (-5), modify (-1)',
        'automation_states': 'manual (<60%), assisted (60-85%), auto (>85%)',
        'pattern_types': ['consistent_agreement', 'consistent_disagreement'],
        'batch_processing': '≥10 feedback items triggers batch learning'
      },
      'database_tables': [
        'automation_rules (40 rows pre-seeded)',
        'automation_feedback',
        'automation_history',
        'automation_patterns',
        'automation_learning_queue'
      ],
      'implementation_plan': {
        'phase_1': 'Core control center (Weeks 1-2)',
        'phase_2': 'Feedback & learning (Week 3)',
        'phase_3': 'Pattern detection (Weeks 4-5)',
        'phase_4': 'Performance & history (Week 6)',
        'phase_5': 'Advanced features (Week 7)',
        'phase_6': 'Integration (Week 8)'
      },
      'business_value': 'HIGH - 40-60% manual work reduction, self-improving automation, chairman feedback learning',
      'prd_readiness': {
        'scope_clarity': '95%',
        'execution_readiness': '90%',
        'risk_coverage': '90%',
        'business_impact': '95%'
      }
    }
  };

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('id', 'SD-RECONNECT-013');

  if (error) {
    console.error('❌ Error updating SD-RECONNECT-013:', error);
    process.exit(1);
  }

  console.log('✅ SD-RECONNECT-013 updated successfully!\n');
  console.log('📊 Summary: 8-week automation control center implementation');
  console.log('  ✓ Build centralized control center at /automation-control');
  console.log('  ✓ Rules manager for 40 automation rules (view, edit, CRUD)');
  console.log('  ✓ Feedback interface with real-time confidence adjustments');
  console.log('  ✓ Pattern detection dashboard with automation opportunities');
  console.log('  ✓ Performance metrics & comprehensive audit trail\n');
  console.log('✨ SD-RECONNECT-013 enhancement complete!');
}

updateSDRECONNECT013();
