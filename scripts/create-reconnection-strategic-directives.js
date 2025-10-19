#!/usr/bin/env node

/**
 * Create Feature Reconnection Strategic Directives
 * Based on comprehensive audit findings of disconnected features
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const strategicDirectives = [
  {
    id: 'SD-RECONNECT-001',
    sd_key: 'SD-RECONNECT-001',
    title: 'Core Platform Feature Audit & Remediation',
    version: '1.0',
    status: 'draft',
    category: 'platform_enhancement',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Systematic assessment and reconnection of 9 major feature platforms that are fully built but completely disconnected from the UI. Estimated $500K-$1M in development investment currently hidden from users.',
    strategic_intent: 'Unlock hidden platform capabilities and increase user access from <20% to 95%+ of available features. Address critical business value gap where major platforms (AI CEO Agent, Competitive Intelligence, GTM Strategist, etc.) are production-ready but inaccessible.',
    rationale: 'Comprehensive audit revealed 9 complete feature platforms with no routes or navigation: AI CEO Agent, Competitive Intelligence, Creative Media Automation, GTM Strategist, Feedback Loops, Gap Analysis, Quality Assurance, Strategic Naming, and Mobile Companion App. Each platform represents significant development investment and business value.',
    scope: 'Assessment, route creation, navigation integration, and validation for all disconnected feature platforms. Focus on business value prioritization and systematic reconnection.',
    strategic_objectives: [
      'Assess business value and user impact of each disconnected platform',
      'Prioritize features based on strategic business alignment',
      'Create routes and navigation entries for all platforms',
      'Validate functionality and user experience',
      'Document feature capabilities for user onboarding'
    ],
    success_criteria: [
      'All 9 major platforms accessible via navigation menu',
      'Routes created and tested for each platform',
      'User documentation created for each feature',
      'Navigation UI updated with proper categorization',
      'Zero console errors on feature access',
      'Platform accessibility increased to >90%'
    ],
    key_changes: [
      'Add 9 routes to App.tsx routing configuration',
      'Update Navigation component with new menu items',
      'Create feature discovery mechanism',
      'Build comprehensive feature catalog',
      'Validate all platform functionality',
      'Create user guides and documentation'
    ],
    key_principles: [
      'Business value drives prioritization',
      'Systematic assessment before remediation',
      'Quality validation at each step',
      'User experience is paramount',
      'Document everything for transparency'
    ],
    metadata: {
      audit_date: '2025-10-02',
      disconnected_platforms: 9,
      estimated_dev_value: '$500K-$1M',
      current_user_access: '<20%',
      target_user_access: '>95%',
      platforms: [
        { name: 'AI CEO Agent', path: '/ai-ceo', impact: 'CRITICAL', status: 'Executive Intelligence Platform' },
        { name: 'Competitive Intelligence', path: '/competitive-intelligence', impact: 'CRITICAL', status: 'Market Analysis Platform' },
        { name: 'Creative Media Automation', path: '/creative-media', impact: 'HIGH', status: 'Content Generation Platform' },
        { name: 'GTM Strategist', path: '/gtm-strategist', impact: 'CRITICAL', status: 'Go-to-Market Platform' },
        { name: 'Feedback Loops System', path: '/feedback-loops', impact: 'HIGH', status: 'Customer Feedback Platform' },
        { name: 'Gap Analysis System', path: '/gap-analysis', impact: 'HIGH', status: 'Strategic Planning Tool' },
        { name: 'Quality Assurance Platform', path: '/quality-assurance', impact: 'HIGH', status: 'Testing Automation' },
        { name: 'Strategic Naming System', path: '/naming', impact: 'MEDIUM', status: 'Development Standards' },
        { name: 'Mobile Companion App', path: '/mobile-companion', impact: 'HIGH', status: 'Wearable Integration' }
      ]
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-002',
    sd_key: 'SD-RECONNECT-002',
    title: 'Venture Creation Workflow Integration',
    version: '1.0',
    status: 'draft',
    category: 'core_functionality',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Fix critical disconnect in venture creation flow where stub dialog is shown instead of full-featured VentureCreationDialog with voice capture, EVA validation, and 40-stage workflow integration.',
    strategic_intent: 'Enable users to access sophisticated venture creation capabilities including voice-to-text, AI validation, strategic context capture, and automatic workflow initiation. Currently users see placeholder instead of production-ready feature.',
    rationale: 'VenturesPage.tsx imports VentureCreateDialog (stub with "will be implemented" message) instead of VentureCreationDialog (complete implementation with voice capture, EVA validation, workflow orchestration). This represents a critical UX failure where the entry point to the core 40-stage workflow is broken.',
    scope: 'Assessment of VentureCreationDialog capabilities, replacement of stub component, integration with CompleteWorkflowOrchestrator, Stage 1 scaffolding validation, and end-to-end testing.',
    strategic_objectives: [
      'Replace VentureCreateDialog stub with VentureCreationDialog',
      'Validate voice capture and transcription functionality',
      'Ensure EVA validation integration works correctly',
      'Connect to CompleteWorkflowOrchestrator for 40-stage workflow',
      'Verify Stage 1 scaffolding creates proper data structures',
      'Test end-to-end venture creation to Stage 2 progression'
    ],
    success_criteria: [
      'VentureCreationDialog accessible from "New Venture" button',
      'Voice-to-text transcription functional for title and description',
      'EVA validation provides real-time feedback',
      'Venture creation initializes 40-stage workflow',
      'Stage 1 scaffold matches PRD specifications',
      'User redirected to venture detail with success banner',
      'Zero regressions in existing functionality'
    ],
    key_changes: [
      'Update import in VenturesPage.tsx from VentureCreateDialog to VentureCreationDialog',
      'Align dialog props (open/onOpenChange to open/onClose/onSuccess)',
      'Wire onCreate handler to start workflow execution',
      'Validate Stage 1 scaffolding logic',
      'Test voice capture integration',
      'Verify database persistence (ideas table)',
      'Add error handling and user feedback'
    ],
    key_principles: [
      'Preserve all existing voice capture functionality',
      'Maintain EVA validation integration',
      'Ensure workflow orchestration connects properly',
      'Follow PRD specifications for Stage 1',
      'Comprehensive testing before deployment'
    ],
    metadata: {
      current_implementation: 'VentureCreateDialog (stub)',
      target_implementation: 'VentureCreationDialog (full)',
      features_hidden: ['Voice capture', 'EVA validation', 'Strategic context', '40-stage workflow'],
      database_tables: ['ideas', 'ventures', 'workflow_executions'],
      prd_reference: '03-New-Venture-PRD.md',
      components_affected: ['VenturesPage.tsx', 'VentureCreateDialog.tsx', 'VentureCreationDialog.tsx']
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-003',
    sd_key: 'SD-RECONNECT-003',
    title: 'Stage Component Accessibility Audit',
    version: '1.0',
    status: 'draft',
    category: 'workflow_infrastructure',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Comprehensive audit of all 63 stage components to determine proper accessibility patterns - which stages need standalone pages vs workflow-only access, and identify components without any entry points.',
    strategic_intent: 'Ensure all 40+ stages in the workflow system are properly accessible through appropriate UI patterns. Determine architectural strategy for stage access (embedded orchestrator vs standalone pages) and eliminate orphaned stage components.',
    rationale: 'Application has 63 stage components in /src/components/stages/ but accessibility is unclear. Some stages (16, 17, 34, 35, 36, 52) have page references, but most may be orphaned. Need systematic analysis to design proper stage navigation and access patterns.',
    scope: 'Analysis of all stage components, import reference mapping, architectural design for stage access patterns, creation of necessary pages/routes, and validation of workflow orchestration.',
    strategic_objectives: [
      'Map all 63 stage components and their current usage',
      'Identify stages with no access points (orphaned)',
      'Design stage access architecture (embedded vs standalone)',
      'Determine which stages need dedicated pages',
      'Create missing pages for high-value standalone stages',
      'Validate CompleteWorkflowOrchestrator integration'
    ],
    success_criteria: [
      'Complete inventory of all 63 stage components',
      'Clear architectural pattern for stage access defined',
      'All critical stages accessible through UI',
      'Workflow orchestrator properly integrates all stages',
      'No orphaned stage components remain',
      'Stage navigation is intuitive and documented'
    ],
    key_changes: [
      'Audit all stage component files for imports and usage',
      'Map stage references in pages and orchestrator',
      'Design stage access pattern specification',
      'Create standalone pages where appropriate',
      'Update CompleteWorkflowOrchestrator if needed',
      'Document stage access architecture'
    ],
    key_principles: [
      'Embedded orchestration for sequential workflow stages',
      'Standalone pages only for stages needing direct access',
      'Maintain workflow integrity and progression logic',
      'Clear separation between workflow and standalone access',
      'Comprehensive documentation of access patterns'
    ],
    metadata: {
      total_stage_components: 63,
      referenced_stages: [16, 17, 34, 35, 36, 52],
      potentially_orphaned: 57,
      orchestrator: 'CompleteWorkflowOrchestrator.tsx',
      database_tables: ['stage_configurations', 'stage_executions', 'workflow_executions'],
      architectural_decision_needed: true
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-004',
    sd_key: 'SD-RECONNECT-004',
    title: 'Database-UI Integration Assessment',
    version: '1.0',
    status: 'draft',
    category: 'data_architecture',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Systematic audit of 200+ database tables to identify high-value tables without UI coverage, categorize by business criticality, and create remediation plan for priority gaps.',
    strategic_intent: 'Maximize business value from database infrastructure by ensuring all critical tables have appropriate UI layers. Identify tables that are business-critical vs internal-only vs deprecated, and prioritize UI development accordingly.',
    rationale: 'Application has 200+ database tables but many sophisticated tables lack UI: Access & Security (incidents, threats, reviews), Analytics (churn prediction, behavioral profiles), Exit Strategy (opportunities, readiness), Pricing & Financial, Deployment & DevOps, Chairman Overrides, and Collaboration systems.',
    scope: 'Complete database table inventory, categorization by business criticality, gap analysis identifying tables without UI, impact prioritization, and phased remediation plan.',
    strategic_objectives: [
      'Create comprehensive database table inventory',
      'Categorize tables: business-critical vs internal vs deprecated',
      'Identify high-value tables without UI coverage',
      'Prioritize gaps by business impact and user value',
      'Design UI components for top priority tables',
      'Create phased implementation roadmap'
    ],
    success_criteria: [
      'Complete catalog of all 200+ database tables',
      'Clear categorization: critical/internal/deprecated',
      'Top 20 high-value tables identified',
      'UI designs created for priority tables',
      'Implementation roadmap with phases defined',
      'At least 10 high-value tables have UI by completion'
    ],
    key_changes: [
      'Audit all database tables and their purposes',
      'Map existing UI coverage for each table',
      'Categorize by business criticality',
      'Create gap analysis report',
      'Design UI components for priority tables',
      'Implement top priority UIs',
      'Document table-to-UI mapping'
    ],
    key_principles: [
      'Business value drives UI prioritization',
      'Some tables are intentionally backend-only',
      'Deprecated tables should be marked, not built',
      'Chairman override systems need special attention',
      'Security and access management are high priority'
    ],
    metadata: {
      total_tables: '200+',
      high_priority_categories: [
        'Access & Security (incidents, threats, reviews)',
        'Analytics (churn prediction, behavioral profiles, pattern recognition)',
        'Exit Strategy (opportunities, readiness, improvements)',
        'Pricing & Financial (strategies, competitive analysis, forecasts)',
        'Deployment & DevOps (environments, events, rollbacks)',
        'Chairman Overrides (adaptive guidance, brand, development, pricing, technical)',
        'Collaboration (messages, threads, participants, reactions)'
      ],
      estimated_ui_gap: '60-80% of tables lack UI',
      priority_tables_count: 20
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-005',
    sd_key: 'SD-RECONNECT-005',
    title: 'Component Directory Consolidation',
    version: '1.0',
    status: 'draft',
    category: 'code_quality',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Resolve duplicate and conflicting component implementations (VentureCreateDialog vs VentureCreationDialog, venture/ vs ventures/ directories) to eliminate confusion and maintain single source of truth.',
    strategic_intent: 'Improve codebase maintainability by eliminating duplicate implementations, consolidating inconsistent directory structures, and establishing clear canonical versions for all components.',
    rationale: 'Multiple duplicate implementations create maintenance burden and confusion: VentureCreateDialog (stub) vs VentureCreationDialog (full), venture/ directory (2 files) vs ventures/ directory (24 files). Need systematic consolidation to prevent future conflicts.',
    scope: 'Audit all component directories for duplicates, determine canonical versions, migrate references, remove deprecated components, and establish naming standards.',
    strategic_objectives: [
      'Identify all duplicate component implementations',
      'Determine canonical version for each duplicate',
      'Update all references to use canonical versions',
      'Remove deprecated duplicate components',
      'Consolidate inconsistent directory structures',
      'Establish component naming and organization standards'
    ],
    success_criteria: [
      'Zero duplicate component implementations remain',
      'All references updated to canonical versions',
      'Deprecated components removed from codebase',
      'Directory structure is consistent and logical',
      'Naming standards documented and enforced',
      'Zero regressions from consolidation'
    ],
    key_changes: [
      'Audit for duplicate patterns beyond known cases',
      'Merge VentureCreateDialog into VentureCreationDialog',
      'Consolidate venture/ into ventures/ directory',
      'Update all import paths',
      'Remove deprecated files',
      'Document component organization standards',
      'Add linting rules to prevent future duplicates'
    ],
    key_principles: [
      'Most complete implementation is canonical',
      'Consistent naming conventions across codebase',
      'Logical directory organization by feature',
      'Preserve all functionality during consolidation',
      'Comprehensive testing after changes'
    ],
    metadata: {
      known_duplicates: [
        { files: ['VentureCreateDialog.tsx', 'VentureCreationDialog.tsx'], canonical: 'VentureCreationDialog.tsx' },
        { directories: ['venture/', 'ventures/'], canonical: 'ventures/' }
      ],
      affected_imports: 'TBD during audit',
      refactoring_risk: 'MEDIUM'
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-006',
    sd_key: 'SD-RECONNECT-006',
    title: 'Navigation & Discoverability Enhancement',
    version: '1.0',
    status: 'draft',
    category: 'user_experience',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Enhance navigation system to expose all available features through updated navigation menu, feature discovery mechanisms, comprehensive feature catalog, and contextual navigation improvements.',
    strategic_intent: 'Dramatically improve feature discoverability and user experience by ensuring all platform capabilities are easily accessible through intuitive navigation. Transform hidden platform into fully discoverable system.',
    rationale: 'Current navigation menu shows only 15 items while platform has 40+ pages and features. Users cannot discover major capabilities like AI CEO Agent, Competitive Intelligence, GTM Strategist, etc. Need comprehensive navigation overhaul.',
    scope: 'Navigation menu redesign, feature categorization and grouping, feature catalog creation, contextual navigation implementation, and user onboarding flow.',
    strategic_objectives: [
      'Update navigation menu with all available features',
      'Design intuitive feature categorization and grouping',
      'Create comprehensive in-app feature catalog',
      'Implement contextual navigation based on user role/context',
      'Build feature discovery mechanism for new users',
      'Add search functionality across all features'
    ],
    success_criteria: [
      'All major features accessible via navigation menu',
      'Features logically grouped and categorized',
      'Feature catalog shows all capabilities with descriptions',
      'New users can discover features through onboarding',
      'Search finds features by name, category, or capability',
      'Navigation supports role-based feature visibility',
      'User feedback shows improved feature discovery'
    ],
    key_changes: [
      'Redesign Navigation component with expanded menu',
      'Create feature categorization taxonomy',
      'Build feature catalog page/component',
      'Add feature search functionality',
      'Implement onboarding flow for feature discovery',
      'Add contextual navigation based on user workflow',
      'Create documentation links for each feature'
    ],
    key_principles: [
      'Discoverability is paramount',
      'Logical grouping reduces cognitive load',
      'Search as primary discovery mechanism',
      'Progressive disclosure for complex features',
      'Context-aware navigation improves UX'
    ],
    metadata: {
      current_nav_items: 15,
      total_features_available: '40+',
      missing_from_nav: [
        'AI CEO Agent', 'Competitive Intelligence', 'Creative Media Automation',
        'GTM Strategist', 'Feedback Loops', 'Gap Analysis', 'Quality Assurance',
        'Strategic Naming', 'Mobile Companion', 'Knowledge Management',
        'Parallel Exploration', 'Business Agents'
      ],
      ux_priority: 'CRITICAL'
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-007',
    sd_key: 'SD-RECONNECT-007',
    title: 'Component Library Integration Assessment',
    version: '1.0',
    status: 'draft',
    category: 'feature_integration',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Assess disconnected component directories (Parallel Exploration, Business Agents, Knowledge Management, Opportunity Sourcing) and create appropriate integration strategy with pages, routes, and navigation.',
    strategic_intent: 'Unlock value from sophisticated component libraries that are built but disconnected. Determine best integration approach for each library and create seamless user access.',
    rationale: 'Multiple component directories contain sophisticated functionality but lack pages or routes: Parallel Exploration System (branch management, experimentation), Business Agents (performance monitoring), Knowledge Management (dashboard), Opportunity Sourcing (market discovery).',
    scope: 'Component analysis for each directory, functionality review, integration pattern design, page creation, route configuration, and validation.',
    strategic_objectives: [
      'Analyze all disconnected component directories',
      'Review functionality and business value',
      'Design integration approach for each library',
      'Create standalone pages where appropriate',
      'Configure routes and navigation entries',
      'Validate end-to-end functionality'
    ],
    success_criteria: [
      'All component libraries analyzed for integration',
      'Clear integration strategy defined for each',
      'Pages created for high-value standalone features',
      'Routes configured and accessible',
      'Navigation updated with new features',
      'All integrations tested and validated'
    ],
    key_changes: [
      'Review Parallel Exploration System components',
      'Analyze Business Agents components',
      'Assess Knowledge Management dashboard',
      'Check Opportunity Sourcing status',
      'Create pages for standalone access',
      'Configure routes in App.tsx',
      'Update navigation menu',
      'Test all integrations'
    ],
    key_principles: [
      'Business value determines integration priority',
      'Some components may be embedded, not standalone',
      'Maintain component reusability',
      'Follow consistent integration patterns',
      'Comprehensive testing required'
    ],
    metadata: {
      component_directories: [
        { name: 'parallel-exploration', component: 'ParallelExplorationDashboard.tsx', priority: 'HIGH' },
        { name: 'business-agents', components: ['AgentControlPanel.tsx', 'AgentMetricsChart.tsx'], priority: 'MEDIUM' },
        { name: 'knowledge-management', component: 'KnowledgeManagementDashboard.tsx', priority: 'HIGH' },
        { name: 'opportunity-sourcing', status: 'Possibly empty, needs verification', priority: 'MEDIUM' }
      ],
      database_tables: ['exploration_branches', 'knowledge_base_articles', 'opportunity_signals']
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-008',
    sd_key: 'SD-RECONNECT-008',
    title: 'Service Layer Completeness Audit',
    version: '1.0',
    status: 'draft',
    category: 'architecture_review',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Comprehensive audit of all service files to identify services without UI connectivity, map service-to-UI relationships, and design UI layers for critical orphaned services.',
    strategic_intent: 'Ensure all valuable service layer functionality has appropriate UI access. Identify backend services that need UI exposure vs those that are intentionally internal-only.',
    rationale: 'Service layer may contain valuable business logic with no UI access. Need systematic review to identify orphaned services, map existing UI consumption, and create UI for high-value services.',
    scope: 'Service file inventory, UI consumption mapping, orphaned service identification, business value assessment, and UI design for priority services.',
    strategic_objectives: [
      'Catalog all service files in /src/services/',
      'Map service-to-UI component relationships',
      'Identify orphaned services without UI access',
      'Assess business value of each orphaned service',
      'Design UI components for high-value services',
      'Validate service functionality through UI'
    ],
    success_criteria: [
      'Complete inventory of all service files',
      'Service-to-UI mapping documented',
      'All orphaned services identified',
      'Business value assessment completed',
      'UI designed for top 10 priority services',
      'At least 5 new UIs implemented for services'
    ],
    key_changes: [
      'Audit all files in /src/services/ directory',
      'Trace service imports across codebase',
      'Map which services have UI consumption',
      'Identify services with zero UI references',
      'Assess business value of orphaned services',
      'Design and implement UI for priority services',
      'Document service layer architecture'
    ],
    key_principles: [
      'Not all services need UI (some are internal)',
      'Business value determines UI priority',
      'Service layer should remain UI-agnostic',
      'UI should consume services, not embed logic',
      'Comprehensive testing of service-UI integration'
    ],
    metadata: {
      service_directory: '/src/services/',
      estimated_services: '50+',
      known_services: [
        'ventures.ts', 'evaValidation.ts', 'workflowExecutionService.ts',
        'parallelExplorationService.ts', 'knowledgeManagementService.ts',
        'gtmIntelligence.ts', 'automationEngine.ts'
      ],
      orphaned_service_estimate: '30-40%'
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-009',
    sd_key: 'SD-RECONNECT-009',
    title: 'Feature Documentation & Discovery',
    version: '1.0',
    status: 'draft',
    category: 'documentation',
    priority: 'medium',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Create comprehensive feature catalog with documentation, usage guides, and in-app feature discovery mechanism to help users understand and access all platform capabilities.',
    strategic_intent: 'Transform hidden platform capabilities into discoverable, well-documented features. Enable users to understand what the platform can do and how to access each capability.',
    rationale: 'Even after reconnecting features, users need to discover and understand platform capabilities. Missing comprehensive feature catalog, usage documentation, and discovery mechanisms.',
    scope: 'Feature inventory creation, documentation writing for each feature, usage guide development, in-app feature directory implementation, and onboarding flow creation.',
    strategic_objectives: [
      'Create comprehensive feature catalog/inventory',
      'Write usage documentation for each feature',
      'Build in-app feature directory/discovery page',
      'Create feature categories and tagging system',
      'Implement search across feature catalog',
      'Design onboarding flow highlighting key features'
    ],
    success_criteria: [
      'Complete feature catalog with all capabilities documented',
      'Usage guide created for each major feature',
      'In-app feature directory accessible and searchable',
      'Features tagged and categorized appropriately',
      'Onboarding flow introduces key platform capabilities',
      'User feedback shows improved feature understanding',
      'Documentation maintained in sync with feature updates'
    ],
    key_changes: [
      'Inventory all platform features and capabilities',
      'Write comprehensive documentation for each',
      'Create feature directory page component',
      'Implement feature search and filtering',
      'Design feature categorization taxonomy',
      'Build onboarding flow with feature highlights',
      'Add "What\'s New" section for feature updates',
      'Create video tutorials for complex features'
    ],
    key_principles: [
      'Documentation is critical for adoption',
      'Features without docs might as well not exist',
      'Discovery mechanisms reduce support burden',
      'Keep documentation in sync with features',
      'Progressive disclosure for complex capabilities'
    ],
    metadata: {
      features_to_document: '40+',
      documentation_formats: ['In-app guides', 'Video tutorials', 'Written docs', 'Interactive tours'],
      discovery_mechanisms: ['Feature catalog', 'Search', 'Onboarding', 'Contextual help'],
      maintenance_strategy: 'Update docs with every feature change'
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RECONNECT-010',
    sd_key: 'SD-RECONNECT-010',
    title: 'Automated Feature Connectivity Testing',
    version: '1.0',
    status: 'draft',
    category: 'quality_automation',
    priority: 'low',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Implement automated testing to prevent future feature disconnections through route coverage tests, navigation path validation, and orphaned component monitoring.',
    strategic_intent: 'Prevent recurrence of feature disconnection issues through automated testing and continuous monitoring. Catch orphaned components and missing routes before they reach production.',
    rationale: 'Current disconnection issues occurred because no automated checks exist for route coverage, navigation paths, or component usage. Need CI/CD integration to prevent future gaps.',
    scope: 'Test suite design for route coverage, navigation path validation, component usage tracking, CI/CD integration, and ongoing monitoring setup.',
    strategic_objectives: [
      'Design automated route coverage test suite',
      'Validate all pages have navigation paths',
      'Monitor for orphaned components in CI/CD',
      'Create alerts for missing routes',
      'Track component usage over time',
      'Prevent feature disconnections proactively'
    ],
    success_criteria: [
      'Automated tests validate 100% route coverage',
      'CI/CD pipeline checks for orphaned components',
      'All pages verified to have navigation paths',
      'Alerts trigger for missing routes or orphaned files',
      'Component usage tracked and reported',
      'Zero feature disconnections post-implementation'
    ],
    key_changes: [
      'Create route coverage test suite',
      'Build navigation path validator',
      'Implement orphaned component detector',
      'Integrate tests into CI/CD pipeline',
      'Set up monitoring and alerting',
      'Create usage tracking dashboard',
      'Add pre-commit hooks for route validation'
    ],
    key_principles: [
      'Prevention is better than remediation',
      'Automated testing catches issues early',
      'CI/CD integration ensures consistency',
      'Monitoring provides ongoing visibility',
      'Fast feedback loops improve quality'
    ],
    metadata: {
      test_types: ['Route coverage', 'Navigation validation', 'Component usage', 'Import reference tracking'],
      ci_cd_integration: 'GitHub Actions',
      monitoring_tools: ['Custom dashboard', 'Automated reports', 'Alerts'],
      maintenance_effort: 'LOW (automated)'
    },
    created_by: 'FEATURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function insertStrategicDirective(sd) {
  console.log(`\n📋 Inserting ${sd.id}: ${sd.title}...`);

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', sd.id)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(sd)
        .eq('id', sd.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${sd.id} updated successfully!`);
      console.log(`   Priority: ${data.priority}`);
      console.log(`   Status: ${data.status}`);
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ ${sd.id} created successfully!`);
      console.log(`   Priority: ${data.priority}`);
      console.log(`   Status: ${data.status}`);
    }
  } catch (error) {
    console.error(`❌ Error with ${sd.id}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating Feature Reconnection Strategic Directives');
  console.log('=' .repeat(60));
  console.log(`Total SDs to create: ${strategicDirectives.length}`);
  console.log('=' .repeat(60));

  for (const sd of strategicDirectives) {
    await insertStrategicDirective(sd);
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ All Strategic Directives created successfully!');
  console.log('=' .repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Total SDs: ${strategicDirectives.length}`);
  console.log(`   Critical: ${strategicDirectives.filter(sd => sd.priority === 'critical').length}`);
  console.log(`   High: ${strategicDirectives.filter(sd => sd.priority === 'high').length}`);
  console.log(`   Medium: ${strategicDirectives.filter(sd => sd.priority === 'medium').length}`);
  console.log(`   Low: ${strategicDirectives.filter(sd => sd.priority === 'low').length}`);
  console.log('\n🎯 Next Steps:');
  console.log('   1. Review SDs in EHG_Engineer dashboard');
  console.log('   2. LEAD approval for each SD');
  console.log('   3. Execute LEAD→PLAN→EXEC workflow');
  console.log('   4. Track progress via dashboard');
}

main().catch(console.error);
