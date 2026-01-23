#!/usr/bin/env node

/**
 * Create PRD for SD-GENESIS-INTAKE-001
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { randomUUID } from 'crypto';

async function createPRD() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('📋 Creating PRD for SD-GENESIS-INTAKE-001...\n');

    const existingResult = await client.query(`
      SELECT id, title, status FROM prds WHERE sd_id = $1
    `, ['SD-GENESIS-INTAKE-001']);

    const prdId = existingResult.rows.length > 0 ? existingResult.rows[0].id : randomUUID();

    const functionalRequirements = [
      'Multi-step wizard (Welcome, Venture Idea, Market Info, Fit Assessment, Results)',
      'Form validation with inline feedback and toast notifications',
      'Auto-save draft functionality with resume capability',
      'Real-time fit gate scoring with visual progress indicators',
      'Multi-criteria evaluation (market opportunity, team capability, product differentiation, financial viability, strategic fit, execution readiness)',
      'Weighted scoring algorithm with configurable thresholds (pass: 70+, conditional: 50-69, fail: <50)',
      'Organization-scoped submissions with role-based access (submitter, evaluator, admin)',
      'Version tracking for re-evaluations and historical edits',
      'Evaluator dashboard with submission queue and scoring interface',
      'Export and reporting capabilities for submission analytics'
    ];

    const nonFunctionalRequirements = [
      'WCAG 2.1 AA accessibility compliance (keyboard navigation, screen reader support, color contrast)',
      'Mobile-first responsive design (breakpoints: 640px, 768px, 1024px, 1280px)',
      'Query performance <50ms for user submissions, <100ms for organization dashboard',
      'Component sizing within 300-600 LOC optimal range',
      'Touch target sizing ≥44x44px for mobile',
      'Support for 10,000+ submissions with GIN indexes on JSONB columns'
    ];

    const acceptanceCriteria = [
      'User can complete intake wizard from welcome to results in <5 minutes',
      'Draft submissions auto-save every 30 seconds without data loss',
      'Fit gate score calculates within 2 seconds of form submission',
      'Evaluators can score submissions with pass/fail/conditional outcomes',
      'Users can only view/edit submissions from their organization (RLS enforced)',
      'Submission numbers auto-generate in INT-YYYY-NNN format without duplicates',
      'All UI components pass WCAG 2.1 AA automated accessibility testing',
      'E2E tests cover wizard navigation, conditional rendering, and score display',
      'Database migration executes without errors in transaction test',
      'Schema documentation auto-generates after migration with accurate table/column descriptions'
    ];

    // File references in metadata
    const metadata = {
      design_analysis_file: 'docs/design-analysis/SD-GENESIS-INTAKE-001-DESIGN.md',
      database_analysis_file: 'docs/database-analysis-SD-GENESIS-INTAKE-001.md',
      migration_file: 'database/migrations/029_asset_factory_intake_and_fit_gate.sql',
      components: [
        { name: 'IntakeWizardContainer', loc: 450, purpose: 'Orchestration and state management' },
        { name: 'IntakeFormSteps', loc: 500, purpose: 'Individual step forms' },
        { name: 'FitGateScoring', loc: 400, purpose: 'Scoring logic and visualization' }
      ],
      referenced_patterns: [
        { file: 'FirstRunWizard.tsx', loc: 570, pattern: 'Multi-step wizard' },
        { file: 'ProgressStepper.tsx', loc: 238, pattern: 'Progress indicator with keyboard nav' },
        { file: 'AccessibilityProvider.tsx', loc: 531, pattern: 'Screen reader support' }
      ],
      database_tables: [
        { name: 'intake_submissions', features: ['JSONB responses', 'multi-tenant', 'version tracking'] },
        { name: 'fit_gate_scores', features: ['weighted scoring', 'evaluator tracking', 'qualitative assessment'] },
        { name: 'user_organizations', features: ['RLS foundation', 'role-based access'] }
      ],
      rls_policies: 9,
      triggers: 4,
      helper_views: 2
    };

    const systemArchitecture = `## Frontend Architecture
- React wizard using Shadcn UI components
- 3 components totaling ~1,350 LOC (IntakeWizardContainer: 450 LOC, IntakeFormSteps: 500 LOC, FitGateScoring: 400 LOC)
- ProgressStepper pattern from FirstRunWizard.tsx for navigation
- WCAG 2.1 AA accessibility (keyboard nav, screen reader, color contrast)
- Mobile-first responsive design with Tailwind breakpoints

## Backend Architecture
- Database: intake_submissions table (JSONB responses, version tracking)
- Scoring: fit_gate_scores table (multi-criteria weighted scoring)
- Security: 9 RLS policies for multi-tenant isolation
- Automation: 4 triggers (updated_at, submitted_at, evaluated_at, submission_number)
- Reporting: 2 helper views (v_intake_submissions_with_scores, v_fit_gate_statistics)
- Performance: GIN indexes on JSONB columns, query targets <50ms`;

    const implementationApproach = `## DESIGN Analysis Reference
See: docs/design-analysis/SD-GENESIS-INTAKE-001-DESIGN.md
- Component architecture with proven patterns (FirstRunWizard, ProgressStepper, AccessibilityProvider)
- Responsive design using existing Tailwind breakpoints and design tokens
- Accessibility patterns include keyboard navigation, screen reader support, ARIA labels
- Risk mitigations for conditional rendering in E2E tests (waitForSelector pattern)
- Dev server hot reload protocol, scope estimation awareness (10x pattern)

## DATABASE Analysis Reference
See: docs/database-analysis-SD-GENESIS-INTAKE-001.md
Migration file: database/migrations/029_asset_factory_intake_and_fit_gate.sql

Tables:
1. intake_submissions - Multi-step wizard responses with JSONB structure, multi-tenant scoping, version tracking
2. fit_gate_scores - Multi-criteria weighted scoring with qualitative assessments, evaluator tracking
3. user_organizations - Multi-tenant membership for RLS policies

RLS Policies (9 total):
- Multi-tenant isolation (users only see own org submissions)
- Role-based access (evaluators can score, admins can manage)
- Submitter ownership (edit own drafts only)
- Audit trail protection (scores immutable, no deletion)

TypeScript interfaces defined for IntakeSubmission, FitGateScore, CriteriaScores`;

    const dataModel = `## intake_submissions
- id (UUID, PK)
- organization_id (UUID, multi-tenant scoping)
- submitted_by (UUID, Supabase Auth user)
- submission_status (TEXT, CHECK: draft|submitted|under_review|evaluated|archived)
- submission_number (TEXT, UNIQUE, auto-generated: INT-YYYY-NNN)
- responses (JSONB, wizard step data: venture_info, problem_statement, solution_overview, market_opportunity, team_info, current_stage, funding_ask)
- version (INT, for historical edits)
- previous_version_id (UUID, FK to self)
- fit_gate_score_id (UUID, FK to fit_gate_scores)
- created_at, updated_at, submitted_at, evaluated_at, archived_at (TIMESTAMPTZ)

## fit_gate_scores
- id (UUID, PK)
- intake_submission_id (UUID, FK to intake_submissions)
- evaluated_by (UUID, Supabase Auth user)
- evaluator_role (TEXT, e.g., analyst, partner)
- total_score (DECIMAL 0-100, weighted sum)
- passing_threshold (DECIMAL, default 70.00)
- pass_fail_status (TEXT, CHECK: pass|fail|conditional_pass)
- criteria_scores (JSONB, {market_opportunity, team_capability, product_differentiation, financial_viability, strategic_fit, execution_readiness} with score, weight, notes)
- strengths, weaknesses, recommendations, risk_factors (TEXT[])
- evaluator_notes, decision_rationale (TEXT)
- confidence_level (TEXT, CHECK: high|medium|low)
- version (INT, for re-evaluations)
- previous_score_id (UUID, FK to self)
- created_at, updated_at (TIMESTAMPTZ)`;

    const query = `
      INSERT INTO prds (
        id, sd_id, title, version, status, category, priority,
        executive_summary, business_context, technical_context,
        functional_requirements, non_functional_requirements, acceptance_criteria,
        system_architecture, implementation_approach, data_model, metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, version = EXCLUDED.version, status = EXCLUDED.status,
        category = EXCLUDED.category, priority = EXCLUDED.priority,
        executive_summary = EXCLUDED.executive_summary,
        business_context = EXCLUDED.business_context,
        technical_context = EXCLUDED.technical_context,
        functional_requirements = EXCLUDED.functional_requirements,
        non_functional_requirements = EXCLUDED.non_functional_requirements,
        acceptance_criteria = EXCLUDED.acceptance_criteria,
        system_architecture = EXCLUDED.system_architecture,
        implementation_approach = EXCLUDED.implementation_approach,
        data_model = EXCLUDED.data_model,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id, sd_id, title, status, version
    `;

    const result = await client.query(query, [
      prdId,
      'SD-GENESIS-INTAKE-001',
      'Intake + Fit Gate PRD',
      '1.0',
      'approved',
      'feature',
      'high',
      'Multi-step intake wizard with AI-powered fit gate scoring system for the Asset Factory. Guides users through venture submission process (venture info, problem/solution, market opportunity, team, funding) and evaluates submissions against Chairman Settings constraints using weighted scoring criteria. Includes real-time validation, progress tracking, and comprehensive evaluation dashboard.',
      'The Asset Factory requires a systematic intake process to evaluate venture ideas against strategic constraints before resource commitment. Current gap: no structured intake/evaluation workflow. This feature enables scalable venture screening, reduces manual review time, and ensures alignment with portfolio thesis. Critical for managing deal flow as platform scales.',
      'React wizard component (3 components, ~1,350 LOC total) using Shadcn UI, ProgressStepper pattern from FirstRunWizard.tsx, WCAG 2.1 AA accessibility. Database schema includes intake_submissions table (JSONB responses, version tracking) and fit_gate_scores table (multi-criteria weighted scoring). RLS policies ensure multi-tenant data isolation. Triggers auto-generate submission numbers (INT-YYYY-NNN) and populate workflow timestamps.',
      JSON.stringify(functionalRequirements),
      JSON.stringify(nonFunctionalRequirements),
      JSON.stringify(acceptanceCriteria),
      systemArchitecture,
      implementationApproach,
      dataModel,
      JSON.stringify(metadata)
    ]);

    console.log('✅ PRD created/updated successfully\n');
    console.log('   ID:', result.rows[0].id);
    console.log('   SD:', result.rows[0].sd_id);
    console.log('   Title:', result.rows[0].title);
    console.log('   Version:', result.rows[0].version);
    console.log('   Status:', result.rows[0].status);
    console.log('\n📄 File references included in implementation_approach and metadata:');
    console.log('   - docs/design-analysis/SD-GENESIS-INTAKE-001-DESIGN.md');
    console.log('   - docs/database-analysis-SD-GENESIS-INTAKE-001.md');
    console.log('   - database/migrations/029_asset_factory_intake_and_fit_gate.sql');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createPRD();
