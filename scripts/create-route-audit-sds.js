#!/usr/bin/env node

/**
 * Create Route Audit Strategic Directives
 *
 * Inserts all 35 SDs for the comprehensive route assessment:
 * - 1 Parent SD (orchestrator)
 * - 7 Section Assessment SDs (Command Center, Ventures, Analytics, GTM, AI, Settings, Admin)
 * - 1 Workflow Parent SD (25-stage assessment orchestrator)
 * - 25 Stage Assessment SDs (one per venture workflow stage)
 * - 1 Report Generation SD
 *
 * Per LEO Protocol v4.3.3 and Vision Version ROUTE-AUDIT-V1.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// WORKFLOW STAGE DEFINITIONS
// ============================================================================

const WORKFLOW_STAGES = [
  { number: 1, name: 'Draft Idea & Chairman Review', phase: 1, phaseName: 'THE TRUTH', isKillGate: false, isAdvisory: false },
  { number: 2, name: 'AI Multi-Model Critique', phase: 1, phaseName: 'THE TRUTH', isKillGate: false, isAdvisory: false },
  { number: 3, name: 'Market Validation & RAT', phase: 1, phaseName: 'THE TRUTH', isKillGate: true, isAdvisory: true },
  { number: 4, name: 'Competitive Intelligence', phase: 1, phaseName: 'THE TRUTH', isKillGate: false, isAdvisory: false },
  { number: 5, name: 'Profitability Forecasting', phase: 1, phaseName: 'THE TRUTH', isKillGate: true, isAdvisory: true },
  { number: 6, name: 'Risk Evaluation Matrix', phase: 2, phaseName: 'THE ENGINE', isKillGate: false, isAdvisory: false },
  { number: 7, name: 'Pricing Strategy', phase: 2, phaseName: 'THE ENGINE', isKillGate: false, isAdvisory: false },
  { number: 8, name: 'Business Model Canvas', phase: 2, phaseName: 'THE ENGINE', isKillGate: false, isAdvisory: false },
  { number: 9, name: 'Exit-Oriented Design', phase: 2, phaseName: 'THE ENGINE', isKillGate: false, isAdvisory: false },
  { number: 10, name: 'Strategic Naming', phase: 3, phaseName: 'THE IDENTITY', isKillGate: false, isAdvisory: false },
  { number: 11, name: 'Go-to-Market Strategy', phase: 3, phaseName: 'THE IDENTITY', isKillGate: true, isAdvisory: false },
  { number: 12, name: 'Sales & Success Logic', phase: 3, phaseName: 'THE IDENTITY', isKillGate: false, isAdvisory: false },
  { number: 13, name: 'Tech Stack Interrogation', phase: 4, phaseName: 'THE BLUEPRINT', isKillGate: false, isAdvisory: false },
  { number: 14, name: 'Data Model & Architecture', phase: 4, phaseName: 'THE BLUEPRINT', isKillGate: false, isAdvisory: false },
  { number: 15, name: 'Epic & User Story Breakdown', phase: 4, phaseName: 'THE BLUEPRINT', isKillGate: false, isAdvisory: false },
  { number: 16, name: 'Spec-Driven Schema Generation', phase: 4, phaseName: 'THE BLUEPRINT', isKillGate: true, isAdvisory: true, isElevation: true, elevationTarget: 'schema' },
  { number: 17, name: 'Environment & Agent Config', phase: 5, phaseName: 'THE BUILD LOOP', isKillGate: false, isAdvisory: false, isElevation: true, elevationTarget: 'repo' },
  { number: 18, name: 'MVP Development Loop', phase: 5, phaseName: 'THE BUILD LOOP', isKillGate: false, isAdvisory: false },
  { number: 19, name: 'Integration & API Layer', phase: 5, phaseName: 'THE BUILD LOOP', isKillGate: false, isAdvisory: false },
  { number: 20, name: 'Security & Performance', phase: 5, phaseName: 'THE BUILD LOOP', isKillGate: false, isAdvisory: false },
  { number: 21, name: 'QA & UAT', phase: 6, phaseName: 'LAUNCH & LEARN', isKillGate: false, isAdvisory: false },
  { number: 22, name: 'Deployment & Infrastructure', phase: 6, phaseName: 'LAUNCH & LEARN', isKillGate: false, isAdvisory: false, isElevation: true, elevationTarget: 'deployment' },
  { number: 23, name: 'Production Launch', phase: 6, phaseName: 'LAUNCH & LEARN', isKillGate: false, isAdvisory: false },
  { number: 24, name: 'Analytics & Feedback', phase: 6, phaseName: 'LAUNCH & LEARN', isKillGate: false, isAdvisory: false },
  { number: 25, name: 'Optimization & Scale', phase: 6, phaseName: 'LAUNCH & LEARN', isKillGate: false, isAdvisory: false }
];

// ============================================================================
// SD DEFINITIONS - All 35 Strategic Directives for Route Audit
// ============================================================================

const ROUTE_AUDIT_SDS = {
  // -------------------------------------------------------------------------
  // LEVEL 0: PARENT SD (Orchestrator)
  // -------------------------------------------------------------------------
  parent: {
    id: 'SD-ROUTE-AUDIT-PARENT',
    sd_key: 'route-audit-parent',
    legacy_id: 'SD-ROUTE-AUDIT-PARENT',
    title: 'EHG Route Assessment - Comprehensive Platform Audit',

    description: 'Orchestrate a comprehensive assessment of all routes within the EHG application. This parent SD coordinates child assessments across 7 navigation sections (127+ routes) and deep analysis of the 25-stage venture workflow. Each child SD assesses routes from the perspective of specialized sub-agents (design, accessibility, performance, security, UX). The final deliverable is a detailed report cataloging findings, severity levels, and recommended corrective Strategic Directives.',

    scope: 'Full application route audit: Command Center, Ventures, Analytics, Go-to-Market, AI & Automation, Settings & Tools, Platform Administration. Deep assessment of 25-stage venture workflow including UI implementation, data flow, gate logic, and progression mechanics. Generation of comprehensive audit report with prioritized corrective actions.',

    rationale: 'Before implementing Genesis Oath v3.1 enhancements, a thorough assessment of current route health is essential. This audit identifies technical debt, accessibility gaps, security vulnerabilities, performance issues, and UX inconsistencies that must be addressed through corrective SDs before new feature development.',

    category: 'audit',
    priority: 'high',
    status: 'draft',
    relationship_type: 'parent',
    parent_sd_id: null,
    sequence_rank: 1,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Assess all 127+ frontend routes for health, completeness, and quality',
      'Evaluate 47+ API endpoints for consistency and security',
      'Deep-dive into 25-stage venture workflow implementation',
      'Identify critical, high, medium, and low priority issues',
      'Generate comprehensive audit report with corrective SD recommendations',
      'Establish baseline for platform quality metrics'
    ],

    success_criteria: [
      'All 7 navigation sections assessed by child SDs',
      'All 25 venture workflow stages assessed by grandchild SDs',
      'Audit report generated with complete findings',
      'Issues categorized by severity (P0-P3)',
      'Corrective SDs drafted with clear scope and rationale',
      'Report stored in docs/reports/ for future reference'
    ],

    metadata: {
      vision_spec_references: {
        version: 'ROUTE-AUDIT-V1.0',
        primary_spec: 'docs/vision/ROUTE_AUDIT_SD_STRUCTURE.md',
        supporting_specs: [
          'docs/workflow/stages_v2.yaml',
          'src/routes/index.tsx'
        ]
      },
      must_read_before_prd: [
        'docs/vision/ROUTE_AUDIT_SD_STRUCTURE.md'
      ],
      must_read_before_exec: [
        'src/routes/index.tsx',
        'docs/workflow/stages_v2.yaml'
      ],
      implementation_guidance: {
        creation_mode: 'AUDIT',
        output_format: 'markdown_report',
        report_path: 'docs/reports/ROUTE_AUDIT_REPORT_YYYY-MM-DD.md'
      },
      assessment_criteria: {
        design: ['Consistency with design system', 'Responsive behavior', 'Visual hierarchy'],
        accessibility: ['WCAG 2.1 AA compliance', 'Keyboard navigation', 'Screen reader support'],
        performance: ['Load time', 'Bundle size impact', 'Re-render efficiency'],
        security: ['Auth requirements', 'Data exposure risks', 'Input validation'],
        ux: ['User flow clarity', 'Error states', 'Loading states', 'Empty states']
      },
      capacity: {
        total_children: 9,
        total_grandchildren: 25,
        children: [
          'SD-ROUTE-AUDIT-CMD',
          'SD-ROUTE-AUDIT-VENTURES',
          'SD-ROUTE-AUDIT-ANALYTICS',
          'SD-ROUTE-AUDIT-GTM',
          'SD-ROUTE-AUDIT-AI',
          'SD-ROUTE-AUDIT-SETTINGS',
          'SD-ROUTE-AUDIT-ADMIN',
          'SD-ROUTE-AUDIT-WORKFLOW',
          'SD-ROUTE-AUDIT-REPORT'
        ]
      }
    },

    dependencies: [],

    risks: [
      {
        risk: 'Large number of routes may exceed context limits',
        mitigation: 'Process routes in batches per child SD, use sub-agents for parallel assessment'
      },
      {
        risk: 'Assessment may uncover more issues than can be addressed',
        mitigation: 'Prioritize findings by severity, create SD backlog for deferred items'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // LEVEL 1: SECTION ASSESSMENT SDs (Children of Parent)
  // -------------------------------------------------------------------------
  sections: [
    {
      id: 'SD-ROUTE-AUDIT-CMD',
      sd_key: 'route-audit-cmd',
      title: 'Route Assessment: Command Center Section',
      description: 'Assess all routes in the Command Center navigation section. This includes the Chairman Dashboard (BriefingDashboard V2), Decisions Inbox, Portfolio Overview, Chairman Settings, Escalation views, and legacy dashboard fallback. Evaluate each route for design consistency, accessibility compliance, performance metrics, security posture, and UX quality.',
      scope: 'Routes: /chairman, /chairman/decisions, /chairman/portfolio, /chairman/settings, /chairman/escalations/:id, /chairman-legacy, /chairman-analytics. Components: BriefingDashboard, DecisionsInbox, VenturesPage, ChairmanSettingsPage, ChairmanEscalationPage, DecisionAnalyticsDashboard.',
      rationale: 'The Command Center is the strategic executive dashboard. Any issues here directly impact Chairman decision-making efficiency and platform perception. High visibility requires high quality.',
      category: 'audit',
      priority: 'high',
      sequence_rank: 1,
      routes: [
        { path: '/chairman', component: 'BriefingDashboard', purpose: 'Executive command center' },
        { path: '/chairman/decisions', component: 'DecisionsInbox', purpose: 'Decision queue' },
        { path: '/chairman/portfolio', component: 'VenturesPage', purpose: 'Portfolio overview' },
        { path: '/chairman/settings', component: 'ChairmanSettingsPage', purpose: 'Settings' },
        { path: '/chairman/escalations/:id', component: 'ChairmanEscalationPage', purpose: 'Escalation detail' },
        { path: '/chairman-legacy', component: 'ChairmanDashboard', purpose: 'Legacy fallback' },
        { path: '/chairman-analytics', component: 'DecisionAnalyticsDashboard', purpose: 'Analytics' }
      ]
    },
    {
      id: 'SD-ROUTE-AUDIT-VENTURES',
      sd_key: 'route-audit-ventures',
      title: 'Route Assessment: Ventures Section',
      description: 'Assess all routes in the Ventures navigation section. This includes the Ventures portfolio, individual venture detail views, venture workflow pages, venture creation wizard, decisions inbox, calibration review, portfolios manager, companies list and detail. Critical section for core platform functionality.',
      scope: 'Routes: /ventures, /ventures/:id, /ventures/:id/workflow, /ventures/new, /ventures/decisions, /ventures/calibration, /portfolios, /companies, /companies/:id.',
      rationale: 'The Ventures section is the core of EHG\'s value proposition. Venture management, creation, and workflow execution are the primary user journeys. Any friction here directly impacts platform adoption and user success.',
      category: 'audit',
      priority: 'critical',
      sequence_rank: 2,
      routes: [
        { path: '/ventures', component: 'VenturesPage', purpose: 'All ventures portfolio' },
        { path: '/ventures/:id', component: 'VentureDetail', purpose: 'Venture detail' },
        { path: '/ventures/:id/workflow', component: 'VentureWorkflowPage', purpose: 'Workflow stages' },
        { path: '/ventures/new', component: 'VentureCreationPage', purpose: 'Create venture' },
        { path: '/ventures/decisions', component: 'DecisionsInbox', purpose: 'Decisions queue' },
        { path: '/ventures/calibration', component: 'CalibrationReview', purpose: 'Calibration' },
        { path: '/portfolios', component: 'PortfoliosPage', purpose: 'Portfolio management' },
        { path: '/companies', component: 'CompaniesPage', purpose: 'Company list' },
        { path: '/companies/:id', component: 'CompanyDetailPage', purpose: 'Company detail' }
      ]
    },
    {
      id: 'SD-ROUTE-AUDIT-ANALYTICS',
      sd_key: 'route-audit-analytics',
      title: 'Route Assessment: Analytics & Insights Section',
      description: 'Assess all routes in the Analytics & Insights navigation section. Includes main analytics dashboard, export functionality, EVA analytics, real-time analytics, advanced analytics engine, stage analysis, risk forecasting, and executive insights. Data visualization heavy section.',
      scope: 'Routes: /analytics, /analytics/exports, /eva-analytics, /realtime-analytics, /advanced-analytics, /stage-analysis, /risk-forecasting, /insights.',
      rationale: 'Analytics routes are data-intensive and require careful assessment of chart rendering performance, data accuracy, export functionality, and real-time update mechanisms.',
      category: 'audit',
      priority: 'high',
      sequence_rank: 3,
      routes: [
        { path: '/analytics', component: 'AnalyticsDashboard', purpose: 'Main dashboard' },
        { path: '/analytics/exports', component: 'AnalyticsExportPage', purpose: 'Export data' },
        { path: '/eva-analytics', component: 'EVAAnalyticsPage', purpose: 'EVA analytics' },
        { path: '/realtime-analytics', component: 'RealTimeAnalyticsPage', purpose: 'Real-time' },
        { path: '/advanced-analytics', component: 'AdvancedAnalyticsEngine', purpose: 'Advanced' },
        { path: '/stage-analysis', component: 'StageAnalysisPage', purpose: 'Stage analysis' },
        { path: '/risk-forecasting', component: 'RiskForecastingDashboard', purpose: 'Risk prediction' },
        { path: '/insights', component: 'Insights', purpose: 'Executive insights' }
      ]
    },
    {
      id: 'SD-ROUTE-AUDIT-GTM',
      sd_key: 'route-audit-gtm',
      title: 'Route Assessment: Go-to-Market Section',
      description: 'Assess all routes in the Go-to-Market navigation section. Includes GTM intelligence dashboard, GTM execution/timing optimization, and creative media automation (video prompt studio). Marketing-focused section with AI-powered tools.',
      scope: 'Routes: /gtm-intelligence, /gtm-dashboard, /gtm-timing, /creative-media-automation, /creative-media, /video-variants.',
      rationale: 'GTM routes combine market intelligence with creative automation. Assessment must verify AI integration points, media generation functionality, and timing optimization accuracy.',
      category: 'audit',
      priority: 'medium',
      sequence_rank: 4,
      routes: [
        { path: '/gtm-intelligence', component: 'GTMDashboardPage', purpose: 'GTM intelligence' },
        { path: '/gtm-dashboard', component: 'GTMDashboardPage', purpose: 'GTM execution' },
        { path: '/gtm-timing', component: 'GTMTimingDashboard', purpose: 'Timing optimization' },
        { path: '/creative-media-automation', component: 'VideoPromptStudioPage', purpose: 'Creative automation' },
        { path: '/creative-media', component: 'VideoPromptStudioPage', purpose: 'Creative tools' },
        { path: '/video-variants', component: 'VideoVariantTestingPage', purpose: 'Video testing' }
      ]
    },
    {
      id: 'SD-ROUTE-AUDIT-AI',
      sd_key: 'route-audit-ai',
      title: 'Route Assessment: AI & Automation Section',
      description: 'Assess all routes in the AI & Automation navigation section. Includes EVA assistant, EVA orchestration, AI agents management, business agents, R&D department, AI CEO dashboard, AI navigation, workflows, automation, and development workflow routes. Heavy AI integration.',
      scope: 'Routes: /eva-assistant, /eva-orchestration, /eva-compliance, /ai-agents, /business-agents, /agents/new, /rd-department, /ai-ceo, /ai-navigation, /automation, /workflows, /workflow-execution, /live-progress, /development, /iterative-development, /mvp-engine.',
      rationale: 'AI routes are the intelligence backbone of EHG. Assessment must verify EVA integration, agent lifecycle management, orchestration flows, and automation reliability.',
      category: 'audit',
      priority: 'high',
      sequence_rank: 5,
      routes: [
        { path: '/eva-assistant', component: 'EVAAssistantPage', purpose: 'EVA assistant' },
        { path: '/eva-orchestration', component: 'EvaOrchestrationDashboard', purpose: 'Orchestration' },
        { path: '/eva-compliance', component: 'EVACompliancePage', purpose: 'Compliance' },
        { path: '/ai-agents', component: 'AIAgentsPage', purpose: 'AI agents' },
        { path: '/business-agents', component: 'BusinessAgentsPage', purpose: 'Business agents' },
        { path: '/agents/new', component: 'AgentWizard', purpose: 'Create agent' },
        { path: '/rd-department', component: 'RDDepartmentDashboard', purpose: 'R&D' },
        { path: '/ai-ceo', component: 'AICEODashboard', purpose: 'AI CEO' },
        { path: '/ai-navigation', component: 'AINavigationAssistant', purpose: 'Navigation AI' },
        { path: '/automation', component: 'AutomationDashboardPage', purpose: 'Automation' },
        { path: '/workflows', component: 'Workflows', purpose: 'Workflow management' },
        { path: '/workflow-execution', component: 'WorkflowExecutionDashboard', purpose: 'Execution' },
        { path: '/live-progress', component: 'LiveWorkflowProgress', purpose: 'Live progress' },
        { path: '/development', component: 'DevelopmentWorkflow', purpose: 'Development' },
        { path: '/iterative-development', component: 'IterativeDevelopmentPage', purpose: 'Iterative dev' },
        { path: '/mvp-engine', component: 'MVPEnginePage', purpose: 'MVP engine' }
      ]
    },
    {
      id: 'SD-ROUTE-AUDIT-SETTINGS',
      sd_key: 'route-audit-settings',
      title: 'Route Assessment: Settings & Tools Section',
      description: 'Assess all routes in the Settings & Tools navigation section. Includes user settings, feature directory/catalog, notifications, integrations, and knowledge base. Supporting infrastructure for platform configuration and user preferences.',
      scope: 'Routes: /settings, /features, /features/:slug/docs, /feature-catalog, /notifications, /notifications-collaboration, /integrations, /external-integrations, /integration-status, /knowledge-base, /knowledge-management, /feedback-loops, /mobile-companion-app.',
      rationale: 'Settings routes configure user experience. Poor settings UX leads to misconfigured accounts and support tickets. Knowledge base and feature catalog are discovery mechanisms.',
      category: 'audit',
      priority: 'medium',
      sequence_rank: 6,
      routes: [
        { path: '/settings', component: 'SettingsPage', purpose: 'User settings' },
        { path: '/features', component: 'FeatureDirectory', purpose: 'Feature catalog' },
        { path: '/features/:slug/docs', component: 'FeatureDocumentation', purpose: 'Feature docs' },
        { path: '/feature-catalog', component: 'FeatureCatalog', purpose: 'Complete catalog' },
        { path: '/notifications', component: 'Notifications', purpose: 'Notifications' },
        { path: '/notifications-collaboration', component: 'NotificationsAndCollaboration', purpose: 'Collab' },
        { path: '/integrations', component: 'IntegrationHubDashboard', purpose: 'Integrations' },
        { path: '/external-integrations', component: 'ExternalIntegrationHub', purpose: 'External' },
        { path: '/integration-status', component: 'IntegrationStatusPage', purpose: 'Status' },
        { path: '/knowledge-base', component: 'KnowledgeBaseSystem', purpose: 'Knowledge base' },
        { path: '/knowledge-management', component: 'KnowledgeManagementPage', purpose: 'Management' },
        { path: '/feedback-loops', component: 'FeedbackLoopsPage', purpose: 'Feedback' },
        { path: '/mobile-companion-app', component: 'MobileCompanionAppPage', purpose: 'Mobile app' }
      ]
    },
    {
      id: 'SD-ROUTE-AUDIT-ADMIN',
      sd_key: 'route-audit-admin',
      title: 'Route Assessment: Platform Administration Section',
      description: 'Assess all routes in the Platform Administration navigation section. Includes admin dashboard, SD manager, backlog manager, directive lab, UAT dashboard, PR reviews, PRD manager, ventures admin, protocol configuration, governance, security, testing, monitoring, and more. Critical administrative routes with elevated permissions.',
      scope: 'Routes: /admin, /admin/directives, /admin/backlog, /admin/directive-lab, /admin/uat, /admin/pr-reviews, /admin/prds, /admin/ventures, /admin/protocol, /admin/settings, /board/*, /raid-log, /governance, /security, /testing, /monitoring, /performance, /team.',
      rationale: 'Admin routes control platform configuration and operations. Security assessment is critical - unauthorized access could compromise the entire platform. Performance monitoring and quality assurance routes must function reliably.',
      category: 'audit',
      priority: 'critical',
      sequence_rank: 7,
      routes: [
        { path: '/admin', component: 'AdminDashboard', purpose: 'Admin dashboard' },
        { path: '/admin/directives', component: 'SDManagerPage', purpose: 'SD management' },
        { path: '/admin/backlog', component: 'BacklogManagerPage', purpose: 'Backlog' },
        { path: '/admin/directive-lab', component: 'DirectiveLabPage', purpose: 'Directive testing' },
        { path: '/admin/uat', component: 'UATDashboardPage', purpose: 'UAT dashboard' },
        { path: '/admin/pr-reviews', component: 'PRReviewsPage', purpose: 'PR reviews' },
        { path: '/admin/prds', component: 'PRDManagerPage', purpose: 'PRD management' },
        { path: '/admin/ventures', component: 'VenturesManagerPage', purpose: 'Ventures admin' },
        { path: '/board/dashboard', component: 'BoardDashboardPage', purpose: 'Board dashboard' },
        { path: '/board/members', component: 'BoardMembersPage', purpose: 'Board members' },
        { path: '/board/meetings', component: 'BoardMeetingsPage', purpose: 'Meetings' },
        { path: '/governance', component: 'GovernancePage', purpose: 'Governance' },
        { path: '/security', component: 'SecurityPage', purpose: 'Security' },
        { path: '/monitoring', component: 'MonitoringPage', purpose: 'Monitoring' },
        { path: '/performance', component: 'PerformancePage', purpose: 'Performance' }
      ]
    }
  ],

  // -------------------------------------------------------------------------
  // LEVEL 1: WORKFLOW PARENT SD (Child of Parent, Parent of Stage SDs)
  // -------------------------------------------------------------------------
  workflowParent: {
    id: 'SD-ROUTE-AUDIT-WORKFLOW',
    sd_key: 'route-audit-workflow',
    title: 'Route Assessment: 25-Stage Venture Workflow Deep Analysis',
    description: 'Parent SD for deep assessment of the 25-stage venture workflow. Each of the 25 stages receives its own child SD for comprehensive analysis of UI implementation, data flow, gate logic, progression mechanics, and integration with venture lifecycle. This parent coordinates the stage assessments and aggregates findings into the workflow section of the audit report.',
    scope: 'Full 25-stage lifecycle: Phase 1 THE TRUTH (1-5), Phase 2 THE ENGINE (6-9), Phase 3 THE IDENTITY (10-12), Phase 4 THE BLUEPRINT (13-16), Phase 5 THE BUILD LOOP (17-20), Phase 6 LAUNCH & LEARN (21-25).',
    rationale: 'The 25-stage venture workflow is the core differentiator of EHG. Each stage has specific UI requirements, data dependencies, gate logic, and progression rules. Deep assessment ensures the workflow functions correctly end-to-end and identifies gaps before Genesis activation.',
    category: 'audit',
    priority: 'critical',
    sequence_rank: 8
  },

  // -------------------------------------------------------------------------
  // LEVEL 1: REPORT GENERATION SD
  // -------------------------------------------------------------------------
  report: {
    id: 'SD-ROUTE-AUDIT-REPORT',
    sd_key: 'route-audit-report',
    title: 'Route Audit Report Generation',
    description: 'Aggregate all findings from section and stage assessments into a comprehensive audit report. Categorize issues by severity (P0-P3), generate corrective SD recommendations, and save the report for future reference.',
    scope: 'Report aggregation, severity categorization, corrective SD drafting, report output to docs/reports/ROUTE_AUDIT_REPORT_YYYY-MM-DD.md.',
    rationale: 'The audit report is the primary deliverable. It must be detailed enough to inform corrective SDs and establish quality baselines.',
    category: 'documentation',
    priority: 'critical',
    sequence_rank: 9
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildSectionSD(section) {
  return {
    id: section.id,
    sd_key: section.sd_key,
    legacy_id: section.id,
    title: section.title,
    description: section.description,
    scope: section.scope,
    rationale: section.rationale,
    category: section.category,
    priority: section.priority,
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-ROUTE-AUDIT-PARENT',
    sequence_rank: section.sequence_rank,
    created_by: 'LEO',
    version: '1.0',
    strategic_objectives: [
      `Audit all ${section.routes.length} ${section.title.split(':')[1]?.trim() || 'section'} routes`,
      'Verify design consistency with system patterns',
      'Check accessibility compliance (WCAG 2.1 AA)',
      'Measure performance metrics (LCP, FID, CLS)',
      'Assess security of protected routes',
      'Evaluate user experience quality'
    ],
    success_criteria: [
      `All ${section.routes.length} routes accessed and evaluated`,
      'Design inconsistencies documented',
      'Accessibility issues cataloged with WCAG references',
      'Performance baselines recorded',
      'Security review completed',
      'Findings recorded in section report'
    ],
    metadata: {
      vision_spec_references: {
        version: 'ROUTE-AUDIT-V1.0',
        primary_spec: 'docs/vision/ROUTE_AUDIT_SD_STRUCTURE.md'
      },
      implementation_guidance: { creation_mode: 'AUDIT' },
      routes: section.routes
    },
    dependencies: []
  };
}

function buildStageSD(stage, index) {
  const stageNum = String(stage.number).padStart(2, '0');
  const killGateLabel = stage.isKillGate ? ' (KILL GATE)' : '';
  const elevationLabel = stage.isElevation ? ` (${stage.elevationTarget.toUpperCase()} ELEVATION)` : '';

  return {
    id: `SD-ROUTE-AUDIT-STAGE-${stageNum}`,
    sd_key: `route-audit-stage-${stageNum}`,
    legacy_id: `SD-ROUTE-AUDIT-STAGE-${stageNum}`,
    title: `Stage ${stage.number} Assessment: ${stage.name}${killGateLabel}${elevationLabel}`,
    description: `Deep assessment of Stage ${stage.number} (${stage.name}) implementation in Phase ${stage.phase}: ${stage.phaseName}. Evaluate UI components, data flow, ${stage.isKillGate ? 'kill decision workflow, ' : ''}${stage.isElevation ? 'elevation mechanics, ' : ''}progression logic, and integration with venture lifecycle.`,
    scope: `Stage ${stage.number} components: UI implementation, data capture, validation logic, ${stage.isKillGate ? 'kill gate enforcement, ' : ''}${stage.isElevation ? `${stage.elevationTarget} elevation, ` : ''}progression to next stage.`,
    rationale: `Stage ${stage.number} is part of ${stage.phaseName} phase.${stage.isKillGate ? ' This is a KILL GATE - ventures can be terminated here.' : ''}${stage.isElevation ? ` This is an ELEVATION point for ${stage.elevationTarget}.` : ''} Assessment ensures this stage functions correctly within the workflow.`,
    category: 'audit',
    priority: stage.isKillGate || stage.isElevation ? 'critical' : stage.phase <= 2 ? 'high' : 'medium',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-ROUTE-AUDIT-WORKFLOW',
    sequence_rank: stage.number,
    created_by: 'LEO',
    version: '1.0',
    strategic_objectives: [
      `Verify Stage ${stage.number} UI implementation`,
      'Check data capture and validation',
      stage.isKillGate ? 'Validate kill gate decision workflow' : 'Verify progression logic',
      stage.isElevation ? `Test ${stage.elevationTarget} elevation mechanics` : 'Check stage completion criteria',
      'Assess integration with venture data model'
    ],
    success_criteria: [
      'Stage UI renders correctly',
      'Data captures and persists',
      stage.isKillGate ? 'Kill decision triggers correctly' : 'Progression advances to next stage',
      stage.isElevation ? `${stage.elevationTarget} elevates to production` : 'Stage marks as complete',
      'Error states handled gracefully'
    ],
    metadata: {
      vision_spec_references: {
        version: 'ROUTE-AUDIT-V1.0',
        primary_spec: 'docs/workflow/stages_v2.yaml'
      },
      implementation_guidance: { creation_mode: 'AUDIT' },
      stage_details: {
        number: stage.number,
        name: stage.name,
        phase: stage.phase,
        phase_name: stage.phaseName,
        is_kill_gate: stage.isKillGate,
        is_advisory: stage.isAdvisory,
        is_elevation_point: stage.isElevation || false,
        elevation_target: stage.elevationTarget || null
      }
    },
    dependencies: index > 0 ? [`SD-ROUTE-AUDIT-STAGE-${String(WORKFLOW_STAGES[index - 1].number).padStart(2, '0')}`] : []
  };
}

function buildWorkflowParentSD() {
  const wp = ROUTE_AUDIT_SDS.workflowParent;
  return {
    id: wp.id,
    sd_key: wp.sd_key,
    legacy_id: wp.id,
    title: wp.title,
    description: wp.description,
    scope: wp.scope,
    rationale: wp.rationale,
    category: wp.category,
    priority: wp.priority,
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-ROUTE-AUDIT-PARENT',
    sequence_rank: wp.sequence_rank,
    created_by: 'LEO',
    version: '1.0',
    strategic_objectives: [
      'Coordinate assessment of all 25 workflow stages',
      'Verify stage progression logic end-to-end',
      'Check kill gate enforcement at Stages 3, 5, 11, 16',
      'Assess elevation mechanics at Stages 16, 17, 22',
      'Validate data flow between stages',
      'Aggregate findings into workflow report section'
    ],
    success_criteria: [
      'All 25 stage SDs completed',
      'Stage progression verified end-to-end',
      'Kill gates function correctly',
      'Elevations execute properly',
      'Data persists correctly across stages',
      'Workflow report section complete'
    ],
    metadata: {
      vision_spec_references: {
        version: 'ROUTE-AUDIT-V1.0',
        primary_spec: 'docs/workflow/stages_v2.yaml'
      },
      implementation_guidance: { creation_mode: 'AUDIT' },
      workflow_phases: [
        { phase: 1, name: 'THE TRUTH', stages: [1, 2, 3, 4, 5] },
        { phase: 2, name: 'THE ENGINE', stages: [6, 7, 8, 9] },
        { phase: 3, name: 'THE IDENTITY', stages: [10, 11, 12] },
        { phase: 4, name: 'THE BLUEPRINT', stages: [13, 14, 15, 16] },
        { phase: 5, name: 'THE BUILD LOOP', stages: [17, 18, 19, 20] },
        { phase: 6, name: 'LAUNCH & LEARN', stages: [21, 22, 23, 24, 25] }
      ],
      kill_gates: [3, 5, 11, 16],
      elevation_points: [16, 17, 22],
      children: WORKFLOW_STAGES.map(s => `SD-ROUTE-AUDIT-STAGE-${String(s.number).padStart(2, '0')}`)
    },
    dependencies: ['SD-ROUTE-AUDIT-VENTURES']
  };
}

function buildReportSD() {
  const r = ROUTE_AUDIT_SDS.report;
  return {
    id: r.id,
    sd_key: r.sd_key,
    legacy_id: r.id,
    title: r.title,
    description: r.description,
    scope: r.scope,
    rationale: r.rationale,
    category: r.category,
    priority: r.priority,
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-ROUTE-AUDIT-PARENT',
    sequence_rank: r.sequence_rank,
    created_by: 'LEO',
    version: '1.0',
    strategic_objectives: [
      'Aggregate all section findings',
      'Categorize issues by severity (P0-P3)',
      'Draft corrective SD recommendations',
      'Generate comprehensive markdown report',
      'Save report to docs/reports/'
    ],
    success_criteria: [
      'All 8 section reports aggregated',
      'Issues categorized P0/P1/P2/P3',
      'Corrective SDs drafted with scope',
      'Report includes executive summary',
      'Report saved with date stamp'
    ],
    metadata: {
      report_structure: {
        sections: [
          'Executive Summary',
          'Command Center Findings',
          'Ventures Findings',
          'Analytics Findings',
          'GTM Findings',
          'AI & Automation Findings',
          'Settings & Tools Findings',
          'Administration Findings',
          '25-Stage Workflow Findings',
          'Corrective Actions (P0-P3)',
          'Recommended Corrective SDs',
          'Appendix: Route Inventory'
        ]
      },
      severity_definitions: {
        P0: 'Critical - Blocking functionality or security vulnerability',
        P1: 'High - Significant functionality gap or performance issue',
        P2: 'Medium - Moderate issue affecting user experience',
        P3: 'Low - Minor issue or enhancement opportunity'
      }
    },
    dependencies: [
      'SD-ROUTE-AUDIT-CMD',
      'SD-ROUTE-AUDIT-VENTURES',
      'SD-ROUTE-AUDIT-ANALYTICS',
      'SD-ROUTE-AUDIT-GTM',
      'SD-ROUTE-AUDIT-AI',
      'SD-ROUTE-AUDIT-SETTINGS',
      'SD-ROUTE-AUDIT-ADMIN',
      'SD-ROUTE-AUDIT-WORKFLOW'
    ]
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     Route Audit SD Creation - LEO Protocol v4.3.3             ║');
  console.log('║     Vision: ROUTE-AUDIT-V1.0                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase client initialized\n');

  // Build all SDs
  const allSDs = [];

  // 1. Parent SD
  console.log('📋 Building Parent SD...');
  allSDs.push(ROUTE_AUDIT_SDS.parent);

  // 2. Section SDs
  console.log('📋 Building 7 Section Assessment SDs...');
  for (const section of ROUTE_AUDIT_SDS.sections) {
    allSDs.push(buildSectionSD(section));
  }

  // 3. Workflow Parent SD
  console.log('📋 Building Workflow Parent SD...');
  allSDs.push(buildWorkflowParentSD());

  // 4. Stage SDs
  console.log('📋 Building 25 Stage Assessment SDs...');
  WORKFLOW_STAGES.forEach((stage, index) => {
    allSDs.push(buildStageSD(stage, index));
  });

  // 5. Report SD
  console.log('📋 Building Report Generation SD...');
  allSDs.push(buildReportSD());

  console.log(`\n📊 Total SDs to insert: ${allSDs.length}\n`);

  // Insert SDs
  let successCount = 0;
  let errorCount = 0;

  for (const sd of allSDs) {
    try {
      // Check if exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('sd_key', sd.sd_key)
        .single();

      if (existing) {
        // Update
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update(sd)
          .eq('sd_key', sd.sd_key);

        if (error) throw error;
        console.log(`🔄 Updated: ${sd.id}`);
      } else {
        // Insert
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert(sd);

        if (error) throw error;
        console.log(`✅ Inserted: ${sd.id}`);
      }
      successCount++;
    } catch (error) {
      console.error(`❌ Failed: ${sd.id} - ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`\n📊 Results: ${successCount} succeeded, ${errorCount} failed`);
  console.log('\n✨ Route Audit SDs creation complete!\n');
}

main().catch(console.error);
