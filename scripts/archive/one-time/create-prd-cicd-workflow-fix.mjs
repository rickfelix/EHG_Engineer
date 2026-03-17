#!/usr/bin/env node

/**
 * Create PRD for SD-CICD-WORKFLOW-FIX
 *
 * Comprehensive PRD for GitHub Actions workflow configuration fix
 * Part of LEO Protocol PLAN phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-CICD-WORKFLOW-FIX';
const PRD_ID = `PRD-${SD_ID}`;

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}...`);
  console.log('═'.repeat(70));

  // Get SD uuid_id
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, title, description, strategic_objectives, metadata')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`   SD UUID: ${sdData.uuid_id}`);
  console.log(`   Title: ${sdData.title}\n`);

  const prd = {
    id: PRD_ID,
    directive_id: SD_ID,
    sd_uuid: sdData.uuid_id,
    title: 'GitHub Actions Workflow Configuration Fix - CI/CD Pipeline Restoration',
    version: '1.0',
    status: 'planning',
    category: 'infrastructure',
    priority: 'high',
    executive_summary: `Fix critical CI/CD pipeline infrastructure issues preventing automated testing and quality gates. Investigation shows multiple GitHub Actions workflows failing (LEO Gate Validation, RLS Policy Verification, UAT Testing Pipeline, LEO Protocol Drift Check). Root cause analysis required to identify whether issues are:
- Workflow file YAML syntax errors
- Missing or misconfigured GitHub Actions secrets
- Permission/environment configuration issues
- Repository settings blocking workflow execution

Target: Restore automated CI/CD verification for all future implementations. Enable SD-VWC-A11Y-001 Phase 1 and all subsequent SDs to benefit from automated E2E testing and quality gates.`,

    business_context: `Current CI/CD blocker prevents automated verification of implementations. SD-VWC-A11Y-001 Phase 1 was validated locally but cannot be verified via GitHub Actions. This infrastructure issue creates technical debt and manual testing overhead, blocking the automation benefits intended by LEO Protocol.`,

    technical_context: `GitHub Actions workflows in .github/workflows/ directory are failing with various error patterns. Recent workflow runs show failures in:
- LEO Gate Validation (leo-gates.yml)
- RLS Policy Verification (rls-verification.yml)
- UAT Testing Pipeline (uat-testing.yml)
- LEO Protocol Drift Check (leo-drift-check.yml)
- Backlog Integrity checks
- Housekeeping automation

Requires systematic diagnosis of each failing workflow, root cause identification, and targeted fixes without breaking working workflows.`,

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Workflow Failure Diagnosis',
        description: 'Systematically analyze all failing GitHub Actions workflows to identify root causes',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All failing workflows identified via gh run list analysis',
          'Error logs collected for each failure using gh run view --log',
          'Root causes categorized (YAML syntax, secrets, permissions, configuration)',
          'Diagnosis documented in workflow investigation report'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'YAML Syntax Validation',
        description: 'Verify all workflow files have valid YAML syntax and proper GitHub Actions schema',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All .github/workflows/*.yml files validated with YAML linter',
          'GitHub Actions schema compliance verified',
          'Syntax errors fixed without changing workflow logic',
          'Validation integrated into pre-commit checks'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Secrets Configuration Verification',
        description: 'Verify all required GitHub Actions secrets are configured and accessible',
        priority: 'HIGH',
        acceptance_criteria: [
          'Required secrets documented for each workflow',
          'Missing secrets identified and added to repository settings',
          'Secret references in workflows validated',
          'Sensitive data handling follows security best practices'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Workflow Permissions Fix',
        description: 'Ensure workflows have correct permissions for repository operations',
        priority: 'HIGH',
        acceptance_criteria: [
          'Workflow permissions declarations reviewed',
          'GITHUB_TOKEN permissions configured correctly',
          'Repository settings allow workflow execution',
          'Permission errors resolved without over-permissioning'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Workflow Execution Verification',
        description: 'Verify fixed workflows execute successfully past 0s mark',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Test PR created to trigger workflows',
          'All fixed workflows execute (not fail immediately)',
          'Workflow runs show actual execution steps',
          'Success/failure based on logic, not configuration errors'
        ]
      },
      {
        id: 'FR-6',
        requirement: 'Prevention Measures Documentation',
        description: 'Document root causes and add prevention measures to workflow validation checklist',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Root cause analysis added to retrospective',
          'Workflow validation checklist created/updated',
          'Pre-commit hooks added if appropriate',
          'Team documentation updated with lessons learned'
        ]
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'GitHub CLI Diagnostic Tools',
        technology: 'gh CLI v2+',
        description: 'Use gh run list and gh run view commands for workflow diagnostics',
        rationale: 'Official GitHub CLI provides detailed workflow execution data'
      },
      {
        id: 'TR-2',
        requirement: 'YAML Validation Tooling',
        technology: 'yamllint, actionlint',
        description: 'Validate workflow YAML syntax and GitHub Actions schema compliance',
        rationale: 'Catch configuration errors before commit'
      },
      {
        id: 'TR-3',
        requirement: 'Repository Secrets Management',
        technology: 'GitHub Secrets API, gh secret commands',
        description: 'Verify and configure required secrets via GitHub Settings',
        rationale: 'Missing secrets are common workflow failure cause'
      },
      {
        id: 'TR-4',
        requirement: 'Workflow Testing Strategy',
        technology: 'Draft PRs, workflow_dispatch triggers',
        description: 'Test workflow fixes using draft PRs and manual triggers before merging',
        rationale: 'Avoid polluting main branch with broken workflow iterations'
      },
      {
        id: 'TR-5',
        requirement: 'Documentation Integration',
        technology: 'Markdown files in docs/infrastructure/',
        description: 'Document fixes and prevention measures in repository documentation',
        rationale: 'Share knowledge and prevent recurrence'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'LEO Gate Validation Workflow Execution',
        description: 'Create test PR triggering leo-gates.yml workflow',
        priority: 'CRITICAL',
        expected_result: 'Workflow executes past 0s, gate validation jobs run, results uploaded'
      },
      {
        id: 'TS-2',
        scenario: 'RLS Policy Verification Execution',
        description: 'Trigger rls-verification.yml workflow via workflow_dispatch',
        priority: 'HIGH',
        expected_result: 'RLS policy checks execute, database queries run, verification completes'
      },
      {
        id: 'TS-3',
        scenario: 'UAT Testing Pipeline Execution',
        description: 'Trigger uat-testing.yml workflow for EHG application',
        priority: 'HIGH',
        expected_result: 'Playwright tests execute, browser automation runs, results collected'
      },
      {
        id: 'TS-4',
        scenario: 'LEO Protocol Drift Check Execution',
        description: 'Run leo-drift-check.yml on push to main branch',
        priority: 'MEDIUM',
        expected_result: 'Protocol compliance checks run, drift analysis completes'
      },
      {
        id: 'TS-5',
        scenario: 'Workflow Configuration Regression Test',
        description: 'Verify all previously working workflows still function after fixes',
        priority: 'CRITICAL',
        expected_result: 'Zero regressions in currently passing workflows'
      },
      {
        id: 'TS-6',
        scenario: 'YAML Syntax Validation Pre-Commit',
        description: 'Modify workflow file with syntax error, attempt commit',
        priority: 'MEDIUM',
        expected_result: 'Pre-commit hook catches error, prevents commit'
      }
    ],

    acceptance_criteria: [
      'All failing workflows identified via gh run list analysis',
      'Root cause documented for each failing workflow',
      'LEO Gate Validation workflow executes successfully',
      'RLS Policy Verification workflow executes successfully',
      'UAT Testing Pipeline workflow executes successfully',
      'LEO Protocol Drift Check workflow executes successfully',
      'Test PR verifies all fixed workflows execute past 0s',
      'Zero regressions in currently working workflows',
      'Workflow validation checklist created or updated',
      'Root cause and prevention measures documented in retrospective'
    ],

    system_architecture: JSON.stringify({
      target_repository: 'EHG_Engineer',
      workflows_directory: '.github/workflows/',
      affected_workflows: [
        'leo-gates.yml',
        'rls-verification.yml',
        'uat-testing.yml',
        'leo-drift-check.yml',
        'backlog-integrity-staging-readonly.yml',
        'housekeeping-staging-selfcontained.yml'
      ],
      diagnostic_tools: [
        'gh CLI (GitHub Actions analysis)',
        'yamllint (YAML syntax validation)',
        'actionlint (GitHub Actions schema validation)'
      ],
      testing_strategy: 'Draft PR-based testing with workflow_dispatch triggers',
      validation_integration: 'Pre-commit hooks for YAML validation (optional)'
    }),

    implementation_approach: JSON.stringify({
      strategy: 'Systematic diagnosis and targeted fixes',
      phases: [
        {
          phase: 1,
          name: 'Workflow Failure Diagnosis',
          duration: '30 minutes',
          tasks: [
            'Run gh run list --limit 50 to identify all failing workflows',
            'Collect error logs using gh run view --log for each failure',
            'Categorize failures by error pattern',
            'Document initial findings'
          ],
          deliverables: ['Workflow failure diagnosis report']
        },
        {
          phase: 2,
          name: 'Root Cause Analysis',
          duration: '30 minutes',
          tasks: [
            'Analyze YAML syntax for each failing workflow',
            'Check GitHub secrets configuration',
            'Verify workflow permissions settings',
            'Identify missing dependencies or configuration'
          ],
          deliverables: ['Root cause identification per workflow']
        },
        {
          phase: 3,
          name: 'Fix Implementation',
          duration: '45 minutes',
          tasks: [
            'Fix YAML syntax errors',
            'Configure missing secrets',
            'Update workflow permissions',
            'Add validation tooling if needed'
          ],
          deliverables: ['Fixed workflow files', 'Configuration updates']
        },
        {
          phase: 4,
          name: 'Testing and Verification',
          duration: '30 minutes',
          tasks: [
            'Create test PR to trigger workflows',
            'Verify workflows execute successfully',
            'Test with workflow_dispatch for manual triggers',
            'Confirm zero regressions'
          ],
          deliverables: ['Test PR with passing workflows', 'Verification report']
        },
        {
          phase: 5,
          name: 'Documentation and Prevention',
          duration: '15 minutes',
          tasks: [
            'Document root causes in retrospective',
            'Update workflow validation checklist',
            'Add pre-commit hooks if beneficial',
            'Create team documentation'
          ],
          deliverables: ['Retrospective', 'Updated documentation']
        }
      ],
      total_estimated_duration: '2.5 hours',
      rollout_strategy: 'Incremental workflow fixes with draft PR testing'
    }),

    dependencies: [
      {
        id: 'DEP-1',
        name: 'GitHub CLI',
        type: 'tool',
        status: 'existing',
        blocker: false,
        description: 'Required for workflow diagnostics (gh run list, gh run view)'
      },
      {
        id: 'DEP-2',
        name: 'GitHub Actions Secrets',
        type: 'configuration',
        status: 'needs_verification',
        blocker: true,
        description: 'Repository secrets must be configured for workflows to execute'
      },
      {
        id: 'DEP-3',
        name: 'Repository Permissions',
        type: 'configuration',
        status: 'needs_verification',
        blocker: true,
        description: 'Workflow permissions must allow GitHub Actions execution'
      }
    ],

    risks: [
      {
        risk: 'Workflow fixes break currently working workflows',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Regression in CI/CD automation',
        category: 'Technical',
        mitigation: 'Test fixes on draft PR, comprehensive regression testing, incremental rollout'
      },
      {
        risk: 'Missing secrets cannot be recreated',
        severity: 'HIGH',
        probability: 'LOW',
        impact: 'Workflows remain broken, manual intervention required',
        category: 'Configuration',
        mitigation: 'Document all required secrets, contact repository admins if needed'
      },
      {
        risk: 'Root cause is repository-level configuration issue',
        severity: 'MEDIUM',
        probability: 'MEDIUM',
        impact: 'Requires admin-level changes outside developer control',
        category: 'Access',
        mitigation: 'Escalate to repository owner if admin access required'
      }
    ],

    constraints: [
      'Target repository: EHG_Engineer (.github/workflows/ directory)',
      'No breaking changes to currently working workflows',
      'Fixes must be testable via draft PR',
      'Documentation required for all fixes',
      'Timeline: 2-3 hours maximum',
      'Test with workflow_dispatch before relying on automatic triggers'
    ],

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Functional requirements defined (6 FRs)', checked: true },
      { text: 'Technical requirements specified (5 TRs)', checked: true },
      { text: 'Test scenarios documented (6 scenarios)', checked: true },
      { text: 'Acceptance criteria established (10 criteria)', checked: true },
      { text: 'Risk assessment completed (3 risks)', checked: true },
      { text: 'System architecture defined (workflow diagnostics)', checked: true },
      { text: 'Implementation approach documented (5 phases)', checked: true },
      { text: 'Dependencies identified (3 dependencies)', checked: true },
      { text: 'Constraints documented (6 constraints)', checked: true }
    ],

    exec_checklist: [
      { text: 'Run gh run list --limit 50 to identify failures', checked: false },
      { text: 'Collect error logs with gh run view --log', checked: false },
      { text: 'Categorize failures by error pattern', checked: false },
      { text: 'Analyze YAML syntax for each failing workflow', checked: false },
      { text: 'Verify GitHub secrets configuration', checked: false },
      { text: 'Check workflow permissions settings', checked: false },
      { text: 'Fix YAML syntax errors', checked: false },
      { text: 'Configure missing secrets', checked: false },
      { text: 'Update workflow permissions', checked: false },
      { text: 'Create test PR to verify fixes', checked: false },
      { text: 'Confirm all fixed workflows execute successfully', checked: false },
      { text: 'Run regression tests on working workflows', checked: false }
    ],

    validation_checklist: [
      { text: 'All failing workflows identified', checked: false },
      { text: 'Root causes documented', checked: false },
      { text: 'LEO Gate Validation executes successfully', checked: false },
      { text: 'RLS Policy Verification executes successfully', checked: false },
      { text: 'UAT Testing Pipeline executes successfully', checked: false },
      { text: 'LEO Protocol Drift Check executes successfully', checked: false },
      { text: 'Test PR shows workflows execute past 0s', checked: false },
      { text: 'Zero regressions confirmed', checked: false },
      { text: 'Workflow validation checklist created', checked: false },
      { text: 'Retrospective documentation complete', checked: false }
    ],

    progress: 15,
    phase: 'planning',
    created_by: 'PLAN (LEO Protocol)',
    metadata: {
      workflow_investigation_started: new Date().toISOString(),
      estimated_hours: 2.5,
      blocker_for: ['SD-VWC-A11Y-001', 'All future SDs requiring CI/CD'],
      testing_approach: 'Draft PR with workflow_dispatch triggers'
    }
  };

  // Insert PRD
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      console.log(`⚠️  ${PRD_ID} already exists, updating instead...`);

      const { data: updateData, error: updateError } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('id', PRD_ID)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Update error:', updateError.message);
        process.exit(1);
      }

      console.log(`✅ ${PRD_ID} updated successfully!`);
    } else {
      console.error('❌ Insert error:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }
  } else {
    console.log(`✅ ${PRD_ID} created successfully!`);
  }

  // Display summary
  console.log('\n📊 PRD Summary:');
  console.log('-'.repeat(70));
  console.log(`ID: ${PRD_ID}`);
  console.log(`Title: ${prd.title}`);
  console.log(`Status: ${prd.status}`);
  console.log(`Priority: ${prd.priority}`);
  console.log(`Progress: ${prd.progress}%`);
  console.log(`\nFunctional Requirements: ${prd.functional_requirements.length}`);
  console.log(`Technical Requirements: ${prd.technical_requirements.length}`);
  console.log(`Test Scenarios: ${prd.test_scenarios.length}`);
  console.log(`Acceptance Criteria: ${prd.acceptance_criteria.length}`);
  console.log(`Risks: ${prd.risks.length}`);
  console.log(`\nEstimated Duration: ${JSON.parse(prd.implementation_approach).total_estimated_duration}`);
  console.log('═'.repeat(70));

  console.log('\n✅ PRD creation complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Review PRD in database (product_requirements_v2 table)');
  console.log('2. Run Database Architect validation');
  console.log('3. Create PLAN→EXEC handoff when ready');
}

createPRD().catch(console.error);
