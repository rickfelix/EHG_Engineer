-- ============================================================================
-- STRATEGIC DIRECTIVES: SD-ARCH-EHG-007 & SD-ARCH-EHG-008
-- Remaining items from SD-ARCH-EHG-006 (EHG + EHG_Engineer Merge)
-- Created: 2025-12-21
-- ============================================================================

-- ============================================================================
-- SD-ARCH-EHG-007: Stage Components Migration
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
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-ARCH-EHG-007',
    'SD-ARCH-EHG-007',
    'Stage Components Migration - EHG_Engineer to EHG',
    'feature',
    'medium',
    'draft',
    '1.0',
    'feature',

    -- DESCRIPTION
    'Migrate 19 stage components from EHG_Engineer (JSX) to EHG (TypeScript + shadcn-ui) as part of the EHG + EHG_Engineer merge. These components provide stage-specific functionality for the 25-stage venture workflow.',

    -- RATIONALE
    'BUSINESS RATIONALE:
- Completes the EHG + EHG_Engineer merge initiated in SD-ARCH-EHG-006
- Stage components currently only accessible in EHG_Engineer admin app
- Unified application improves user experience and reduces maintenance burden

TECHNICAL RATIONALE:
- 19 JSX components need TypeScript conversion
- Components must use shadcn-ui instead of custom styling
- Follows established migration pattern from SD-ARCH-EHG-006 Phase 3',

    -- SCOPE
    'INCLUDED IN SCOPE:
1. PricingStrategy.jsx -> PricingStrategy.tsx
2. BusinessModelCanvas.jsx -> BusinessModelCanvas.tsx
3. ExitOrientedDesign.jsx -> ExitOrientedDesign.tsx
4. StrategicNaming.jsx -> StrategicNaming.tsx
5. GoToMarketStrategy.jsx -> GoToMarketStrategy.tsx
6. SalesSuccessLogic.jsx -> SalesSuccessLogic.tsx
7. TechStackInterrogation.jsx -> TechStackInterrogation.tsx
8. DataModelArchitecture.jsx -> DataModelArchitecture.tsx
9. EpicUserStoryBreakdown.jsx -> EpicUserStoryBreakdown.tsx
10. SpecDrivenSchemaGen.jsx -> SpecDrivenSchemaGen.tsx
11. EnvironmentAgentConfig.jsx -> EnvironmentAgentConfig.tsx
12. MVPDevelopmentLoop.jsx -> MVPDevelopmentLoop.tsx
13. IntegrationAPILayer.jsx -> IntegrationAPILayer.tsx
14. SecurityPerformance.jsx -> SecurityPerformance.tsx
15. QAandUAT.jsx -> QAandUAT.tsx
16. DeploymentInfrastructure.jsx -> DeploymentInfrastructure.tsx
17. ProductionLaunch.jsx -> ProductionLaunch.tsx
18. AnalyticsFeedback.jsx -> AnalyticsFeedback.tsx
19. OptimizationScale.jsx -> OptimizationScale.tsx

EXCLUDED FROM SCOPE:
- StageRouter.jsx (routing logic, not a stage component)
- New stage functionality (migration only)
- Backend API changes',

    -- STRATEGIC INTENT
    'Complete the unification of EHG and EHG_Engineer applications by migrating all stage-specific components, enabling full venture workflow functionality in the unified EHG application.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object('id', 'SC-001', 'criterion', 'All 19 stage components migrated to TypeScript', 'priority', 'CRITICAL'),
        jsonb_build_object('id', 'SC-002', 'criterion', 'Components use shadcn-ui primitives', 'priority', 'HIGH'),
        jsonb_build_object('id', 'SC-003', 'criterion', 'Build passes with 0 errors', 'priority', 'CRITICAL'),
        jsonb_build_object('id', 'SC-004', 'criterion', 'Stage components render correctly in venture workflow', 'priority', 'HIGH')
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object('risk', 'Large scope (19 components)', 'severity', 'medium', 'mitigation', 'Batch migration in groups of 5'),
        jsonb_build_object('risk', 'Component dependencies on EHG_Engineer services', 'severity', 'medium', 'mitigation', 'Map dependencies before migration')
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object('dependency', 'SD-ARCH-EHG-006 completed', 'status', 'ready'),
        jsonb_build_object('dependency', 'Admin infrastructure in place', 'status', 'ready')
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'components_migrated', '19/19',
        'typescript_coverage', '100%',
        'build_errors', 0
    ),

    -- METADATA
    jsonb_build_object(
        'estimated_effort_hours', 24,
        'complexity', 'MEDIUM',
        'source_path', './src/client/src/components/stages/',
        'target_path', '../ehg/src/components/stages/admin/',
        'parent_sd', 'SD-ARCH-EHG-006',
        'component_count', 19
    ),

    'EHG',
    'LEAD_APPROVAL',
    'LEAD'
);

