-- ============================================================================
-- STRATEGIC DIRECTIVE: SD-VENTURE-UNIFICATION-001
-- Title: Unified Venture Creation System with Intelligent Dependency-Driven Recursion
-- Priority: CRITICAL
-- Created: 2025-11-03
-- ============================================================================
-- Execute in Supabase SQL Editor OR via Node.js script
-- This follows LEO Protocol v4.2.0 database-first approach
-- ============================================================================
-- CORRECTED VERSION - Matches actual strategic_directives_v2 schema
-- Primary changes:
--   - Uses 'id' instead of 'key' (id is the PRIMARY KEY)
--   - Uses 'sd_key' (NOT NULL UNIQUE constraint)
--   - Maps SQL columns to actual table column names
--   - Adds required fields: category, sd_type
-- ============================================================================

INSERT INTO strategic_directives_v2 (
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    description,
    rationale,
    scope,
    strategic_intent,
    success_criteria,
    risks,
    dependencies,
    success_metrics,
    stakeholders,
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-VENTURE-UNIFICATION-001',
    'SD-VENTURE-UNIFICATION-001',
    'Unified Venture Creation System with Intelligent Dependency-Driven Recursion',
    'feature',  -- REQUIRED: category field
    'critical',  -- lowercase per CHECK constraint
    'draft',  -- Initial status
    '1.0',  -- Version
    'feature',  -- REQUIRED: sd_type field

    -- DESCRIPTION: Main body text
    'Unify two parallel venture creation systems (3-step wizard and 40-stage workflow) into a single seamless system where ALL ventures complete ALL 40 stages with intelligent dependency-driven recursion that automatically detects when downstream stages invalidate upstream decisions and routes back to fix root causes.',

    -- RATIONALE: Business case
    'BUSINESS RATIONALE:
- Prevents cascading failures by catching bad assumptions early
- Ensures "solid plans" for every venture (all 40 stages mandatory)
- Reduces Chairman manual oversight through automated quality gates
- Faster time to quality via smart backtracking vs starting over

TECHNICAL RATIONALE:
- Two parallel systems create data inconsistency (ventures vs ideas tables)
- No intelligent recursion leads to manual rework and lost progress
- 40-stage workflow unreachable by users (no route)
- Smart dependency detection reduces post-launch pivots by 20-30%',

    -- SCOPE
    'INCLUDED IN SCOPE:
1. Bridge wizard → workflow (auto-launch at Stage 4)
2. Database consolidation (ventures table only, deprecate ideas)
3. Smart recursion engine with 20-25 dependency scenarios
4. Threshold-based automation (CRITICAL auto-recurse, HIGH needs approval)
5. Loop prevention (max 2-3 recursions per stage)
6. All 40 stages mandatory for every venture (no tier-based limits)

EXCLUDED FROM SCOPE:
- Tier system enhancements (future iteration)
- AI depth per tier (future iteration)
- Recursion analytics dashboard (Phase 4, optional)
- Voice capture migration (Phase 2, optional)

SYSTEMS AFFECTED:
- VentureCreationPage.tsx (3-step wizard)
- CompleteWorkflowOrchestrator.tsx (40-stage workflow)
- All 40 stage components (Stage1-Stage40)
- ventures table schema (consolidation target)
- ideas table (migration/deprecation)
- workflow_executions table
- New: recursion_events table
- New: recursionEngine.ts service',

    -- STRATEGIC INTENT
    'STRATEGIC ALIGNMENT:
Transform venture creation from a fragmented process into a unified quality assurance system that automatically prevents poor decisions from cascading through the organization.

ORGANIZATIONAL IMPACT:
- Quality-first culture: Smart recursion embeds quality gates into workflow
- Data-driven improvement: Recursion patterns reveal common failure modes
- Autonomous quality control: Reduce Chairman bottleneck by 40%
- Scalable venture pipeline: Single system supports growth without manual oversight increase

COMPETITIVE ADVANTAGE:
- Faster time to quality ventures (8-12 hours for all 40 stages)
- Higher venture success rate (70%+ vs 55% baseline)
- Transparent quality process builds stakeholder confidence
- Preserved autonomy for creators while maintaining quality standards',

    -- SUCCESS CRITERIA (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'id', 'SC-001',
            'criterion', 'User completes 3-step wizard and is automatically redirected to Stage 4 of 40-stage workflow with zero manual intervention',
            'measure', 'E2E test verifies automatic transition, 100% of wizard completions launch workflow',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-002',
            'criterion', 'All 40 stages accessible regardless of tier assignment',
            'measure', 'Stage access validation confirms no stage limits enforced, tier check disabled',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-003',
            'criterion', 'Recursion triggers automatically when Stage 5 detects ROI < 15%',
            'measure', 'Unit test + E2E test for FIN-001 scenario, recursion event logged to database',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-004',
            'criterion', 'Stage 10 blocking technical issues trigger automatic recursion to Stage 8',
            'measure', 'Unit test + E2E test for TECH-001 scenario, recursion event logged',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-005',
            'criterion', '3 recursions on same stage escalate to Chairman with detailed history',
            'measure', 'Loop prevention test verifies escalation, Chairman notification sent',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-006',
            'criterion', 'Zero data loss during ideas → ventures migration',
            'measure', 'Migration script validation: row count match, JSON schema validation, spot checks',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-007',
            'criterion', 'Recursion detection completes in <100ms per stage',
            'measure', 'Performance test suite: 95th percentile latency <100ms under load',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-008',
            'criterion', 'All 20-25 recursion scenarios documented with triggers and thresholds',
            'measure', 'Documentation review: complete mapping table, all scenarios have E2E tests',
            'priority', 'HIGH'
        ),
        jsonb_build_object(
            'id', 'SC-009',
            'criterion', 'Existing ventures grandfathered without breaking changes',
            'measure', 'Backward compatibility test suite: pre-unification ventures function normally',
            'priority', 'CRITICAL'
        ),
        jsonb_build_object(
            'id', 'SC-010',
            'criterion', 'UI displays recursion history with trigger explanations',
            'measure', 'UI test verifies recursion timeline visible, explanations clear and actionable',
            'priority', 'HIGH'
        )
    ),

    -- RISKS (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'risk', 'Infinite recursion loops despite max recursion limits',
            'severity', 'medium',
            'probability', 'low',
            'mitigation', 'Max 3 recursions per stage with escalation, comprehensive unit tests, circuit breaker pattern',
            'owner', 'EXEC'
        ),
        jsonb_build_object(
            'risk', 'Data migration failures during ideas → ventures consolidation',
            'severity', 'high',
            'probability', 'medium',
            'mitigation', 'Soft-delete ideas table (keep 90 days), comprehensive rollback plan, dry-run migration test',
            'owner', 'DATABASE'
        ),
        jsonb_build_object(
            'risk', 'Performance degradation from recursion detection on every stage completion',
            'severity', 'low',
            'probability', 'low',
            'mitigation', 'Async detection with caching, query optimization, performance monitoring',
            'owner', 'EXEC'
        ),
        jsonb_build_object(
            'risk', 'Breaking changes to existing ventures in progress',
            'severity', 'high',
            'probability', 'medium',
            'mitigation', 'Grandfather old ventures, feature flag for new system, staged rollout',
            'owner', 'PLAN'
        ),
        jsonb_build_object(
            'risk', 'Recursion threshold tuning requires multiple iterations',
            'severity', 'medium',
            'probability', 'high',
            'mitigation', 'Start conservative (auto-approve CRITICAL only), data-driven adjustment, A/B testing',
            'owner', 'Chairman'
        ),
        jsonb_build_object(
            'risk', 'Chairman overwhelmed with HIGH threshold approval requests',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Auto-approve CRITICAL thresholds, batch approval UI, delegate to trusted advisors',
            'owner', 'Chairman'
        ),
        jsonb_build_object(
            'risk', '8-week timeline too aggressive for 40-stage integration',
            'severity', 'medium',
            'probability', 'medium',
            'mitigation', 'Phased delivery (MVP at 4 weeks), reuse Stage 1-10 patterns, parallel implementation tracks',
            'owner', 'PLAN'
        )
    ),

    -- DEPENDENCIES (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'dependency', 'Existing recursion loop system (recursionLoop.ts)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Available, needs extension for stage-level dependency detection'
        ),
        jsonb_build_object(
            'dependency', 'Validation framework (validationFramework.ts)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Available, reuse for trigger detection logic'
        ),
        jsonb_build_object(
            'dependency', 'EVA quality scoring (evaValidation.ts)',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Available, integrate with recursion thresholds'
        ),
        jsonb_build_object(
            'dependency', 'Ventures table schema updates',
            'type', 'technical',
            'status', 'required',
            'notes', 'Migration needed to consolidate ideas table data'
        ),
        jsonb_build_object(
            'dependency', 'Workflow execution tracking',
            'type', 'technical',
            'status', 'ready',
            'notes', 'Available, extend for stage-level recursion events'
        ),
        jsonb_build_object(
            'dependency', 'Chairman availability for HIGH threshold approvals',
            'type', 'external',
            'status', 'required',
            'notes', 'Human approval needed for <10% of recursion events'
        ),
        jsonb_build_object(
            'dependency', 'Database migration approval',
            'type', 'process',
            'status', 'required',
            'notes', 'Chairman sign-off required before ideas table deprecation'
        )
    ),

    -- SUCCESS METRICS (JSONB object with nested structure)
    jsonb_build_object(
        'implementation', jsonb_build_object(
            'target_completion', '8 weeks',
            'phase_1_delivery', '1 week (database + bridge)',
            'phase_2_delivery', '2 weeks (recursion engine)',
            'phase_3_delivery', '4 weeks (stage integration 1-10)',
            'phase_4_delivery', '1 week (stage integration 11-40 + testing)',
            'total_effort_hours', 144
        ),
        'quality', jsonb_build_object(
            'recursion_detection_latency_ms', 100,
            'data_migration_success_rate', '100%',
            'test_coverage_recursion_paths', '100%',
            'zero_data_loss', true,
            'backward_compatibility', '100%'
        ),
        'adoption', jsonb_build_object(
            'avg_recursions_per_venture', '2-4',
            'chairman_escalation_rate', '<10%',
            'venture_completion_rate_all_40_stages', '>95%',
            'user_satisfaction_recursion_ux', '>8/10',
            'wizard_to_workflow_transition_success', '100%'
        ),
        'business', jsonb_build_object(
            'quality_improvement_post_launch', '20-30% reduction in pivots',
            'time_to_quality_venture', '8-12 hours (all 40 stages)',
            'chairman_oversight_reduction', '40% fewer manual reviews',
            'venture_success_rate_12mo', '>70% (baseline: 55%)',
            'roi', 'Positive within 6 months via reduced rework'
        )
    ),

    -- STAKEHOLDERS (JSONB array)
    jsonb_build_array(
        jsonb_build_object(
            'name', 'Chairman',
            'role', 'Executive Sponsor & Approver',
            'involvement', 'HIGH threshold recursion approvals, final sign-off',
            'contact', 'Primary stakeholder'
        ),
        jsonb_build_object(
            'name', 'LEAD Agent',
            'role', 'Business Value Validator',
            'involvement', 'Strategic alignment verification, outcome validation',
            'contact', 'LEO Protocol agent'
        ),
        jsonb_build_object(
            'name', 'PLAN Agent',
            'role', 'Technical Feasibility Validator',
            'involvement', 'PRD creation, architecture review, test planning',
            'contact', 'LEO Protocol agent'
        ),
        jsonb_build_object(
            'name', 'EXEC Agent',
            'role', 'Implementation Lead',
            'involvement', 'Code implementation, recursion engine development, testing',
            'contact', 'LEO Protocol agent'
        ),
        jsonb_build_object(
            'name', 'DATABASE Sub-Agent',
            'role', 'Schema Migration Specialist',
            'involvement', 'ideas → ventures migration, recursion_events table design',
            'contact', 'LEO Protocol sub-agent'
        ),
        jsonb_build_object(
            'name', 'QA Sub-Agent',
            'role', 'Quality Assurance',
            'involvement', 'E2E test suite for recursion paths, performance testing',
            'contact', 'LEO Protocol sub-agent'
        ),
        jsonb_build_object(
            'name', 'Venture Creators',
            'role', 'End Users',
            'involvement', 'Experience unified workflow, provide feedback on recursion UX',
            'contact', 'EHG application users'
        )
    ),

    -- METADATA (JSONB object for additional custom fields)
    jsonb_build_object(
        'estimated_effort_hours', 144,
        'complexity', 'HIGH',
        'impact_scope', 'Venture creation workflow, database architecture, user experience',
        'breaking_changes', false,
        'requires_migration', true,
        'migration_type', 'ideas_table_to_ventures_metadata',
        'phased_delivery', true,
        'mvp_at_week', 4,
        'deferred_features', jsonb_build_array(
            'Tier system enhancements',
            'AI depth per tier',
            'Recursion analytics dashboard',
            'Voice capture migration'
        ),
        'acceptance_criteria_count', 12,
        'recursion_scenarios_count', '20-25',
        'stages_affected', 40,
        'new_tables', jsonb_build_array('recursion_events'),
        'deprecated_tables', jsonb_build_array('ideas'),
        'new_services', jsonb_build_array('recursionEngine.ts'),
        'performance_requirements', jsonb_build_object(
            'recursion_detection_latency', '100ms',
            'stage_completion_time', '8-12 hours for all 40 stages'
        )
    ),

    -- TARGET APPLICATION
    'EHG',  -- Customer-facing application

    -- CURRENT PHASE (starts at LEAD_APPROVAL)
    'LEAD_APPROVAL',

    -- CREATED BY
    'human:Chairman'
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify insertion
SELECT
    id,
    sd_key,
    title,
    category,
    priority,
    status,
    version,
    sd_type,
    target_application,
    current_phase,
    created_at,
    created_by
