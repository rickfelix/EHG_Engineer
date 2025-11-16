#!/usr/bin/env node
/**
 * Insert SD-GITHUB-ACTIONS-FIX-001 into strategic_directives_v2
 *
 * Creates a P0 strategic directive for fixing all 6 failing GitHub Actions workflows
 * to unblock EXEC→PLAN handoff validations via the GITHUB sub-agent.
 *
 * Run: node scripts/insert-sd-github-actions-fix-001.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Strategic Directive data structure matching strategic_directives_v2 schema
const sdData = {
  // PRIMARY KEY and UNIQUE identifier
  id: 'SD-GITHUB-ACTIONS-FIX-001',
  sd_key: 'SD-GITHUB-ACTIONS-FIX-001',

  // Required fields
  title: 'GitHub Actions CI/CD Workflow Repair and Validation',
  category: 'infrastructure',
  priority: 'critical', // P0 = critical priority
  status: 'pending_approval',
  version: '1.0',
  sd_type: 'infrastructure',

  // Core content
  description: 'Fix all 6 failing GitHub Actions workflows (security-scan, daily-report, tech-debt-tracker, auto-pr-create, cleanup-branches, post-merge-verify) to unblock handoff validations. Investigate root causes, repair workflows, implement monitoring, and ensure GITHUB sub-agent returns PASS verdict for all future handoffs.',

  rationale: `BUSINESS RATIONALE:
- Blocking all EXEC→PLAN handoffs requiring GitHub validation
- Breaking CI/CD quality gates preventing safe merges
- No automated security scanning exposing security vulnerabilities
- Manual workflow monitoring unsustainable at scale

TECHNICAL RATIONALE:
- 6/6 GitHub Actions workflows failing (100% failure rate)
- GITHUB sub-agent cannot validate handoffs (returns FAIL)
- Broken automation pipeline reduces code quality confidence
- Missing daily reports and tech debt tracking hides technical debt accumulation
- Auto-PR creation and cleanup workflows not functioning
- Post-merge verification bypassed, allowing bad code to reach main

STRATEGIC RATIONALE:
- CI/CD pipeline is critical infrastructure for LEO Protocol
- Handoff validation system depends on working GitHub Actions
- Quality gates enforce discipline, failures create technical debt
- Team velocity blocked until workflows operational`,

  scope: `INCLUDED IN SCOPE:
1. Root cause analysis for all 6 failing workflows
2. Fix security-scan workflow (CodeQL, dependency scanning)
3. Fix daily-report workflow (automated reporting)
4. Fix tech-debt-tracker workflow (technical debt monitoring)
5. Fix auto-pr-create workflow (automated PR creation)
6. Fix cleanup-branches workflow (stale branch cleanup)
7. Fix post-merge-verify workflow (post-merge validation)
8. Implement monitoring alerts for future failures
9. Update GITHUB sub-agent validation logic if needed
10. Document fixes and prevention strategies

EXCLUDED FROM SCOPE:
- Creating new workflows beyond the existing 6
- Enhancing workflow functionality (future enhancement)
- GitHub Actions cost optimization (separate SD)
- Migration to alternative CI/CD platforms
- Workflow performance optimization beyond fixing failures

SYSTEMS AFFECTED:
- .github/workflows/security-scan.yml
- .github/workflows/daily-report.yml
- .github/workflows/tech-debt-tracker.yml
- .github/workflows/auto-pr-create.yml
- .github/workflows/cleanup-branches.yml
- .github/workflows/post-merge-verify.yml
- GITHUB sub-agent validation logic
- SD handoff validation system
- CI/CD quality gates`,

  strategic_intent: `STRATEGIC ALIGNMENT:
Restore critical CI/CD infrastructure to unblock LEO Protocol execution and ensure automated quality gates function reliably across all strategic directives.

ORGANIZATIONAL IMPACT:
- Unblock EXEC→PLAN handoffs for all pending SDs
- Restore automated security scanning and vulnerability detection
- Enable data-driven technical debt management
- Reduce manual CI/CD monitoring burden
- Establish reliable quality gates for code changes

COMPETITIVE ADVANTAGE:
- Faster SD execution via automated validation
- Higher code quality through restored CI/CD gates
- Transparent technical debt tracking
- Automated workflow hygiene (branch cleanup, PR creation)
- Proactive security posture via continuous scanning`,

  // JSONB fields
  success_criteria: [
    {
      id: 'SC-001',
      criterion: 'All 6 GitHub Actions workflows return to passing state',
      measure: 'GitHub Actions dashboard shows green checkmarks for all workflows, no failures in last 24 hours',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-002',
      criterion: 'Root cause documented for each workflow failure',
      measure: 'Root cause analysis document created with failure category, trigger, and fix for each workflow',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-003',
      criterion: 'GITHUB sub-agent returns PASS verdict for test handoff',
      measure: 'Create test handoff, GITHUB sub-agent validation returns PASS with all workflows green',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-004',
      criterion: 'Security-scan workflow passes with no critical vulnerabilities',
      measure: 'CodeQL analysis completes successfully, dependency scan shows no critical issues',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-005',
      criterion: 'Daily-report workflow generates reports successfully',
      measure: 'Daily report generated and delivered, no workflow errors in logs',
      priority: 'HIGH'
    },
    {
      id: 'SC-006',
      criterion: 'Tech-debt-tracker workflow monitors technical debt',
      measure: 'Tech debt metrics collected and updated, dashboard reflects current state',
      priority: 'HIGH'
    },
    {
      id: 'SC-007',
      criterion: 'Auto-PR-create workflow creates PRs when triggered',
      measure: 'Test trigger creates PR successfully, PR follows template requirements',
      priority: 'HIGH'
    },
    {
      id: 'SC-008',
      criterion: 'Cleanup-branches workflow removes stale branches',
      measure: 'Test stale branch created and removed by workflow, retention policy enforced',
      priority: 'MEDIUM'
    },
    {
      id: 'SC-009',
      criterion: 'Post-merge-verify workflow validates merged code',
      measure: 'Test merge triggers verification, workflow validates build and tests pass',
      priority: 'HIGH'
    },
    {
      id: 'SC-010',
      criterion: 'Monitoring alerts configured for workflow failures',
      measure: 'GitHub Actions failure notification configured, test alert received on simulated failure',
      priority: 'HIGH'
    }
  ],

  risks: [
    {
      risk: 'Workflow fixes break other dependent workflows',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Test all workflows in sequence, review workflow dependencies before changes, staged rollout',
      owner: 'EXEC'
    },
    {
      risk: 'Root causes are GitHub platform issues, not configuration',
      severity: 'medium',
      probability: 'low',
      mitigation: 'Check GitHub status page first, verify runner availability, escalate to GitHub support if needed',
      owner: 'LEAD'
    },
    {
      risk: 'Missing secrets or environment variables prevent fixes',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Audit all required secrets, verify permissions, document secret management process',
      owner: 'EXEC'
    },
    {
      risk: 'Fixes introduce security vulnerabilities',
      severity: 'high',
      probability: 'low',
      mitigation: 'Security review for all changes, test security-scan workflow first, principle of least privilege',
      owner: 'SECURITY'
    },
    {
      risk: 'Workflow fixes conflict with existing PR branches',
      severity: 'low',
      probability: 'medium',
      mitigation: 'Coordinate with active PR authors, update workflow files on main first, rebase PRs',
      owner: 'EXEC'
    },
    {
      risk: 'Timeline too aggressive for complex root causes',
      severity: 'medium',
      probability: 'medium',
      mitigation: 'Prioritize critical workflows first (security, handoff validation), defer nice-to-have fixes',
      owner: 'PLAN'
    }
  ],

  dependencies: [
    {
      dependency: 'GitHub Actions runner availability',
      type: 'external',
      status: 'required',
      notes: 'Verify GitHub platform status and runner capacity before starting'
    },
    {
      dependency: 'GitHub repository secrets and environment variables',
      type: 'technical',
      status: 'required',
      notes: 'Audit and verify all required secrets are configured correctly'
    },
    {
      dependency: 'GITHUB sub-agent validation logic',
      type: 'technical',
      status: 'ready',
      notes: 'May need updates if validation criteria change'
    },
    {
      dependency: 'Repository admin permissions',
      type: 'access',
      status: 'required',
      notes: 'Need permissions to modify workflow files and repository settings'
    },
    {
      dependency: 'No conflicting workflow changes in active PRs',
      type: 'process',
      status: 'required',
      notes: 'Coordinate with team to avoid merge conflicts in workflow files'
    }
  ],

  success_metrics: {
    implementation: {
      target_completion: '1 sprint (2 weeks)',
      phase_1_delivery: '2 days (root cause analysis)',
      phase_2_delivery: '3 days (fix critical workflows: security, handoff)',
      phase_3_delivery: '3 days (fix remaining workflows)',
      phase_4_delivery: '2 days (monitoring + documentation)',
      total_effort_hours: 40
    },
    quality: {
      workflow_pass_rate: '100%',
      zero_breaking_changes: true,
      security_scan_coverage: '100%',
      monitoring_coverage: '100%',
      documentation_completeness: '100%'
    },
    impact: {
      handoff_validation_unblocked: true,
      github_sub_agent_pass_rate: '100%',
      security_vulnerability_detection: 'Restored',
      technical_debt_visibility: 'Restored',
      manual_monitoring_reduction: '80%'
    },
    business: {
      blocked_sds_unblocked: 'All pending SDs',
      team_velocity_restored: '100%',
      ci_cd_reliability: '>99% uptime',
      time_to_detect_issues: '<5 minutes',
      false_positive_rate: '<5%'
    }
  },

  stakeholders: [
    {
      name: 'Chairman',
      role: 'Executive Sponsor',
      involvement: 'Approve SD, final sign-off on completion',
      contact: 'Primary stakeholder'
    },
    {
      name: 'LEAD Agent',
      role: 'Business Value Validator',
      involvement: 'Strategic alignment verification, approve SD for PLAN phase',
      contact: 'LEO Protocol agent'
    },
    {
      name: 'PLAN Agent',
      role: 'Technical Planning Lead',
      involvement: 'PRD creation, test strategy, workflow dependency analysis',
      contact: 'LEO Protocol agent'
    },
    {
      name: 'EXEC Agent',
      role: 'Implementation Lead',
      involvement: 'Root cause analysis, workflow fixes, monitoring implementation',
      contact: 'LEO Protocol agent'
    },
    {
      name: 'GITHUB Sub-Agent',
      role: 'Validation Specialist',
      involvement: 'Verify workflow fixes, update validation logic if needed',
      contact: 'LEO Protocol sub-agent'
    },
    {
      name: 'SECURITY Sub-Agent',
      role: 'Security Review',
      involvement: 'Review security-scan workflow fixes, verify no vulnerabilities introduced',
      contact: 'LEO Protocol sub-agent'
    },
    {
      name: 'Development Team',
      role: 'End Users',
      involvement: 'Benefit from restored CI/CD, follow updated workflow guidelines',
      contact: 'EHG_Engineer contributors'
    }
  ],

  metadata: {
    estimated_effort_hours: 40,
    complexity: 'MEDIUM',
    impact_scope: 'CI/CD infrastructure, handoff validation, security scanning, technical debt tracking',
    breaking_changes: false,
    requires_migration: false,
    phased_delivery: true,
    blocking_priority: true,
    blocks_sds: ['All SDs requiring GITHUB sub-agent validation'],
    urgency: 'IMMEDIATE',
    business_value: 'Unblock team velocity, restore quality gates, enable security scanning',
    technical_debt_impact: 'HIGH - Prevents technical debt accumulation tracking',
    security_impact: 'HIGH - Restores automated security vulnerability detection'
  },

  // Application and workflow fields
  target_application: 'EHG_Engineer',
  current_phase: 'LEAD',
  created_by: 'human:Chairman'
};

async function insertSD() {
  console.log('🔄 Inserting SD-GITHUB-ACTIONS-FIX-001 into strategic_directives_v2...\n');

  try {
    // Check if already exists
    const { data: existing, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, created_at')
      .eq('id', 'SD-GITHUB-ACTIONS-FIX-001')
      .single();

    if (existing) {
      console.log('⚠️  SD already exists in database:');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Title: ${existing.title}`);
      console.log(`   Status: ${existing.status}`);
      console.log(`   Created: ${existing.created_at}`);
      console.log('\n🔄 Deleting existing record and re-inserting...\n');

      // Delete existing
      const { error: deleteError } = await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', 'SD-GITHUB-ACTIONS-FIX-001');

      if (deleteError) {
        console.error('❌ Error deleting existing record:', deleteError.message);
        process.exit(1);
      }

      console.log('✅ Deleted existing record\n');
    }

    // Insert new record
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select();

    if (error) {
      console.error('❌ Error inserting SD:', error.message);
      console.error('   Details:', error);
      process.exit(1);
    }

    console.log('✅ Successfully inserted SD-GITHUB-ACTIONS-FIX-001!\n');

    // Verify insertion with detailed query
    const { data: verification, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select(`
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
        created_by,
        success_criteria,
        risks,
        dependencies,
        stakeholders,
        success_metrics
      `)
      .eq('id', 'SD-GITHUB-ACTIONS-FIX-001')
      .single();

    if (verifyError) {
      console.error('❌ Error verifying insertion:', verifyError.message);
      process.exit(1);
    }

    console.log('📊 Verification Results:');
    console.log(`   ID: ${verification.id}`);
    console.log(`   SD Key: ${verification.sd_key}`);
    console.log(`   Title: ${verification.title}`);
    console.log(`   Category: ${verification.category}`);
    console.log(`   Priority: ${verification.priority} (P0)`);
    console.log(`   Status: ${verification.status}`);
    console.log(`   Version: ${verification.version}`);
    console.log(`   SD Type: ${verification.sd_type}`);
    console.log(`   Target App: ${verification.target_application}`);
    console.log(`   Current Phase: ${verification.current_phase}`);
    console.log(`   Created At: ${verification.created_at}`);
    console.log(`   Created By: ${verification.created_by}`);
    console.log(`   Success Criteria: ${verification.success_criteria?.length || 0} items`);
    console.log(`   Risks: ${verification.risks?.length || 0} items`);
    console.log(`   Dependencies: ${verification.dependencies?.length || 0} items`);
    console.log(`   Stakeholders: ${verification.stakeholders?.length || 0} items`);
    console.log(`   Success Metrics: ${verification.success_metrics ? 'Populated' : 'Empty'}`);

    console.log('\n✅ INSERTION COMPLETE!');
    console.log('\n📋 Next Steps (LEO Protocol LEAD Phase):');
    console.log('   1. LEAD Agent: Review strategic directive for approval');
    console.log('      - Verify business value and strategic alignment');
    console.log('      - Validate scope and success criteria');
    console.log('      - Assess risks and mitigation strategies');
    console.log('      - Confirm resource availability and dependencies');
    console.log('      - Execute 6-question strategic validation gate');
    console.log('   2. Upon LEAD approval, update status:');
    console.log('      UPDATE strategic_directives_v2 SET status = \'active\', current_phase = \'PLAN\' WHERE id = \'SD-GITHUB-ACTIONS-FIX-001\';');
    console.log('   3. PLAN Agent: Create PRD with detailed workflow repair plan');
    console.log('   4. EXEC Agent: Implement fixes and restore workflows');
    console.log('   5. GITHUB Sub-Agent: Validate all workflows passing');
    console.log('\n   View in dashboard: /strategic-directives/SD-GITHUB-ACTIONS-FIX-001');
    console.log('\n🎯 PRIORITY: P0 (CRITICAL) - Blocking all handoff validations');
    console.log('   Timeline: 1 sprint (2 weeks)');
    console.log('   Impact: Unblocks EXEC→PLAN handoffs for all pending SDs');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    console.error('   Stack:', err.stack);
    process.exit(1);
  }
}

// Run insertion
insertSD();
