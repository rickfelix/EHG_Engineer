#!/usr/bin/env node

/**
 * Create Infrastructure & Quality Strategic Directives (CORRECTED SCHEMA)
 *
 * This script creates 7 new Strategic Directives addressing critical gaps not covered
 * by the 18 existing reconnection/backend SDs:
 * - Test Coverage (CRITICAL)
 * - Error Handling (CRITICAL)
 * - Database Tables (CRITICAL)
 * - Onboarding UX (HIGH)
 * - Export Engine (HIGH)
 * - Accessibility (HIGH)
 * - Real-time Features (HIGH)
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
    title: 'Zero Test Coverage Crisis - Comprehensive Testing Infrastructure',
    version: '1.0',
    status: 'draft',
    category: 'quality_assurance',
    priority: 'critical',
    description: 'Establish comprehensive testing infrastructure and achieve minimum 50% code coverage. The EHG application has 362,538 lines of code with ZERO unit or integration tests, representing a critical quality and reliability gap.',
    strategic_intent: 'Build foundational quality assurance infrastructure to enable confident refactoring, prevent regressions, and ensure code correctness. Testing is prerequisite for executing the 18 reconnection/backend SDs safely.',
    rationale: 'Complete absence of automated testing means no verification of correctness, no regression prevention, and high risk for production issues. Vitest is configured but unused. This blocks safe execution of all other SDs.',
    scope: 'Create test infrastructure for unit, integration, and E2E testing. Implement tests for critical business logic, workflows, and user journeys. Establish coverage reporting and CI/CD integration.',
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
    key_principles: [
      'Test critical paths first, then expand coverage',
      'Integration tests validate workflows end-to-end',
      'Fast feedback loop with watch mode',
      'CI/CD gates prevent untested code merges',
      'Documentation enables team adoption'
    ],
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
      quality_impact: 'CRITICAL - No verification of correctness, no regression prevention',
      effort_hours: '160-200',
      complexity: 'high',
      risk: 'medium'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-RELIABILITY-001',
    title: 'Error Boundary & Error Handling Infrastructure',
    version: '1.0',
    status: 'draft',
    category: 'reliability',
    priority: 'critical',
    description: 'Implement comprehensive error handling infrastructure including React Error Boundaries, global error recovery, graceful degradation, and error monitoring. Currently, unhandled errors crash the entire application, exposing users to white screens.',
    strategic_intent: 'Ensure application reliability by preventing crashes, implementing graceful error recovery, and providing user-friendly error experiences. Error boundaries are prerequisite for safe feature deployment.',
    rationale: 'Zero error boundaries means any component error crashes the entire app, exposing users to white screens and potential data loss. This creates poor UX and prevents safe deployment of complex features.',
    scope: 'Implement React Error Boundaries at strategic levels (app, page, component). Create error recovery strategies and fallback UIs. Add error logging and monitoring infrastructure.',
    strategic_objectives: [
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
    key_changes: [
      'Create GlobalErrorBoundary component',
      'Add RouteErrorBoundary for each route',
      'Implement ComponentErrorBoundary wrapper',
      'Integrate error tracking service',
      'Build error monitoring dashboard',
      'Add user-friendly error messages'
    ],
    key_principles: [
      'Fail gracefully, never show white screen',
      'Provide clear error messages and recovery options',
      'Log all errors for monitoring and debugging',
      'Isolate failures to prevent cascade',
      'Test error states as part of QA'
    ],
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
      ux_impact: 'CRITICAL - Poor error UX leads to user frustration and data loss',
      effort_hours: '32-40',
      complexity: 'medium',
      risk: 'low'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-DATA-001',
    title: 'Missing Critical Database Tables - Schema Completion',
    version: '1.0',
    status: 'draft',
    category: 'data_architecture',
    priority: 'critical',
    description: 'Create missing database tables that are referenced in application code but do not exist in the database. Includes analytics_exports, performance_cycle, synergy_opportunities, and unapplied migration schemas. Runtime errors occur when code attempts to query these tables.',
    strategic_intent: 'Eliminate runtime database errors by ensuring all code references have corresponding database tables. This is prerequisite for activating analytics, chairman dashboard, and automation features.',
    rationale: 'Code references tables that don\'t exist (analytics_exports, performance_cycle, synergy_opportunities), causing runtime errors when features are activated. Multiple migration files exist but haven\'t been applied.',
    scope: 'Create all missing database tables, apply unapplied migrations, verify foreign key relationships, configure RLS policies, and validate table accessibility.',
    strategic_objectives: [
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
    key_changes: [
      'Create analytics_exports table migration',
      'Create chairman_analytics tables migration',
      'Apply exit-workflow-schema.sql',
      'Apply automation_learning_schema.sql',
      'Configure RLS policies',
      'Create performance indexes'
    ],
    key_principles: [
      'Schema matches code expectations exactly',
      'RLS policies enforce multi-tenancy',
      'Indexes optimize query performance',
      'Foreign keys ensure referential integrity',
      'Migrations are idempotent and reversible'
    ],
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
      evidence: 'Database queries exist but tables missing',
      runtime_impact: 'CRITICAL - Features crash when activated',
      effort_hours: '8-12',
      complexity: 'low',
      risk: 'low'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },

  // ===== HIGH PRIORITY =====
  {
    id: 'SD-UX-001',
    title: 'First-Run Experience & Onboarding Flow Integration',
    version: '1.0',
    status: 'draft',
    category: 'user_experience',
    priority: 'high',
    description: 'Connect fully-built FirstRunWizard (269 LOC) to application entry point and create comprehensive onboarding experience. Currently, new users land in an empty application with no guidance, causing confusion and poor first impressions.',
    strategic_intent: 'Improve user activation and retention by providing guided onboarding experience for new users. FirstRunWizard is production-ready but never rendered.',
    rationale: 'FirstRunWizard component is complete with demo data generation and empty state handling, but has zero imports, meaning new users receive no onboarding guidance. This creates poor first impressions and user confusion.',
    scope: 'Integrate FirstRunWizard into App.tsx, create empty state detection and handling, implement demo data seeding workflow, add guided product tour.',
    strategic_objectives: [
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
    key_changes: [
      'Add FirstRunWizard to App.tsx',
      'Create empty state detection logic',
      'Connect demo data generator',
      'Build product tour component',
      'Add preference storage',
      'Track onboarding completion'
    ],
    key_principles: [
      'First impression sets user expectation',
      'Demo data showcases capabilities',
      'Users control their experience',
      'Progressive disclosure of features',
      'Onboarding is skippable'
    ],
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
      user_impact: 'HIGH - Poor first impression, user confusion, high bounce rate',
      effort_hours: '16-20',
      complexity: 'medium',
      risk: 'low'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-EXPORT-001',
    title: 'Analytics Export Engine UI & Integration',
    version: '1.0',
    status: 'draft',
    category: 'feature_integration',
    priority: 'high',
    description: 'Create user interface for fully-built Analytics Export Engine (609 LOC) supporting PDF, Excel, CSV, and JSON exports with scheduling capabilities. The export engine is complete but has zero UI access.',
    strategic_intent: 'Enable executive reporting and data portability by exposing analytics export capabilities. Export engine is production-ready but completely inaccessible.',
    rationale: 'Analytics Export Engine (609 LOC) supports PDF/Excel/CSV/JSON exports with scheduling, but has zero imports. Chairman Dashboard has "Export Report" buttons that do nothing.',
    scope: 'Create export configuration interface, add report scheduling UI, integrate with Chairman Dashboard, create export history and download manager.',
    strategic_objectives: [
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
    key_changes: [
      'Create ExportConfigDialog component',
      'Build ExportScheduler interface',
      'Add ExportHistory component',
      'Create DownloadManager',
      'Connect Chairman Dashboard buttons',
      'Add export preview modal'
    ],
    key_principles: [
      'Configuration is intuitive and flexible',
      'Exports are high-quality and professional',
      'Scheduling empowers automation',
      'History provides transparency',
      'Preview prevents surprises'
    ],
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
      business_value: 'HIGH - Executive reporting, compliance, data portability',
      dependencies: ['SD-DATA-001 (analytics_exports table)'],
      effort_hours: '24-32',
      complexity: 'medium',
      risk: 'low'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-ACCESSIBILITY-001',
    title: 'WCAG 2.1 AA Compliance & Accessibility Enhancement',
    version: '1.0',
    status: 'draft',
    category: 'accessibility',
    priority: 'high',
    description: 'Achieve comprehensive WCAG 2.1 Level AA compliance and implement systematic accessibility features. While 182 aria attributes exist, there is no comprehensive accessibility strategy, risking legal compliance issues.',
    strategic_intent: 'Ensure legal compliance and inclusive design by achieving WCAG 2.1 AA standard. Accessibility is both legal requirement and moral imperative for enterprise software.',
    rationale: '182 aria attributes exist but no comprehensive strategy. No systematic keyboard navigation, inconsistent screen reader support, and potential ADA compliance issues for enterprise customers.',
    scope: 'Complete WCAG 2.1 AA compliance audit, implement comprehensive keyboard navigation, add screen reader optimizations, create accessibility testing process.',
    strategic_objectives: [
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
    key_changes: [
      'Run axe-core compliance audit',
      'Implement keyboard navigation',
      'Add screen reader labels',
      'Fix color contrast issues',
      'Add focus indicators',
      'Integrate a11y tests in CI/CD'
    ],
    key_principles: [
      'Accessibility is not optional',
      'Design inclusively from start',
      'Test with real assistive technology',
      'Automate compliance verification',
      'Document accessibility patterns'
    ],
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
      legal_risk: 'MEDIUM - ADA compliance required for enterprise customers',
      effort_hours: '40-50',
      complexity: 'medium',
      risk: 'medium'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'SD-REALTIME-001',
    title: 'Real-time Data Synchronization & Collaborative Features',
    version: '1.0',
    status: 'draft',
    category: 'feature_enhancement',
    priority: 'high',
    description: 'Implement systematic real-time data synchronization across all data tables and add collaborative editing features. Currently, real-time capabilities exist but are inconsistently applied, resulting in stale data.',
    strategic_intent: 'Enable true collaboration and real-time responsiveness by implementing systematic data synchronization. Supabase Realtime is configured but underutilized.',
    rationale: 'Real-time voice service and some subscriptions exist (10 files), but no systematic implementation. Users see stale data, missed updates, and poor collaborative UX.',
    scope: 'Implement real-time subscriptions for all data tables, add optimistic updates, create presence indicators, implement collaborative editing with conflict resolution.',
    strategic_objectives: [
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
    key_changes: [
      'Create subscription management system',
      'Implement optimistic update patterns',
      'Build presence tracking',
      'Add collaborative editing',
      'Create real-time notifications',
      'Build live activity feed'
    ],
    key_principles: [
      'Real-time enhances collaboration',
      'Optimistic updates improve perceived performance',
      'Presence awareness prevents conflicts',
      'Subscriptions are managed and cleaned up',
      'Offline support maintains functionality'
    ],
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
      ux_impact: 'MEDIUM - Stale data, poor collaboration, missed updates',
      effort_hours: '56-70',
      complexity: 'high',
      risk: 'medium'
    },
    created_by: 'INFRASTRUCTURE_AUDIT_2025',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

async function insertStrategicDirectives() {
  console.log('🚀 Creating Infrastructure & Quality Strategic Directives');
  console.log('='.repeat(70));
  console.log(`Total SDs to create: ${strategicDirectives.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const sd of strategicDirectives) {
    try {
      console.log(`📋 Inserting ${sd.id}: ${sd.title}...`);

      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert({
          id: sd.id,
          title: sd.title,
          version: sd.version,
          status: sd.status,
          category: sd.category,
          priority: sd.priority,
          description: sd.description,
          strategic_intent: sd.strategic_intent,
          rationale: sd.rationale,
          scope: sd.scope,
          strategic_objectives: sd.strategic_objectives,
          success_criteria: sd.success_criteria,
          key_changes: sd.key_changes,
          key_principles: sd.key_principles,
          metadata: sd.metadata,
          created_by: sd.created_by,
          created_at: sd.created_at,
          updated_at: sd.updated_at
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (error) {
        console.error('   ❌ Error:', error.message);
        errorCount++;
      } else {
        console.log('   ✅ Created successfully!');
        successCount++;
      }
    } catch (error) {
      console.error('   ❌ Unexpected error:', error.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary:');
  console.log(`   Success: ${successCount}/${strategicDirectives.length}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('\n🎯 TOTAL INITIATIVE: 25 Strategic Directives');
  console.log('   - Reconnection SDs: 15 (backends without UI)');
  console.log('   - Backend SDs: 3 (UIs without backends)');
  console.log('   - Infrastructure SDs: 7 (NEW - quality foundation)');
  console.log('='.repeat(70));
}

insertStrategicDirectives().catch(console.error);
