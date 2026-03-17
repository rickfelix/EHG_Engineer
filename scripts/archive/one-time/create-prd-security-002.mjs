#!/usr/bin/env node

import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const prdId = randomUUID();

const prd = {
  id: prdId,
  directive_id: '5c04e652-0035-4931-920a-9b26ef3445c1',
  sd_uuid: '5c04e652-0035-4931-920a-9b26ef3445c1',
  title: 'RLS Policy Verification Automation',
  version: '1.0.0',
  status: 'active',
  category: 'security_infrastructure',
  priority: 'high',

  executive_summary: 'Automated RLS policy verification system eliminating manual checks (15-30 min → <30 sec). Integrates with LEO Protocol PLAN verification and GitHub Actions CI/CD.',

  business_context: 'Manual RLS verification creates deployment bottlenecks and data security risk. 10 retrospectives identified this gap. Automation demonstrates security maturity for Series A readiness.',

  technical_context: '92 application tables with RLS policies. Existing infrastructure: pg library, SUPABASE_POOLER_URL, pg_policies query pattern proven in fix-issue-patterns-rls.js.',

  functional_requirements: [
    {id: 'FR-1', requirement: 'RLS Verification Script', description: 'scripts/verify-rls-policies.js queries pg_policies, verifies RLS enabled, checks CRUD policy coverage', priority: 'CRITICAL'},
    {id: 'FR-2', requirement: 'Security Role', description: 'rls_auditor PostgreSQL role with SELECT-only on pg_policies and information_schema.tables', priority: 'CRITICAL'},
    {id: 'FR-3', requirement: 'GitHub Actions', description: 'Workflow blocks PR merge if RLS verification fails', priority: 'HIGH'},
    {id: 'FR-4', requirement: 'PLAN Integration', description: 'unified-handoff-system.js calls verify-rls-policies.js during PLAN verification', priority: 'MEDIUM'}
  ],

  non_functional_requirements: [
    {requirement: 'Performance', specification: '<30s for 128 tables, 5 concurrent connections, 30s timeout, 512MB memory'},
    {requirement: 'Security', specification: 'rls_auditor SELECT-only, 90-day rotation, GitHub Secrets storage'},
    {requirement: 'Reliability', specification: 'Fail-safe design, 3 retry attempts, <5% false positive rate'},
    {requirement: 'Auditability', specification: 'All runs logged, reports stored 7 days'}
  ],

  test_scenarios: [
    {scenario: 'SMOKE-1: Script Execution', steps: ['node scripts/verify-rls-policies.js'], expected: 'Exit 0, JSON output, <30s', priority: 'CRITICAL'},
    {scenario: 'SMOKE-2: Role Permissions', steps: ['Query has_table_privilege'], expected: 'Returns true', priority: 'CRITICAL'},
    {scenario: 'SMOKE-3: Workflow Syntax', steps: ['actionlint workflow file'], expected: 'No errors', priority: 'HIGH'},
    {scenario: 'SMOKE-4: Missing RLS Detection', steps: ['Disable RLS on test table', 'Run script'], expected: 'Exit 1, reports missing', priority: 'CRITICAL'},
    {scenario: 'SMOKE-5: PLAN Integration', steps: ['Run handoff system'], expected: 'Includes RLS results', priority: 'MEDIUM'}
  ],

  acceptance_criteria: '✅ 92 tables verified | ✅ GitHub blocks on failures | ✅ PLAN includes RLS | ✅ Zero manual checks | ✅ Emergency override tested | ✅ <30s execution',

  implementation_approach: 'Phase 1 (1h): rls_auditor role | Phase 2 (2h): verify-rls-policies.js | Phase 3 (0.5h): GitHub Actions | Phase 4 (0.5h): PLAN integration | Phase 5 (0.5h): Testing',

  dependencies: 'Supabase staging, GitHub Actions, pg library, PostgreSQL 15+, unified-handoff-system.js',

  risks: [
    {risk: 'rls_auditor broader access', severity: 'LOW', mitigation: 'SELECT-only on system catalogs'},
    {risk: 'False positives', severity: 'MEDIUM', mitigation: 'Emergency override with CODEOWNERS'},
    {risk: 'Query timeout', severity: 'LOW', mitigation: '17ms actual, 30s timeout = 100x buffer'}
  ],

  metadata: {
    subagent_consultations: [
      {agent: 'Security Architect', recommendation: 'CONDITIONAL_APPROVE'},
      {agent: 'Database Architect', recommendation: 'APPROVE'},
      {agent: 'DevOps Platform Architect', recommendation: 'APPROVE'}
    ],
    estimated_effort_hours: 4.5,
    complexity_level: 'MODERATE',
    target_application: 'EHG'
  },

  created_by: 'PLAN Agent',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  phase: 'planning_complete',
  progress: 0
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prd)
  .select()
  .single();

if (error) {
  console.error('❌ Error:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('✅ PRD created successfully');
console.log('PRD ID:', data.id);
console.log('Directive ID:', data.directive_id);
console.log('SD UUID:', data.sd_uuid);
