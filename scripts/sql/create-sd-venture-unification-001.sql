-- ============================================================================
-- STRATEGIC DIRECTIVE: SD-VENTURE-UNIFICATION-001
-- Title: Unified Venture Creation System with Intelligent Dependency-Driven Recursion
-- Priority: CRITICAL
-- Created: 2025-11-03
-- ============================================================================
-- Execute in Supabase SQL Editor
-- This follows LEO Protocol v4.2.0 database-first approach
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    key,
    title,
    owner,
    priority,
    status,
    scope,
    outcomes,
    risks,
    dependencies,
    acceptance_criteria,
    kpis,
    tags,
    target_release
) VALUES (
    'SD-VENTURE-UNIFICATION-001',
    'Unified Venture Creation System with Intelligent Dependency-Driven Recursion',
    'Chairman',
    'CRITICAL',
    'Proposed',

    -- SCOPE
    'Unify two parallel venture creation systems (3-step wizard and 40-stage workflow) into a single seamless system where ALL ventures complete ALL 40 stages with intelligent dependency-driven recursion that automatically detects when downstream stages invalidate upstream decisions and routes back to fix root causes.

CURRENT STATE:
- 3-Step Wizard (VentureCreationPage.tsx) - Modern, uses `ventures` table
- 40-Stage Workflow (CompleteWorkflowOrchestrator.tsx) - Comprehensive, uses `ideas` table
- NO INTEGRATION - Completely separate systems
- NO RECURSION - No smart backtracking when issues discovered
- 40-stage workflow has NO ROUTE - Users cannot access it

PROPOSED ARCHITECTURE:
1. Wizard → Workflow Bridge: 3-step wizard auto-launches into 40-stage workflow at Stage 4
2. Database Consolidation: Use `ventures` table exclusively (deprecate `ideas`)
3. Smart Recursion Engine: Dependency-driven routing back to invalidated stages
4. Threshold-Based Automation: CRITICAL issues trigger auto-recursion, HIGH issues require Chairman approval
5. Loop Prevention: Max 2-3 recursions per stage with escalation to Chairman

SYSTEMS AFFECTED:
- VentureCreationPage.tsx (3-step wizard)
- CompleteWorkflowOrchestrator.tsx (40-stage workflow)
- All 40 stage components (Stage1-Stage40)
- ventures table schema
- ideas table (migration/deprecation)
- workflow_executions table
- New: recursion_events table
- New: recursionEngine.ts service',

    -- OUTCOMES
    'TECHNICAL OUTCOMES:
1. Single unified venture creation system (wizard → 40 stages)
2. 100% of ventures complete all 40 stages (no tier-based stage limits)
3. Smart recursion engine operational with 20-25 dependency scenarios
4. Database consolidation complete (ventures table only)
5. Zero data loss (ideas table migrated to ventures.metadata)

BUSINESS OUTCOMES:
1. Prevents cascading failures (bad assumptions caught early via recursion)
2. Ensures "solid plans" for every venture (all 40 stages mandatory)
3. Reduces Chairman manual oversight (automated quality gates)
4. Data-driven quality improvement (recursion triggers track common failure patterns)
5. Faster time to quality (smart backtracking vs starting over)

USER EXPERIENCE OUTCOMES:
1. Seamless wizard → workflow transition (auto-launch, no manual intervention)
2. Intelligent feedback loops (system explains why recursion triggered)
3. Preserved autonomy (Chairman approves HIGH threshold recursions)
4. Progress preservation (recursion doesn''t lose work, just revises specific stages)
5. Transparent quality process (recursion history visible in UI)

PERFORMANCE METRICS:
- Recursion detection: <100ms per stage completion
- Average recursions per venture: 2-4 (target)
- Chairman escalation rate: <10% of ventures
- Stage completion time: 8-12 hours for all 40 stages (Tier 2 equivalent)
- Quality improvement: 20-30% fewer post-launch pivots',

    -- RISKS
    'TECHNICAL RISKS:
1. **Infinite Recursion Loops** (MEDIUM) - Mitigation: Max 3 recursions per stage, escalation
2. **Data Migration Failures** (HIGH) - Mitigation: Soft-delete ideas table, rollback plan
3. **Performance Degradation** (LOW) - Mitigation: Async recursion detection, caching
4. **Breaking Changes to Existing Ventures** (HIGH) - Mitigation: Grandfather old ventures
5. **Recursion Threshold Tuning** (MEDIUM) - Mitigation: Start conservative, adjust based on data

ADOPTION RISKS:
1. **Chairman Overwhelm with Approval Requests** (MEDIUM) - Mitigation: Auto-approve CRITICAL thresholds
2. **User Confusion about Recursion** (LOW) - Mitigation: Clear UI messaging, tooltips
3. **Resistance to 40-Stage Mandate** (MEDIUM) - Mitigation: Emphasize quality benefits, provide templates

TIMELINE RISKS:
1. **8-Week Estimate Too Aggressive** (MEDIUM) - Mitigation: Phased delivery, MVP at 4 weeks
2. **Stage 11-40 Analysis Underestimated** (LOW) - Mitigation: Reuse Stage 1-10 patterns
3. **Testing Complexity** (MEDIUM) - Mitigation: Automated E2E tests for recursion paths

OPERATIONAL RISKS:
1. **Ideas Table Deprecation Premature** (LOW) - Mitigation: Soft-delete, keep for 90 days
2. **Lost Productivity During Migration** (LOW) - Mitigation: Zero-downtime deployment
3. **Rollback Complexity** (MEDIUM) - Mitigation: Feature flags, database backups',

    -- DEPENDENCIES
    'TECHNICAL DEPENDENCIES:
1. Existing recursion loop system (recursionLoop.ts) - AVAILABLE, needs extension
2. Validation framework (validationFramework.ts) - AVAILABLE, reuse for trigger detection
3. EVA quality scoring (evaValidation.ts) - AVAILABLE, integrate with thresholds
4. Ventures table schema updates - REQUIRED, migration needed
5. Workflow execution tracking - AVAILABLE, extend for stage-level recursion

EXTERNAL DEPENDENCIES:
1. Supabase database - AVAILABLE (production instance)
2. 40 stage components - EXIST but need recursion integration
3. Chairman availability for HIGH threshold approvals - REQUIRED
4. No external API dependencies - All internal logic

PROCESS DEPENDENCIES:
1. Database migration approval - Chairman sign-off required
2. Testing strategy - E2E test suite for recursion paths
3. Documentation - User guide for recursion system
4. Rollback plan - Must be documented before Phase 1

DEFERRED ITEMS (Not Dependencies):
- Tier system enhancements (future iteration)
- AI depth per tier (future iteration)
- Recursion analytics dashboard (Phase 4, optional)
- Voice capture migration (Phase 2, optional)',

    -- ACCEPTANCE CRITERIA
    jsonb_build_array(
        jsonb_build_object(
            'id', 'AC-001',
            'criteria', 'User completes 3-step wizard and is automatically redirected to Stage 4 of 40-stage workflow with zero manual intervention',
            'type', 'functional',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-002',
            'criteria', 'All 40 stages are accessible regardless of tier assignment (no stage limits enforced)',
            'type', 'functional',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-003',
            'criteria', 'When Stage 5 detects ROI < 15%, system automatically routes back to Stage 3 with clear explanation',
            'type', 'functional',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-004',
            'criteria', 'When Stage 10 finds blocking technical issues, system automatically routes back to Stage 8',
            'type', 'functional',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-005',
            'criteria', 'Recursion triggered 3x on same stage escalates to Chairman with detailed history',
            'type', 'functional',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'AC-006',
            'criteria', 'All data from ideas table successfully migrated to ventures.metadata with zero data loss',
            'type', 'data',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-007',
            'criteria', 'Existing ventures created before unification continue to function normally (grandfathered)',
            'type', 'backward_compatibility',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-008',
            'criteria', 'Recursion detection completes in <100ms per stage to avoid UI lag',
            'type', 'performance',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'AC-009',
            'criteria', 'All 20-25 recursion scenarios documented with clear triggers and thresholds',
            'type', 'documentation',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'AC-010',
            'criteria', 'E2E tests cover all CRITICAL recursion paths (FIN-001, TECH-001, MKT-002, RISK-001)',
            'type', 'testing',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'AC-011',
            'criteria', 'UI displays recursion history for each venture showing what triggered each recursion',
            'type', 'ux',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'AC-012',
            'criteria', 'Chairman can override HIGH threshold recursion recommendations',
            'type', 'functional',
            'priority', 'MEDIUM'
        )
    ),

    -- KPIs
    jsonb_build_object(
        'implementation', jsonb_build_object(
            'target_completion', '8 weeks',
            'phase_1_delivery', '1 week (database + bridge)',
            'phase_2_delivery', '2 weeks (recursion engine)',
            'phase_3_delivery', '4 weeks (stage integration 1-10)',
            'total_effort_hours', 144
        ),
        'quality', jsonb_build_object(
            'recursion_detection_latency_ms', 100,
            'data_migration_success_rate', '100%',
            'test_coverage_recursion_paths', '100%',
            'zero_data_loss', true
        ),
        'adoption', jsonb_build_object(
            'avg_recursions_per_venture', '2-4',
            'chairman_escalation_rate', '<10%',
            'venture_completion_rate_all_40_stages', '>95%',
            'user_satisfaction_recursion_ux', '>8/10'
        ),
        'business', jsonb_build_object(
            'quality_improvement_post_launch', '20-30% reduction in pivots',
            'time_to_quality_venture', '8-12 hours (all 40 stages)',
            'chairman_oversight_reduction', '40% fewer manual reviews',
            'venture_success_rate_12mo', '>70% (baseline: 55%)'
        )
    ),

    -- TAGS
    ARRAY['venture-workflow', 'recursion', 'architectural-change', 'database-consolidation', 'quality-automation', 'critical-priority'],

    -- TARGET RELEASE
    '2025-Q1'
);

-- Verify insertion
SELECT
    key,
    title,
    priority,
    status,
    owner,
    target_release,
    created_at
FROM strategic_directives_v2
WHERE key = 'SD-VENTURE-UNIFICATION-001';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Strategic Directive SD-VENTURE-UNIFICATION-001 created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps (LEO Protocol):';
  RAISE NOTICE '1. Create Epic Execution Sequences (EES) for 5 implementation phases';
  RAISE NOTICE '2. Create PRD documents for each epic';
  RAISE NOTICE '3. Generate user stories from acceptance criteria';
  RAISE NOTICE '4. Update status to "Active" when Chairman approves:';
  RAISE NOTICE '   UPDATE strategic_directives_v2 SET status = ''Active'' WHERE key = ''SD-VENTURE-UNIFICATION-001'';';
  RAISE NOTICE '';
  RAISE NOTICE 'View in dashboard: /strategic-directives/SD-VENTURE-UNIFICATION-001';
END $$;