-- ============================================================================
-- SD-ARCH-EHG-008: Admin Views Completion (PRDManager + VenturesManager)
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
    metadata,
    target_application,
    current_phase,
    created_by
) VALUES (
    'SD-ARCH-EHG-008',
    'SD-ARCH-EHG-008',
    'Admin Views Completion - PRDManager & VenturesManager',
    'feature',
    'medium',
    'draft',
    '1.0',
    'feature',

    -- DESCRIPTION
    'Complete the remaining admin views from the EHG + EHG_Engineer merge: PRDManager (standalone component) and VenturesManager (admin view). Currently PRDManager uses AdminDashboard as placeholder, and VenturesManager admin view does not exist.',

    -- RATIONALE
    'BUSINESS RATIONALE:
- PRD management is critical for LEO Protocol workflow
- Admin-level venture management provides oversight capabilities
- Completes the admin section functionality started in SD-ARCH-EHG-006

TECHNICAL RATIONALE:
- PRDManager route exists but lacks dedicated component
- VenturesManager admin view provides different functionality than user-facing ventures
- Follows established migration pattern from SD-ARCH-EHG-006',

    -- SCOPE
    'INCLUDED IN SCOPE:
1. PRDManager Component
   - Standalone PRD management interface
   - PRD list with filtering and sorting
   - PRD status management
   - Link to associated Strategic Directives

2. VenturesManager (Admin View)
   - Admin-level venture oversight
   - Venture status and progress tracking
   - Stage progression management
   - Different from user-facing /ventures route

EXCLUDED FROM SCOPE:
- New backend API endpoints (use existing)
- User-facing venture functionality
- PRD creation wizard (separate SD)',

    -- STRATEGIC INTENT
    'Complete the admin section of the unified EHG application with full PRD and Venture management capabilities for administrators.',

    -- SUCCESS CRITERIA
    jsonb_build_array(
        jsonb_build_object('id', 'SC-001', 'criterion', 'PRDManager component renders PRD list', 'priority', 'CRITICAL'),
        jsonb_build_object('id', 'SC-002', 'criterion', 'VenturesManager admin view accessible at /admin/ventures', 'priority', 'CRITICAL'),
        jsonb_build_object('id', 'SC-003', 'criterion', 'Both components use shadcn-ui', 'priority', 'HIGH'),
        jsonb_build_object('id', 'SC-004', 'criterion', 'Build passes with 0 errors', 'priority', 'CRITICAL')
    ),

    -- RISKS
    jsonb_build_array(
        jsonb_build_object('risk', 'API endpoint availability', 'severity', 'low', 'mitigation', 'Endpoints already exist in EHG_Engineer'),
        jsonb_build_object('risk', 'Confusion with user-facing ventures', 'severity', 'medium', 'mitigation', 'Clear naming and route separation')
    ),

    -- DEPENDENCIES
    jsonb_build_array(
        jsonb_build_object('dependency', 'SD-ARCH-EHG-006 completed', 'status', 'ready'),
        jsonb_build_object('dependency', 'Admin routes infrastructure', 'status', 'ready'),
        jsonb_build_object('dependency', 'adminApi.ts service', 'status', 'ready')
    ),

    -- SUCCESS METRICS
    jsonb_build_object(
        'components_created', 2,
        'routes_added', 2,
        'build_errors', 0
    ),

    -- METADATA
    jsonb_build_object(
        'estimated_effort_hours', 8,
        'complexity', 'LOW',
        'parent_sd', 'SD-ARCH-EHG-006',
        'routes', jsonb_build_array('/admin/prds', '/admin/ventures')
    ),

    'EHG',
    'LEAD_APPROVAL',
    'LEAD'
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT id, title, priority, status, current_phase
FROM strategic_directives_v2
WHERE id IN ('SD-ARCH-EHG-007', 'SD-ARCH-EHG-008');
