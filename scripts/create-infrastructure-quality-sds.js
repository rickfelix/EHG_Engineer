#!/usr/bin/env node

/**
 * Create Infrastructure & Quality Strategic Directives
 *
 * This script creates 7 new Strategic Directives addressing critical gaps:
 * - Test Coverage (CRITICAL)
 * - Error Handling (CRITICAL)
 * - Database Tables (CRITICAL)
 * - Onboarding UX (HIGH)
 * - Export Engine (HIGH)
 * - Accessibility (HIGH)
 * - Real-time Features (HIGH)
 *
 * These SDs complement the existing 18 reconnection/backend SDs.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const strategicDirectives = [
  // ===== CRITICAL PRIORITY =====
  {
    id: 'SD-QUALITY-001',
    sd_key: 'SD-QUALITY-001',
    title: 'Zero Test Coverage Crisis - Comprehensive Testing Infrastructure',
    version: '1.0',
    status: 'draft',
    category: 'quality_assurance',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Establish comprehensive testing infrastructure and achieve minimum 50% code coverage. The EHG application has 362,538 lines of code with ZERO unit or integration tests, representing a critical quality and reliability gap.',
    rationale: 'Zero test coverage represents critical technical debt with 362,538 LOC unverified. Without automated testing, every code change risks regressions, deployment confidence is low, and refactoring is dangerous. Testing infrastructure is essential for quality, velocity, and maintainability.',
    scope: 'Create complete testing infrastructure (Vitest unit/integration, Playwright E2E), write tests for critical business logic and workflows, establish coverage reporting and CI/CD integration, document testing patterns. EXCLUDES: Achieving 100% coverage immediately (target 50% on critical paths first).',
    strategic_intent: 'Transform EHG from an untested codebase into a quality-first application with comprehensive test coverage, automated verification, and confidence in deployments. Enable safe refactoring and rapid feature development.',
    objectives: [
      'Create test infrastructure for unit, integration, and E2E testing',
      'Implement unit tests for critical business logic (services, utilities, hooks)',
      'Add integration tests for key workflows (venture creation, stage progression)',
      'Establish test coverage reporting and CI/CD integration',
      'Create testing documentation and best practices guide',
      'Target minimum 50% code coverage for critical paths'
    ],
    strategic_objectives: [
      'Create test infrastructure for unit, integration, and E2E testing',
      'Implement unit tests for critical business logic (services, utilities, hooks)',
      'Add integration tests for key workflows (venture creation, stage progression)',
      'Establish test coverage reporting and CI/CD integration',
      'Create testing documentation and best practices guide',
      'Target minimum 50% code coverage for critical paths'
    ],
    success_criteria: [
      'Vitest unit test infrastructure operational with ≥100 test files',
      'Integration test suite with ≥30 workflow tests',
      'E2E test coverage for critical user journeys',
      'Minimum 50% code coverage achieved on critical modules',
      'Automated test execution in CI/CD pipeline',
      'Test documentation and examples for team'
    ],
    key_changes: [
      'Configure Vitest test runner and coverage',
      'Create test utilities and helpers',
      'Write unit tests for critical services',
      'Add integration tests for workflows',
      'Integrate test execution in CI/CD',
      'Document testing patterns'
    ],
    technical_requirements: {
      frameworks: ['Vitest (already configured)', 'Testing Library', 'Playwright (E2E)'],
      coverage_tools: ['@vitest/coverage-v8', 'Istanbul'],
      test_types: ['Unit', 'Integration', 'E2E', 'Visual Regression'],
      ci_integration: ['GitHub Actions', 'Coverage reporting', 'PR gates']
    },
    effort_estimate: {
      hours_min: 160,
      hours_max: 200,
      complexity: 'high',
      risk: 'medium'
    },
    dependencies: [],
    key_principles: [
      'Test-driven quality: Automated testing is not optional',
      'Coverage targets: 50% minimum on critical paths, trending toward 80%',
      'Testing pyramid: Unit tests (majority), integration tests (moderate), E2E tests (critical paths)',
      'Fast feedback: Tests run in CI/CD, block merges on failures',
      'Documentation: Test examples guide future development'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      total_loc: 362538,
      current_test_files: 0,
      current_coverage: '0%',
      target_coverage: '50%',
      test_framework_status: 'configured_but_unused',
      related_files: [
        'vitest.config.ts',
        'vitest.config.integration.ts',
        'playwright.config.ts',
        'package.json (test scripts defined)'
      ],
      evidence: 'find src -name "*.test.*" returns 0 files',
      quality_impact: 'CRITICAL - No verification of correctness, no regression prevention'
    }
  },
  {
    id: 'SD-RELIABILITY-001',
    sd_key: 'SD-RELIABILITY-001',
    title: 'Error Boundary & Error Handling Infrastructure',
    version: '1.0',
    status: 'draft',
    category: 'reliability',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Implement comprehensive error handling infrastructure including React Error Boundaries, global error recovery, graceful degradation, and error monitoring. Currently, unhandled errors crash the entire application, exposing users to white screens.',
    rationale: 'Application currently has zero error boundaries. Unhandled React errors crash the entire UI, exposing users to white screens and data loss. Lack of error monitoring means production issues go undetected. Comprehensive error handling infrastructure is essential for production-grade reliability and user experience.',
    scope: 'Implement 3-level error boundary hierarchy (global, route, component), create fallback UIs for all error states, add error logging and monitoring infrastructure, establish graceful degradation patterns. EXCLUDES: Third-party error monitoring service integration (use logging initially), automatic error recovery for all error types (focus on user-actionable recovery first).',
    strategic_intent: 'Transform EHG from a fragile application that crashes on errors into a resilient system with graceful error handling, user-friendly recovery options, and comprehensive monitoring. Eliminate white screens and improve user trust.',
    objectives: [
      'Implement React Error Boundaries at strategic levels (app, page, component)',
      'Create error recovery strategies and fallback UIs',
      'Add error logging and monitoring infrastructure',
      'Implement graceful degradation for feature failures',
      'Create user-friendly error messages and recovery actions',
      'Add error tracking analytics'
    ],
    success_criteria: [
      'Global error boundary catches all React errors',
      'Route-level boundaries prevent full app crashes',
      'Component-level boundaries for isolated failures',
      'Error monitoring dashboard operational',
      'User-friendly error messages throughout',
      'Recovery actions available for common errors'
    ],
    acceptance_criteria: [
      'Error boundaries implemented at 3+ levels',
      'Fallback UIs created for all error states',
      'Error logging integrated',
      'No white screens on component failures',
      'Error monitoring dashboard created',
      'User testing validates error UX'
    ],
    key_changes: [
      'Create GlobalErrorBoundary component wrapping App',
      'Add RouteErrorBoundary for each major route',
      'Implement ComponentErrorBoundary wrapper for critical features',
      'Build fallback UI components for different error types',
      'Add error logging service with structured logs',
      'Create error monitoring dashboard',
      'Implement retry and recovery mechanisms'
    ],
    technical_requirements: {
      components: ['GlobalErrorBoundary', 'RouteErrorBoundary', 'ComponentErrorBoundary'],
      monitoring: ['Error tracking service', 'Analytics integration', 'Error dashboard'],
      recovery: ['Retry mechanisms', 'Fallback UIs', 'Graceful degradation'],
      logging: ['Structured error logs', 'Stack traces', 'User context']
    },
    effort_estimate: {
      hours_min: 32,
      hours_max: 40,
      complexity: 'medium',
      risk: 'low'
    },
    dependencies: [],
    key_principles: [
      'Fail gracefully: Never show white screens to users',
      'User-actionable errors: Provide clear recovery actions',
      'Isolation: Component failures should not crash entire app',
      'Monitoring: Log all errors with context for debugging',
      'Progressive enhancement: Core features work even if secondary features fail'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      current_error_boundaries: 0,
      error_handling_patterns: 'inconsistent',
      user_impact: 'HIGH - App crashes expose white screens',
      related_files: [
        'src/App.tsx (needs global boundary)',
        'src/main.tsx (needs error tracking)',
        'All route components (need boundaries)'
      ],
      evidence: 'grep "Error Boundary" returns 0 files',
      ux_impact: 'CRITICAL - Poor error UX leads to user frustration and data loss'
    }
  },
  {
    id: 'SD-DATA-001',
    sd_key: 'SD-DATA-001',
    title: 'Missing Critical Database Tables - Schema Completion',
    version: '1.0',
    status: 'draft',
    category: 'data_architecture',
    priority: 'critical',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Create missing database tables that are referenced in application code but do not exist in the database. This includes analytics_exports, performance_cycle, synergy_opportunities, and unapplied migration schemas. Runtime errors occur when code attempts to query these tables.',
    rationale: 'Code references database tables that do not exist, causing runtime errors when users access features. Migration files exist but were never applied (exit-workflow-schema.sql, automation_learning_schema.sql). This creates a disconnect between codebase expectations and database reality, leading to feature failures and poor user experience.',
    scope: 'Create all missing database tables referenced in code (analytics_exports, performance_cycle, synergy_opportunities, exit workflows, automation learning), apply pending migrations, verify foreign key relationships and RLS policies, create performance indexes. EXCLUDES: Data migration from old schemas (start fresh), modifying existing working tables (only add new ones).',
    strategic_intent: 'Align database schema with application code expectations, eliminate runtime errors from missing tables, complete pending migrations to unlock blocked features. Establish database integrity and enable full feature set.',
    objectives: [
      'Create analytics_exports table for export-engine.ts',
      'Create performance_cycle table for Chairman Dashboard',
      'Create synergy_opportunities table for portfolio insights',
      'Apply exit-workflow-schema.sql migration',
      'Apply automation_learning_schema.sql migration',
      'Verify all table references in code have corresponding DB tables'
    ],
    success_criteria: [
      'All referenced tables exist in database',
      'Foreign key relationships properly defined',
      'RLS policies configured',
      'Indexes created for performance',
      'Migration scripts documented',
      'No runtime errors from missing tables'
    ],
    acceptance_criteria: [
      'analytics_exports table operational',
      'performance_cycle table operational',
      'synergy_opportunities table operational',
      'Exit workflow tables created',
      'Automation learning tables created',
      'All migrations applied successfully'
    ],
    technical_requirements: {
      tables: [
        'analytics_exports',
        'performance_cycle',
        'synergy_opportunities',
        'exit_workflows',
        'exit_workflow_steps',
        'automation_learning_*'
      ],
      migrations: [
        'database/migrations/exit-workflow-schema.sql',
        'database/schema/automation_learning_schema.sql',
        'Create analytics_exports migration',
        'Create chairman_analytics migration'
      ],
      relationships: ['Foreign keys to ventures', 'Foreign keys to companies', 'Cascade deletes'],
      security: ['RLS policies for multi-tenancy', 'Insert/update/delete permissions']
    },
    effort_estimate: {
      hours_min: 8,
      hours_max: 12,
      complexity: 'low',
      risk: 'low'
    },
    dependencies: [],
    key_changes: [
      'Create analytics_exports table with schema',
      'Create performance_cycle table for Chairman metrics',
      'Create synergy_opportunities table for portfolio analysis',
      'Apply exit-workflow-schema.sql migration',
      'Apply automation_learning_schema.sql migration',
      'Add RLS policies for all new tables',
      'Create indexes for performance'
    ],
    key_principles: [
      'Schema-code alignment: Database must match code expectations',
      'Migration-first: All schema changes via tracked migrations',
      'Security-by-default: RLS policies on all tables',
      'Performance-aware: Indexes on frequently queried columns',
      'Documentation: Comment all table purposes and relationships'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      missing_tables: [
        'analytics_exports (referenced in export-engine.ts:86)',
        'performance_cycle (referenced in useChairmanData.ts:112)',
        'synergy_opportunities (referenced in useChairmanData.ts:147)'
      ],
      unapplied_migrations: [
        'database/migrations/exit-workflow-schema.sql',
        'database/schema/automation_learning_schema.sql'
      ],
      related_code_files: [
        'src/lib/analytics/export-engine.ts',
        'src/hooks/useChairmanData.ts',
        'src/components/exit-strategy/*'
      ],
      evidence: 'Database queries exist but tables missing (grep analytics_exports database returns 0)',
      runtime_impact: 'CRITICAL - Features crash when activated'
    }
  },

  // ===== HIGH PRIORITY =====
  {
    id: 'SD-UX-001',
    sd_key: 'SD-UX-001',
    title: 'First-Run Experience & Onboarding Flow Integration',
    version: '1.0',
    status: 'draft',
    category: 'user_experience',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Connect fully-built FirstRunWizard (269 LOC) to application entry point and create comprehensive onboarding experience. Currently, new users land in an empty application with no guidance, causing confusion and poor first impressions.',
    rationale: 'FirstRunWizard component exists (269 LOC) but is never imported or used. New users see empty dashboard with no data or guidance, leading to confusion and poor first impressions. Onboarding experience is critical for user activation and product adoption. Component is complete but disconnected from application flow.',
    scope: 'Integrate existing FirstRunWizard into App.tsx, create empty state detection logic, build demo data seeding workflow, add product tour for feature discovery, implement onboarding progress tracking and user preference persistence. EXCLUDES: Redesigning FirstRunWizard (already built), creating new onboarding content (use existing), advanced personalization (start with basic preferences).',
    strategic_intent: 'Transform first-run experience from confusing empty state into guided, welcoming onboarding that helps users understand the product and get started quickly. Activate existing 269 LOC investment in FirstRunWizard component.',
    objectives: [
      'Integrate FirstRunWizard into App.tsx',
      'Create empty state detection and handling',
      'Implement demo data seeding workflow',
      'Add guided product tour for key features',
      'Create onboarding progress tracking',
      'Implement user preference persistence'
    ],
    success_criteria: [
      'FirstRunWizard displays for new users',
      'Demo mode creates sample data successfully',
      'Clean mode provides guided empty state',
      'Product tour highlights key features',
      'User preferences saved and respected',
      'Onboarding completion tracked'
    ],
    acceptance_criteria: [
      'FirstRunWizard renders on first visit',
      'Demo data generation works correctly',
      'Empty state UI provides clear guidance',
      'Product tour is comprehensive',
      'User can skip or complete onboarding',
      'Preferences persist across sessions'
    ],
    technical_requirements: {
      components: ['FirstRunWizard (exists)', 'EmptyStateGuide', 'ProductTour', 'ProgressTracker'],
      data: ['Demo data generator', 'Sample ventures', 'Sample companies', 'Mock metrics'],
      storage: ['LocalStorage for preferences', 'Database for completion status'],
      integration: ['App.tsx entry point', 'Route guards', 'Feature flags']
    },
    effort_estimate: {
      hours_min: 16,
      hours_max: 20,
      complexity: 'medium',
      risk: 'low'
    },
    dependencies: [],
    key_changes: [
      'Add FirstRunWizard import to App.tsx',
      'Create empty state detection logic',
      'Build demo data seeding service',
      'Implement product tour component',
      'Add onboarding progress tracking',
      'Create user preference storage',
      'Add route guards for onboarding flow'
    ],
    key_principles: [
      'Use existing component: Leverage 269 LOC FirstRunWizard investment',
      'Progressive disclosure: Don\'t overwhelm new users',
      'Demo mode option: Let users explore with sample data',
      'Skippable steps: Don\'t force lengthy onboarding',
      'Persistent preferences: Remember user choices'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      existing_component_loc: 269,
      current_imports: 0,
      feature_flag: 'VITE_ENABLE_FIRST_RUN_WIZARD (defined in .env)',
      related_files: [
        'src/components/onboarding/FirstRunWizard.tsx (exists but unused)',
        'src/data/mockVentures.ts (demo data generator)',
        'src/App.tsx (needs integration)'
      ],
      evidence: 'grep "import.*FirstRunWizard" returns 0 results',
      user_impact: 'HIGH - Poor first impression, user confusion, high bounce rate'
    }
  },
  {
    id: 'SD-EXPORT-001',
    sd_key: 'SD-EXPORT-001',
    title: 'Analytics Export Engine UI & Integration',
    version: '1.0',
    status: 'draft',
    category: 'feature_integration',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    priority: 'high',
    description: 'Create user interface for fully-built Analytics Export Engine (609 LOC) supporting PDF, Excel, CSV, and JSON exports with scheduling capabilities. The export engine is complete but has zero UI access, making it completely inaccessible to users.',
    rationale: 'Export engine exists (609 LOC) with PDF, Excel, CSV, JSON support and scheduling capabilities, but has zero UI components. Users cannot access this functionality. Chairman Dashboard has "Export" button that does nothing. This represents 609 LOC of wasted investment and missing user value. UI integration needed to activate existing backend capability.',
    scope: 'Create export configuration UI, report scheduling interface, export history viewer, download manager, and preview functionality. Integrate with Chairman Dashboard and Analytics views. Connect to existing 609 LOC export-engine.ts. EXCLUDES: Rewriting export engine (use existing), adding new export formats (PDF/Excel/CSV/JSON sufficient), advanced customization (basic branding only).',
    strategic_intent: 'Unlock existing 609 LOC export engine investment by creating user-accessible UI. Enable Chairman to generate and schedule reports in multiple formats. Transform unused backend capability into valuable user feature.',
    objectives: [
      'Create export configuration interface',
      'Add report scheduling UI',
      'Integrate with Chairman Dashboard export buttons',
      'Create export history and download manager',
      'Add export preview functionality',
      'Implement scheduled export management'
    ],
    success_criteria: [
      'Export configuration UI operational',
      'Users can export reports in 4 formats',
      'Scheduling interface allows recurring exports',
      'Export history shows past exports',
      'Download manager handles file retrieval',
      'Preview shows export before generation'
    ],
    acceptance_criteria: [
      'Export button in Chairman Dashboard functional',
      'Configuration modal allows format/metric selection',
      'Scheduled exports can be created and managed',
      'Export history displays correctly',
      'Downloads work for all formats',
      'Preview accurately represents final export'
    ],
    technical_requirements: {
      ui_components: ['ExportConfigDialog', 'ExportScheduler', 'ExportHistory', 'DownloadManager'],
      integrations: [
        'Chairman Dashboard export button',
        'Analytics Dashboard',
        'Portfolio views',
        'Venture detail pages'
      ],
      formats: ['PDF (via Puppeteer)', 'Excel (via XLSX)', 'CSV', 'JSON'],
      features: ['Custom date ranges', 'Metric selection', 'Branding options', 'Chart inclusion']
    },
    effort_estimate: {
      hours_min: 24,
      hours_max: 32,
      complexity: 'medium',
      risk: 'low'
    },
    dependencies: ['SD-DATA-001 (analytics_exports table)'],
    key_changes: [
      'Create ExportConfigDialog component',
      'Build ExportScheduler for recurring exports',
      'Add ExportHistory table component',
      'Implement DownloadManager service',
      'Connect Chairman Dashboard export button',
      'Add export preview functionality',
      'Create scheduled export management UI'
    ],
    key_principles: [
      'Leverage existing engine: Reuse 609 LOC export-engine.ts',
      'Progressive enhancement: Start with manual exports, add scheduling later',
      'Format flexibility: Support PDF, Excel, CSV, JSON',
      'User control: Preview before generating, manage scheduled exports',
      'Performance: Async export generation with progress indicators'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      backend_loc: 609,
      backend_file: 'src/lib/analytics/export-engine.ts',
      current_imports: 0,
      capabilities: [
        'PDF reports with charts',
        'Excel multi-sheet workbooks',
        'CSV data exports',
        'JSON API exports',
        'Scheduled recurring exports',
        'Custom report templates'
      ],
      integration_points: [
        'ChairmanDashboard.tsx:189-202 (TODO buttons)',
        'Analytics dashboards',
        'Portfolio summaries'
      ],
      evidence: 'grep "import.*export-engine" returns 0 results',
      business_value: 'HIGH - Executive reporting, compliance, data portability'
    }
  },
  {
    id: 'SD-ACCESSIBILITY-001',
    sd_key: 'SD-ACCESSIBILITY-001',
    title: 'WCAG 2.1 AA Compliance & Accessibility Enhancement',
    version: '1.0',
    status: 'draft',
    category: 'accessibility',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Achieve comprehensive WCAG 2.1 Level AA compliance and implement systematic accessibility features. While 182 aria attributes exist, there is no comprehensive accessibility strategy, risking legal compliance issues and excluding users with disabilities.',
    rationale: 'Application has 182 aria attributes showing some accessibility awareness, but no systematic strategy or testing. Lack of WCAG 2.1 AA compliance creates legal risk (ADA lawsuits) and excludes users with disabilities. Enterprise customers increasingly require accessibility compliance. Piecemeal aria attributes insufficient without comprehensive keyboard navigation, screen reader optimization, and automated testing.',
    scope: 'Conduct comprehensive WCAG 2.1 AA compliance audit, implement keyboard navigation for all features, add screen reader optimizations, create high-contrast and reduced-motion modes, build focus management system, integrate accessibility testing in CI/CD. EXCLUDES: AAA compliance (target AA first), mobile-specific a11y (web focus), extensive customization (standard modes only).',
    strategic_intent: 'Transform EHG from accessibility-aware (182 aria attributes) to accessibility-compliant (WCAG 2.1 AA). Mitigate legal risk, expand addressable market to users with disabilities, meet enterprise compliance requirements, and demonstrate inclusive design commitment.',
    objectives: [
      'Complete WCAG 2.1 AA compliance audit',
      'Implement comprehensive keyboard navigation',
      'Add screen reader optimizations throughout',
      'Create high-contrast and reduced-motion modes',
      'Implement focus management system',
      'Add accessibility testing to CI/CD'
    ],
    success_criteria: [
      'WCAG 2.1 AA compliance achieved',
      'All features keyboard-accessible',
      'Screen reader compatibility verified',
      'Color contrast meets standards',
      'Focus indicators visible throughout',
      'Automated a11y tests in CI/CD'
    ],
    acceptance_criteria: [
      'axe-core reports zero critical issues',
      'Keyboard navigation works for all flows',
      'Screen reader testing passes',
      'Color contrast ratio ≥4.5:1',
      'Focus trapping works correctly',
      'A11y tests run on every PR'
    ],
    technical_requirements: {
      tools: ['@axe-core/react', 'axe-playwright', 'Pa11y', 'WAVE'],
      patterns: [
        'Semantic HTML throughout',
        'ARIA labels and descriptions',
        'Focus management',
        'Keyboard shortcuts',
        'Screen reader announcements'
      ],
      testing: ['Automated a11y tests', 'Manual screen reader testing', 'Keyboard-only testing'],
      compliance: ['WCAG 2.1 Level AA', 'Section 508', 'ADA compliance']
    },
    effort_estimate: {
      hours_min: 40,
      hours_max: 50,
      complexity: 'medium',
      risk: 'medium'
    },
    dependencies: [],
    key_changes: [
      'Run comprehensive WCAG 2.1 AA audit',
      'Implement keyboard navigation for all interactive elements',
      'Add screen reader live regions and announcements',
      'Create high-contrast theme mode',
      'Implement reduced-motion preferences',
      'Build focus management utilities',
      'Integrate axe-core testing in CI/CD pipeline'
    ],
    key_principles: [
      'Inclusive by default: Accessibility is not optional',
      'Keyboard-first: All features accessible without mouse',
      'Screen reader optimization: ARIA used correctly and systematically',
      'Automated testing: Catch regressions in CI/CD',
      'Legal compliance: Meet ADA and WCAG 2.1 AA requirements'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      current_aria_count: 182,
      contexts_exist: ['AccessibilityContext.tsx', 'EVAContext.tsx'],
      playwright_a11y: 'Configured (@axe-core/playwright installed)',
      compliance_gaps: [
        'Inconsistent keyboard navigation',
        'Missing focus indicators',
        'Incomplete ARIA labeling',
        'No screen reader optimization',
        'Color contrast issues'
      ],
      related_files: [
        'src/contexts/AccessibilityContext.tsx',
        'tests/a11y/* (infrastructure exists)',
        'playwright.config.ts'
      ],
      evidence: 'grep accessibility returns 182 instances, but no systematic implementation',
      legal_risk: 'MEDIUM - ADA compliance required for enterprise customers'
    }
  },
  {
    id: 'SD-REALTIME-001',
    sd_key: 'SD-REALTIME-001',
    title: 'Real-time Data Synchronization & Collaborative Features',
    version: '1.0',
    status: 'draft',
    category: 'feature_enhancement',
    priority: 'high',
    target_application: 'EHG',
    current_phase: 'IDEATION',
    description: 'Implement systematic real-time data synchronization across all data tables and add collaborative editing features. Currently, real-time capabilities exist but are inconsistently applied, resulting in stale data and poor collaborative UX.',
    rationale: 'Application built on Supabase with real-time capabilities, but subscriptions applied inconsistently across tables. Users see stale data until manual refresh. Multi-user scenarios have no presence indicators or conflict resolution. Real-time infrastructure exists but not systematically leveraged. Enterprise collaboration requires real-time sync and presence awareness.',
    scope: 'Implement real-time subscriptions for all critical data tables, add optimistic updates for responsiveness, create presence indicators showing who is viewing/editing, build collaborative editing with conflict resolution, add real-time notifications for data changes, create activity feed. EXCLUDES: Operational transform (use last-write-wins with notifications), video/voice collaboration (separate feature), mobile offline sync (web focus first).',
    strategic_intent: 'Transform EHG from refresh-required application into truly real-time collaborative platform. Leverage Supabase real-time infrastructure systematically across all tables. Enable multi-user collaboration with presence awareness and conflict resolution. Improve UX with instant updates and optimistic UI.',
    objectives: [
      'Implement real-time subscriptions for all data tables',
      'Add optimistic updates for better UX',
      'Create presence indicators (who\'s viewing/editing)',
      'Implement collaborative editing with conflict resolution',
      'Add real-time notifications for data changes',
      'Create real-time activity feed'
    ],
    success_criteria: [
      'Real-time sync operational for all tables',
      'Optimistic updates implemented',
      'Presence system shows active users',
      'Collaborative editing works smoothly',
      'Real-time notifications functional',
      'Activity feed shows live updates'
    ],
    acceptance_criteria: [
      'Supabase subscriptions configured',
      'All data mutations trigger updates',
      'Presence indicators visible',
      'Conflict resolution handles simultaneous edits',
      'Notifications appear in real-time',
      'Activity feed updates live'
    ],
    technical_requirements: {
      subscriptions: [
        'Ventures table',
        'Companies table',
        'Stage progression',
        'Chairman feedback',
        'Analytics events'
      ],
      features: [
        'Optimistic updates',
        'Presence tracking',
        'Collaborative editing',
        'Conflict resolution',
        'Real-time notifications',
        'Live activity feed'
      ],
      infrastructure: ['Supabase Realtime', 'WebSocket connections', 'State management'],
      patterns: ['Subscription management', 'Cleanup on unmount', 'Error handling']
    },
    effort_estimate: {
      hours_min: 56,
      hours_max: 70,
      complexity: 'high',
      risk: 'medium'
    },
    dependencies: [],
    key_changes: [
      'Add Supabase real-time subscriptions to all data tables',
      'Implement optimistic update patterns in React hooks',
      'Create presence tracking system with Supabase presence',
      'Build collaborative editing with last-write-wins + notifications',
      'Add real-time notification system',
      'Create live activity feed component',
      'Implement connection state management'
    ],
    key_principles: [
      'Leverage Supabase real-time: Use built-in capabilities',
      'Optimistic UI: Update immediately, reconcile async',
      'Graceful degradation: Work without real-time if connection fails',
      'Conflict notification: Alert users to simultaneous edits',
      'Performance-aware: Batch updates, debounce high-frequency changes'
    ],
    created_by: 'INFRASTRUCTURE_AUDIT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      realtime_files: 10,
      subscription_pattern: 'Inconsistent implementation',
      supabase_realtime: 'Available and configured',
      current_implementations: [
        'src/lib/voice/real-time-voice-service.ts',
        'src/components/feedback-loops/RealTimeFeedbackCollection.tsx',
        'Limited table subscriptions'
      ],
      gaps: [
        'No systematic subscription strategy',
        'Inconsistent optimistic updates',
        'No presence system',
        'No collaborative editing',
        'Limited real-time notifications'
      ],
      evidence: 'grep realtime returns 10 files with partial implementation',
      ux_impact: 'MEDIUM - Stale data, poor collaboration, missed updates'
    }
  }
];

async function insertStrategicDirectives() {
  console.log('🚀 Creating Infrastructure & Quality Strategic Directives');
  console.log('='.repeat(70));
  console.log('📊 Foundational Quality & UX Enhancement SDs');
  console.log('='.repeat(70));
  console.log(`Total SDs to create: ${strategicDirectives.length}`);
  console.log('');
  console.log('🔍 Categories:');
  console.log('   CRITICAL (3): Test Coverage, Error Handling, Database Tables');
  console.log('   HIGH (4): Onboarding UX, Export Engine, Accessibility, Real-time');
  console.log('');
  console.log('📈 Impact:');
  console.log('   - Establishes quality foundation for all 18 reconnection SDs');
  console.log('   - Prevents runtime errors and production issues');
  console.log('   - Improves user experience and first impressions');
  console.log('   - Ensures legal compliance (accessibility)');
  console.log('='.repeat(70));
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (const sd of strategicDirectives) {
    try {
      console.log(`📋 Inserting ${sd.id}: ${sd.title}...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert({
          id: sd.id,
          title: sd.title,
          version: sd.version,
          status: sd.status,
          category: sd.category,
          priority: sd.priority,
          description: sd.description,
          objectives: sd.objectives,
          success_criteria: sd.success_criteria,
          acceptance_criteria: sd.acceptance_criteria,
          technical_requirements: sd.technical_requirements,
          effort_estimate: sd.effort_estimate,
          dependencies: sd.dependencies,
          metadata: sd.metadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (error) {
        console.error(`   ❌ Error inserting ${sd.id}:`, error.message);
        errorCount++;
      } else {
        console.log(`   ✅ ${sd.id} created successfully!`);
        console.log(`      Priority: ${sd.priority.toUpperCase()}`);
        console.log(`      Category: ${sd.category}`);
        console.log(`      Effort: ${sd.effort_estimate.hours_min}-${sd.effort_estimate.hours_max}h`);
        console.log('');
        successCount++;
      }
    } catch (error) {
      console.error(`   ❌ Unexpected error with ${sd.id}:`, error.message);
      errorCount++;
    }
  }

  console.log('='.repeat(70));
  console.log('✅ Strategic Directives Creation Complete!');
  console.log('='.repeat(70));
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Infrastructure & Quality SDs: ${successCount}`);
  console.log(`   Critical: ${strategicDirectives.filter(sd => sd.priority === 'critical').length}`);
  console.log(`   High: ${strategicDirectives.filter(sd => sd.priority === 'high').length}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('');
  console.log('📈 Complete Initiative Status:');
  console.log('   Reconnection SDs: 15 (backends without UI)');
  console.log('   Backend SDs: 3 (UIs without backends)');
  console.log('   Infrastructure & Quality SDs: 7 (NEW)');
  console.log('   TOTAL INITIATIVE: 25 Strategic Directives');
  console.log('');
  console.log('🎯 Recommended Execution Order:');
  console.log('   1. SD-DATA-001 (Database Tables - 8-12h) ⚡ QUICK WIN');
  console.log('   2. SD-RELIABILITY-001 (Error Boundaries - 32-40h)');
  console.log('   3. SD-QUALITY-001 (Test Infrastructure - 160-200h)');
  console.log('   4. SD-UX-001 (Onboarding - 16-20h)');
  console.log('   5. SD-EXPORT-001 (Export Engine UI - 24-32h)');
  console.log('   6. SD-ACCESSIBILITY-001 (WCAG Compliance - 40-50h)');
  console.log('   7. SD-REALTIME-001 (Real-time Sync - 56-70h)');
  console.log('   Then: Execute 18 reconnection/backend SDs');
  console.log('');
  console.log('💡 Total Effort Estimate: 336-424 hours (Infrastructure) + 1100-1400h (Reconnection)');
  console.log('💰 Total Value Unlock: $1.13M-$2.02M in hidden development');
  console.log('');
  console.log('⚠️ CRITICAL: Infrastructure SDs provide foundation for successful reconnection!');
  console.log('');
}

insertStrategicDirectives().catch(console.error);
