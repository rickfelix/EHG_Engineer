#!/usr/bin/env node

/**
 * Create User Stories for SD-CICD-WORKFLOW-FIX
 *
 * Generates user stories for GitHub Actions workflow configuration fix
 * Part of LEO Protocol PLAN phase requirement
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'SD-CICD-WORKFLOW-FIX';
const PRD_ID = `PRD-${SD_ID}`;

const userStories = [
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Diagnose All Failing GitHub Actions Workflows',
    user_role: 'DevOps Engineer',
    user_want: 'to systematically identify all failing GitHub Actions workflows and their root causes',
    user_benefit: 'I can fix the right issues without wasting time on symptom-based fixes',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'All failing workflows identified via gh run list analysis',
      'Error logs collected for each failure using gh run view --log',
      'Root causes categorized (YAML syntax, secrets, permissions, configuration)',
      'Diagnosis documented in workflow investigation report'
    ],
    implementation_context: 'Run gh run list --limit 50 to get recent workflow runs. For each failure, collect logs with gh run view --log. Categorize error patterns and document findings.',
    technical_notes: 'Use GitHub CLI for diagnostics. Document findings in docs/infrastructure/workflow-diagnosis.md',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Validate Workflow YAML Syntax',
    user_role: 'DevOps Engineer',
    user_want: 'to verify all workflow files have valid YAML syntax and GitHub Actions schema',
    user_benefit: 'I can catch configuration errors before they cause workflow failures',
    story_points: 2,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'All .github/workflows/*.yml files validated with YAML linter',
      'GitHub Actions schema compliance verified',
      'Syntax errors fixed without changing workflow logic',
      'Validation integrated into pre-commit checks'
    ],
    implementation_context: 'Install yamllint and actionlint. Run linters on all workflow files. Fix syntax errors. Optionally add pre-commit hook for validation.',
    technical_notes: 'Use yamllint for YAML syntax, actionlint for GitHub Actions schema. Consider adding .github/workflows/*.yml to pre-commit config',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Verify GitHub Actions Secrets Configuration',
    user_role: 'DevOps Engineer',
    user_want: 'to ensure all required GitHub Actions secrets are configured and accessible',
    user_benefit: 'workflows can execute without failing due to missing secrets',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Required secrets documented for each workflow',
      'Missing secrets identified and added to repository settings',
      'Secret references in workflows validated',
      'Sensitive data handling follows security best practices'
    ],
    implementation_context: 'Review each workflow for secret usage. Check GitHub repository settings for secret availability. Add missing secrets via gh secret set or web UI.',
    technical_notes: 'Document required secrets in docs/infrastructure/github-secrets.md. Use gh secret list to verify secrets exist',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-004`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix Workflow Permissions',
    user_role: 'DevOps Engineer',
    user_want: 'to ensure workflows have correct permissions for repository operations',
    user_benefit: 'workflows can perform their intended operations without permission errors',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'Workflow permissions declarations reviewed',
      'GITHUB_TOKEN permissions configured correctly',
      'Repository settings allow workflow execution',
      'Permission errors resolved without over-permissioning'
    ],
    implementation_context: 'Review permissions: block in each workflow. Ensure GITHUB_TOKEN has required scopes. Check repository settings for workflow permissions.',
    technical_notes: 'Follow principle of least privilege. Document permission requirements in workflow comments',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-005`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix LEO Gate Validation Workflow',
    user_role: 'DevOps Engineer',
    user_want: 'to fix the leo-gates.yml workflow so it executes successfully',
    user_benefit: 'PRDs can be validated automatically via GitHub Actions',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'leo-gates.yml workflow executes past 0s mark',
      'Gate validation jobs run and complete',
      'Results uploaded to artifacts',
      'Test PR verifies workflow executes successfully'
    ],
    implementation_context: 'Fix identified issues in .github/workflows/leo-gates.yml. Test with workflow_dispatch trigger. Create test PR to verify automatic execution.',
    technical_notes: 'Check for missing dependencies, secret references, and permission issues in leo-gates.yml',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-006`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix RLS Policy Verification Workflow',
    user_role: 'DevOps Engineer',
    user_want: 'to fix the rls-verification.yml workflow so database policies are verified',
    user_benefit: 'RLS policies are automatically validated on every change',
    story_points: 2,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'rls-verification.yml workflow executes successfully',
      'Database connection works in workflow',
      'RLS policy checks complete',
      'Verification results logged'
    ],
    implementation_context: 'Fix database connection issues in rls-verification.yml. Verify DATABASE_URL secret exists. Test with workflow_dispatch.',
    technical_notes: 'Check DATABASE_URL secret format and permissions. Ensure Supabase pooler URL is used',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-007`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix UAT Testing Pipeline Workflow',
    user_role: 'QA Engineer',
    user_want: 'to fix the uat-testing.yml workflow so Playwright tests execute automatically',
    user_benefit: 'UAT tests run automatically on PRs, catching issues before merge',
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: [
      'uat-testing.yml workflow executes successfully',
      'Playwright tests run',
      'Browser automation works in CI',
      'Test results collected and reported'
    ],
    implementation_context: 'Fix Playwright setup in uat-testing.yml. Ensure browsers are installed. Check for missing environment variables.',
    technical_notes: 'Use npx playwright install --with-deps for browser setup. Verify test paths are correct',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-008`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Fix LEO Protocol Drift Check Workflow',
    user_role: 'DevOps Engineer',
    user_want: 'to fix the leo-drift-check.yml workflow so protocol compliance is monitored',
    user_benefit: 'protocol violations are detected automatically before they become problems',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'leo-drift-check.yml workflow executes successfully',
      'Protocol compliance checks run',
      'Drift analysis completes',
      'Results logged for review'
    ],
    implementation_context: 'Fix issues in leo-drift-check.yml. Verify drift check script exists and is executable. Test with workflow_dispatch.',
    technical_notes: 'Check for missing dependencies or script paths. Ensure protocol baseline files exist',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-009`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Verify All Fixes with Test PR',
    user_role: 'DevOps Engineer',
    user_want: 'to verify all workflow fixes work end-to-end via test PR',
    user_benefit: 'I have confidence that all workflows will work in production',
    story_points: 3,
    priority: 'critical',
    status: 'ready',
    acceptance_criteria: [
      'Test PR created to trigger workflows',
      'All fixed workflows execute (not fail immediately)',
      'Workflow runs show actual execution steps',
      'Success/failure based on logic, not configuration errors'
    ],
    implementation_context: 'Create draft PR with minor change to trigger workflows. Monitor all workflow executions. Verify each workflow executes past 0s mark.',
    technical_notes: 'Use draft PR to test without polluting main branch. Document test results in PR description',
    created_by: 'PLAN'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-010`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Document Root Causes and Prevention',
    user_role: 'Technical Writer',
    user_want: 'to document root causes and add prevention measures to workflow validation checklist',
    user_benefit: 'the team learns from these failures and prevents recurrence',
    story_points: 2,
    priority: 'medium',
    status: 'ready',
    acceptance_criteria: [
      'Root cause analysis added to retrospective',
      'Workflow validation checklist created/updated',
      'Pre-commit hooks added if appropriate',
      'Team documentation updated with lessons learned'
    ],
    implementation_context: 'Create docs/infrastructure/workflow-troubleshooting.md with root causes and fixes. Update workflow validation checklist. Add to team knowledge base.',
    technical_notes: 'Include specific examples of errors and fixes. Provide troubleshooting steps for common issues',
    created_by: 'PLAN'
  }
];

async function createUserStories() {
  console.log(`\n📚 Creating User Stories for ${SD_ID}...`);
  console.log('═'.repeat(70));
  console.log(`Total Stories: ${userStories.length}\n`);

  let created = 0;
  let skipped = 0;

  for (const story of userStories) {
    try {
      const { data, error } = await supabase
        .from('user_stories')
        .insert(story)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          console.log(`⏭️  ${story.story_key} - Already exists`);
          skipped++;
        } else {
          console.error(`❌ ${story.story_key} - Error:`, error.message);
        }
      } else {
        console.log(`✅ ${story.story_key} - ${story.title}`);
        created++;
      }
    } catch (err) {
      console.error(`❌ ${story.story_key} - Exception:`, err.message);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📊 Summary:');
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${userStories.length}`);

  // Calculate implementation context coverage
  const withContext = userStories.filter(s => s.implementation_context).length;
  const contextCoverage = Math.round((withContext / userStories.length) * 100);

  // Calculate acceptance criteria coverage
  const withCriteria = userStories.filter(s => s.acceptance_criteria && s.acceptance_criteria.length > 0).length;
  const criteriaCoverage = Math.round((withCriteria / userStories.length) * 100);

  console.log('\n📈 Quality Metrics:');
  console.log(`   Implementation Context Coverage: ${contextCoverage}% (${withContext}/${userStories.length})`);
  console.log(`   Acceptance Criteria Coverage: ${criteriaCoverage}% (${withCriteria}/${userStories.length})`);
  console.log(`   Average Story Points: ${Math.round(userStories.reduce((sum, s) => sum + s.story_points, 0) / userStories.length)}`);

  if (contextCoverage >= 80 && criteriaCoverage >= 80) {
    console.log('\n✅ BMAD Validation: PASS (≥80% coverage)');
  } else {
    console.log('\n⚠️  BMAD Validation: May not meet ≥80% threshold');
  }

  console.log('═'.repeat(70));
  console.log('\n✅ User story creation complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Review user stories in database');
  console.log('2. Retry PLAN→EXEC handoff');
  console.log('3. Begin EXEC phase implementation');
}

createUserStories().catch(console.error);