FROM strategic_directives_v2
WHERE id = 'SD-VENTURE-UNIFICATION-001';

-- Check success criteria (should have 10 items)
SELECT
    id,
    jsonb_array_length(success_criteria) as success_criteria_count
FROM strategic_directives_v2
WHERE id = 'SD-VENTURE-UNIFICATION-001';

-- Check risks (should have 7 items)
SELECT
    id,
    jsonb_array_length(risks) as risks_count
FROM strategic_directives_v2
WHERE id = 'SD-VENTURE-UNIFICATION-001';

-- Check dependencies (should have 7 items)
SELECT
    id,
    jsonb_array_length(dependencies) as dependencies_count
FROM strategic_directives_v2
WHERE id = 'SD-VENTURE-UNIFICATION-001';

-- Check stakeholders (should have 7 items)
SELECT
    id,
    jsonb_array_length(stakeholders) as stakeholders_count
FROM strategic_directives_v2
WHERE id = 'SD-VENTURE-UNIFICATION-001';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Strategic Directive SD-VENTURE-UNIFICATION-001 created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Schema Mapping Corrections Applied:';
  RAISE NOTICE '  - key → id (PRIMARY KEY)';
  RAISE NOTICE '  - Added sd_key (UNIQUE, same as id)';
  RAISE NOTICE '  - Added category (REQUIRED)';
  RAISE NOTICE '  - Added sd_type (REQUIRED)';
  RAISE NOTICE '  - outcomes → success_criteria (JSONB array)';
  RAISE NOTICE '  - kpis → success_metrics (JSONB object)';
  RAISE NOTICE '  - tags → removed (not in v2 schema)';
  RAISE NOTICE '  - target_release → removed (not in v2 schema)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps (LEO Protocol):';
  RAISE NOTICE '1. LEAD Agent: Review and approve directive';
  RAISE NOTICE '   UPDATE strategic_directives_v2 SET status = ''active'' WHERE id = ''SD-VENTURE-UNIFICATION-001'';';
  RAISE NOTICE '2. PLAN Agent: Create PRD with 5 epic execution sequences';
  RAISE NOTICE '3. Generate user stories from acceptance criteria';
  RAISE NOTICE '4. DATABASE Sub-Agent: Design recursion_events table schema';
  RAISE NOTICE '5. EXEC Agent: Implement Phase 1 (database + bridge)';
  RAISE NOTICE '';
  RAISE NOTICE 'View in dashboard: /strategic-directives/SD-VENTURE-UNIFICATION-001';
END $$;
