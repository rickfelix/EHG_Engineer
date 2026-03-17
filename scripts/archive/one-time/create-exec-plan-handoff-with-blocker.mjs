#!/usr/bin/env node

/**
 * Create EXEC→PLAN handoff with CI blocker documentation
 * For SD-A11Y-FEATURE-BRANCH-001
 *
 * Documents completed work and CI blocker (300+ pre-existing lint errors)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

async function createHandoff() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get SD UUID
  console.log('🔍 Getting SD details...');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title')
    .eq('sd_key', 'SD-A11Y-FEATURE-BRANCH-001')
    .single();

  if (sdError || !sd) {
    console.log('❌ SD not found:', sdError?.message);
    process.exit(1);
  }

  console.log(`✅ SD found: ${sd.title}`);
  console.log(`   UUID: ${sd.uuid_id}`);

  // Create handoff with 7-element structure (using correct column names)
  const handoffData = {
    id: randomUUID(),
    sd_id: 'SD-A11Y-FEATURE-BRANCH-001',
    from_phase: 'EXEC',
    to_phase: 'PLAN',
    handoff_type: 'EXEC-TO-PLAN',
    status: 'pending_acceptance',
    created_by: 'OPTION-C-EXEC-COMPLETION',
    executive_summary: 'Approved scope delivered: 108 jsx-a11y violations fixed across 50+ React components with 398/399 unit tests passing (99.7%). Implementation complete per LEAD approval. CI/CD pipeline blocked by 300+ pre-existing codebase-wide lint errors (out of scope). Separate SD-LINT-CLEANUP-001 (completed) addressed lint cleanup.',
    deliverables_manifest: JSON.stringify([
      {
        name: 'jsx-a11y violations fixed',
        description: '108 violations resolved: keyboard accessibility (50+ errors), form labels (40+ errors), interactive elements (40+ errors), image alt text (20+ errors)',
        status: 'completed',
        evidence: 'Zero jsx-a11y ESLint errors in modified components, PR #16 ready for review'
      },
      {
        name: 'Unit test coverage',
        description: '398/399 unit tests passing (99.7%), including AnalyticsDashboard.test.tsx, executeWithRetry.test.ts, workflow-builder.test.tsx',
        status: 'completed',
        evidence: 'npm run test:unit shows 28 test files passed, 398 tests passed, 1 skipped'
      },
      {
        name: 'Security vulnerability patched',
        description: 'happy-dom@14.12.3 → @14.12.4 (CVE-2024-52811)',
        status: 'completed',
        evidence: 'Commit 44ed675, npm audit clean'
      },
      {
        name: 'Database-first cleanup',
        description: '2,669 files removed from repository (docs/ migration to database)',
        status: 'completed',
        evidence: 'Commit history shows successful database-first refactor'
      }
    ]),
    key_decisions: JSON.stringify([
      {
        decision: 'Pivot to Option C (LEO Protocol compliant path)',
        rationale: 'Initial Option A (fix linting) discovered 300+ files with errors (10-20 hours), far beyond SD scope of 108 a11y violations. Option C documents blocker, preserves scope lock, and delegates lint cleanup to separate SD.',
        approver: 'User (explicit: "Lets go with option c")',
        timestamp: new Date().toISOString()
      },
      {
        decision: 'Accept CI red status for this SD',
        rationale: 'CI failures caused by pre-existing codebase-wide linting issues, not a11y work. Separate SD-LINT-CLEANUP-001 (completed) addressed root cause. Approved scope delivered successfully.',
        approver: 'EXEC phase (Option C execution)',
        timestamp: new Date().toISOString()
      }
    ]),
    known_issues: JSON.stringify([
      {
        type: 'blocker',
        severity: 'critical',
        title: 'CI/CD Pipeline: 300+ Pre-Existing Lint Errors',
        description: 'GitHub Actions failing due to codebase-wide ESLint violations discovered during EXEC phase. Initial estimate: 30 files, 2.5 hours. Actual scope: 300+ files (coverage reports, test files, components, services), 10-20 hours. Root causes: (1) Parsing errors in 2 files, (2) ~30+ console.log violations, (3) React hooks warnings across hundreds of files.',
        resolution_status: 'out_of_scope',
        resolution_notes: 'Per LEO Protocol Option C: Documented as blocker, separate SD-LINT-CLEANUP-001 created and completed. Current SD delivered approved scope (108 a11y violations fixed).',
        related_sd: 'SD-LINT-CLEANUP-001 (status: completed)'
      }
    ]),
    resource_utilization: JSON.stringify([
      {
        type: 'pull_request',
        location: 'https://github.com/rickfelix/ehg/pull/16',
        description: 'PR #16: Feature Branch Accessibility Cleanup - 108 violations fixed, ready for review despite CI red'
      },
      {
        type: 'database_record',
        location: 'product_requirements_v2.PRD-A11Y-FEATURE-BRANCH-001',
        description: 'PRD with functional requirements, testing strategy, success criteria (status: done)'
      },
      {
        type: 'git_commit',
        location: 'commit 44ed675',
        description: 'Security fix: happy-dom vulnerability patch'
      },
      {
        type: 'related_sd',
        location: 'strategic_directives_v2.SD-LINT-CLEANUP-001',
        description: 'Codebase-wide lint cleanup (status: completed)'
      }
    ]),
    action_items: JSON.stringify([
      {
        action: 'PLAN phase: Review completed work',
        assignee: 'PLAN_VERIFY sub-agents',
        priority: 'high',
        description: 'Verify 108 a11y violations fixed, 398/399 tests passing, PRD completeness, scope adherence'
      },
      {
        action: 'PLAN phase: Validate CI blocker documentation',
        assignee: 'PLAN sub-agent',
        priority: 'high',
        description: 'Confirm SD-LINT-CLEANUP-001 completion, verify blocker is truly out of scope, validate Option C execution'
      },
      {
        action: 'LEAD phase: Final approval decision',
        assignee: 'LEAD agent',
        priority: 'high',
        description: 'Approve completion despite CI red (work delivered per scope) OR require additional actions'
      }
    ]),
    completeness_report: JSON.stringify({
      exec_phase_complete: true,
      approved_scope_delivered: true,
      test_coverage: '99.7% (398/399 tests passing)',
      ci_status: 'red (blocker documented)',
      pr_status: 'ready_for_review',
      context_health: 'HEALTHY (22% budget)',
      protocol_compliance: 'full (Option C execution)'
    }),
    metadata: JSON.stringify({
      leo_protocol_version: '4.2.0',
      handoff_type: 'EXEC-TO-PLAN',
      completion_reason: 'Option C (protocol-compliant blocker documentation)',
      scope_adherence: 'strict',
      ci_status: 'red (blocker documented)',
      test_status: 'green (398/399 passing)',
      pr_status: 'ready_for_review',
      created_by: 'claude_code',
      option_executed: 'C',
      scope_creep_prevented: true
    })
  };

  console.log('\n📝 Creating EXEC→PLAN handoff...');
  const { data: handoff, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .insert(handoffData)
    .select()
    .single();

  if (handoffError) {
    console.log('❌ Error creating handoff:', handoffError.message);
    console.log('Details:', JSON.stringify(handoffError, null, 2));
    process.exit(1);
  }

  console.log('✅ Handoff created successfully!');
  console.log(`   ID: ${handoff.id}`);
  console.log(`   Status: ${handoff.status}`);
  console.log(`   ${handoff.from_phase} → ${handoff.to_phase}`);
  console.log('\n📊 Summary:');
  console.log('   ✅ 108 jsx-a11y violations fixed');
  console.log('   ✅ 398/399 unit tests passing (99.7%)');
  console.log('   ✅ Security patch applied (happy-dom)');
  console.log('   ✅ 2,669 files cleaned up (database-first)');
  console.log('   ⚠️  CI red (300+ pre-existing lint errors - blocker documented)');
  console.log('   ✅ SD-LINT-CLEANUP-001 (completed)');
  console.log('\n🎯 Next: PLAN phase verification');
}

createHandoff().catch(console.error);
