#!/usr/bin/env node

/**
 * Create 3 Strategic Directives from Retrospective Analysis
 * Based on feasibility analysis of top 10 improvement areas
 *
 * Created: 2025-10-04
 * Source: Retrospective analysis of Oct 1-4, 2025 data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const timestamp = new Date().toISOString();

// SD 1: RLS Policy Verification (HIGH PRIORITY)
const sdSecurity002 = {
  id: crypto.randomUUID(),
  sd_key: 'SD-SECURITY-002',
  title: 'RLS Policy Verification Automation',
  version: '1.0.0',
  status: 'draft',
  category: 'security_infrastructure',
  priority: 'high',

  description: `Automate Row-Level Security (RLS) policy verification to prevent data exposure vulnerabilities in production. Currently, RLS verification requires manual staging environment checks, creating risk of deployment without proper security validation.

**CURRENT STATE**:
- ✅ 74 files implement RLS policies across codebase
- ✅ Manual RLS verification documented in CLAUDE.md
- ❌ No automated RLS policy verification script
- ❌ Anon key cannot query pg_policies table
- ❌ Service role key not configured for schema inspection

**GAP IDENTIFIED** (from retrospective analysis):
- Multiple retrospectives flagged "RLS policy verification limited without service role key"
- Manual verification is error-prone and time-consuming
- No CI/CD integration for security policy validation

**TARGET OUTCOME**:
- Automated script to verify all RLS policies are enabled
- Service role key integration with security review
- Integration with PLAN verification phase
- Staging environment validation before production deployment`,

  strategic_intent: 'Eliminate manual RLS verification bottleneck and prevent data security vulnerabilities by automating policy verification as part of the LEO Protocol PLAN verification phase.',

  rationale: `**Business Impact**:
- Data breach prevention (critical for Series A readiness)
- Faster deployment cycles (no manual staging checks)
- Compliance with security best practices

**Technical Justification**:
- Service role key access is standard for schema operations
- pg_policies table query is read-only (low risk)
- Automation prevents human error in security validation

**From Retrospective Data**:
- Improvement area #9 in feasibility analysis
- Identified across multiple SD completions
- Estimated 4 hours implementation effort`,

  scope: `**PHASE 1: Security Review & Service Role Setup** (1 hour)
1. Review service role key security implications
2. Add SUPABASE_SERVICE_ROLE_KEY to .env.example
3. Document key rotation policy
4. Add key to environment variables (encrypted)

**PHASE 2: RLS Verification Script** (2 hours)
5. Create scripts/verify-rls-policies.js
6. Query pg_policies table for all app tables
7. Check rls_enabled flag on each table
8. Verify policies exist for INSERT, UPDATE, DELETE, SELECT
9. Generate verification report (pass/fail)

**PHASE 3: PLAN Integration** (0.5 hours)
10. Integrate verification into PLAN supervisor mode
11. Add to unified-handoff-system.js validation
12. Update CLAUDE.md with automated verification

**PHASE 4: CI/CD Integration** (0.5 hours)
13. Add RLS verification to GitHub Actions
14. Create workflow for staging deployment
15. Block production deployment if RLS verification fails`,

  success_criteria: [
    'scripts/verify-rls-policies.js successfully queries pg_policies table',
    'Script verifies RLS is enabled on all tables with user data',
    'Script checks policies exist for all CRUD operations',
    'PLAN verification phase automatically runs RLS verification',
    'GitHub Actions workflow blocks deployment on RLS policy failures',
    'Service role key documented with rotation policy',
    'Zero manual RLS verification steps required'
  ],

  key_principles: [
    'Security-first: Read-only service role usage',
    'Fail-safe: Block deployment on verification failure',
    'Transparency: Clear reporting of policy status',
    'Automation: Zero manual intervention required'
  ],

  implementation_guidelines: [
    '**STEP 1: Service Role Security Review**',
    '1. Review Supabase service role key documentation',
    '2. Create .env.example entry with placeholder',
    '3. Document key permissions (schema read-only)',
    '4. Add key rotation schedule to security docs',
    '',
    '**STEP 2: Create Verification Script**',
    '5. Create scripts/verify-rls-policies.js',
    '6. Import pg library for direct Postgres connection',
    '7. Query information_schema.tables for app tables',
    '8. Query pg_policies for each table',
    '9. Verify rls_enabled = true on all tables',
    '10. Check policies cover INSERT, UPDATE, DELETE, SELECT',
    '11. Generate JSON report with pass/fail per table',
    '',
    '**STEP 3: Integration Testing**',
    '12. Test script against staging database',
    '13. Verify detection of missing RLS policies',
    '14. Confirm false positives are minimal',
    '',
    '**STEP 4: PLAN Phase Integration**',
    '15. Update unified-handoff-system.js',
    '16. Add RLS verification to validatePlanVerification()',
    '17. Require RLS verification score >= 100',
    '',
    '**STEP 5: CI/CD Workflow**',
    '18. Create .github/workflows/rls-verification.yml',
    '19. Run on pull requests to main branch',
    '20. Block merge if RLS verification fails'
  ],

  dependencies: [
    'SUPABASE_SERVICE_ROLE_KEY environment variable',
    'pg library (already installed)',
    'Access to Supabase staging environment',
    'unified-handoff-system.js (exists)'
  ],

  risks: [
    {
      risk: 'Service role key exposure',
      mitigation: 'Encrypt in environment, document rotation policy',
      severity: 'MEDIUM'
    },
    {
      risk: 'False positives blocking deployment',
      mitigation: 'Comprehensive testing in staging, manual override capability',
      severity: 'LOW'
    },
    {
      risk: 'pg_policies query performance',
      mitigation: 'Query is read-only and infrequent, cached results',
      severity: 'LOW'
    }
  ],

  success_metrics: [
    {
      metric: 'RLS verification automation rate',
      target: '100%',
      current: '0%'
    },
    {
      metric: 'Manual RLS checks per deployment',
      target: '0',
      current: '1-2'
    },
    {
      metric: 'RLS verification time',
      target: '<30 seconds',
      current: '15-30 minutes (manual)'
    }
  ],

  stakeholders: ['LEAD Agent', 'PLAN Agent', 'Chief Security Architect Sub-Agent', 'DevOps Platform Architect'],

  created_by: 'RETROSPECTIVE_ANALYSIS_2025_10_04',
  approved_by: null,
  approval_date: null,
  created_at: timestamp,
  updated_at: timestamp,
  updated_by: 'RETROSPECTIVE_ANALYSIS_2025_10_04',
  is_active: true,
  metadata: {
    source: 'retrospective_analysis',
    analysis_date: '2025-10-04',
    improvement_area_rank: 9,
    estimated_effort_hours: 4,
    retrospectives_analyzed: 10,
    feasibility_status: 'CHALLENGING_BUT_ACHIEVABLE',
    existing_infrastructure_pct: 10
  }
};

// SD 2: Test Coverage Policy (MEDIUM PRIORITY - QUICK WIN)
const sdQuality002 = {
  id: crypto.randomUUID(),
  sd_key: 'SD-QUALITY-002',
  title: 'Test Coverage Policy by LOC Threshold',
  version: '1.0.0',
  status: 'draft',
  category: 'quality_assurance',
  priority: 'medium',

  description: `Define and enforce test coverage requirements based on Lines of Code (LOC) thresholds to provide clear guidance for when unit tests are required vs optional.

**CURRENT STATE**:
- ✅ Jest coverage infrastructure configured (50% floor)
- ✅ Coverage reporting in package.json
- ✅ QA sub-agent performs conditional approvals
- ❌ No codified LOC-based policy
- ❌ Inconsistent test coverage decisions

**GAP IDENTIFIED** (from retrospective analysis):
- QA sub-agent flagged 0% coverage for 17 LOC function
- Accepted as "conditional approval" but no policy guidance
- Retrospective recommended: "Define test coverage policy by LOC threshold"

**TARGET OUTCOME**:
- Clear LOC thresholds in database (e.g., <20 LOC = optional, >20 LOC = required)
- QA sub-agent references policy automatically
- Documented in CLAUDE.md and testing guidelines
- Consistent conditional approval criteria`,

  strategic_intent: 'Eliminate ambiguity in test coverage requirements by providing objective, LOC-based thresholds that balance quality assurance with pragmatic development velocity.',

  rationale: `**Business Impact**:
- Faster PR reviews (clear acceptance criteria)
- Consistent quality standards across team
- Reduced debate on "how much testing is enough?"

**Technical Justification**:
- Simple functions (<20 LOC) have low bug risk
- Complex functions (>20 LOC) benefit from unit tests
- Policy-driven decisions reduce cognitive load

**From Retrospective Data**:
- Improvement area #8 in feasibility analysis
- QA sub-agent already performs conditional approvals
- Estimated 1 hour implementation effort`,

  scope: `**PHASE 1: Policy Definition** (0.5 hours)
1. Research industry standards for test coverage thresholds
2. Define LOC tiers:
   - Tier 1: <20 LOC = tests optional (simple logic)
   - Tier 2: 20-50 LOC = tests recommended (moderate complexity)
   - Tier 3: >50 LOC = tests required (high complexity)
3. Document rationale for each tier

**PHASE 2: Database Schema** (0.25 hours)
4. Create test_coverage_policies table
5. Add columns: loc_threshold, requirement_level, description
6. Insert 3 policy tiers

**PHASE 3: QA Sub-Agent Integration** (0.25 hours)
7. Update QA sub-agent to query test_coverage_policies table
8. Modify conditional approval logic to reference policy
9. Include policy tier in approval rationale

**PHASE 4: Documentation** (0 hours - already complete)
10. Update CLAUDE.md with LOC thresholds
11. Add to testing guidelines
12. Create examples for each tier`,

  success_criteria: [
    'test_coverage_policies table exists with 3 tiers',
    'QA sub-agent queries policy before conditional approval',
    'Approval messages reference specific LOC tier',
    'CLAUDE.md documents all 3 tiers with examples',
    'Zero ambiguity in test coverage requirements'
  ],

  key_principles: [
    'Objective criteria: LOC-based thresholds',
    'Pragmatic balance: Quality vs velocity',
    'Clear communication: Policy referenced in approvals',
    'Database-driven: Single source of truth'
  ],

  implementation_guidelines: [
    '**STEP 1: Define Policy Tiers**',
    '1. Tier 1: <20 LOC - Tests optional (simple getters, setters, helpers)',
    '2. Tier 2: 20-50 LOC - Tests recommended (business logic, API calls)',
    '3. Tier 3: >50 LOC - Tests required (complex algorithms, state management)',
    '',
    '**STEP 2: Create Database Table**',
    '4. Create database/migrations/add-test-coverage-policies.sql',
    '5. Add table: test_coverage_policies (id, loc_min, loc_max, requirement_level, description)',
    '6. Insert 3 policy rows',
    '7. Execute migration via scripts/execute-database-sql.js',
    '',
    '**STEP 3: Update QA Sub-Agent**',
    '8. Modify lib/agents/qa-sub-agent.js or equivalent',
    '9. Add query: SELECT * FROM test_coverage_policies WHERE loc >= function_loc',
    '10. Include policy tier in conditional approval message',
    '',
    '**STEP 4: Update CLAUDE.md**',
    '11. Add Test Coverage Policy section',
    '12. Document all 3 tiers with examples',
    '13. Reference in QA sub-agent description'
  ],

  dependencies: [
    'QA sub-agent script (exists)',
    'Database migration infrastructure (exists)',
    'LOC counting capability in QA sub-agent'
  ],

  risks: [
    {
      risk: 'LOC thresholds too strict',
      mitigation: 'Start lenient, adjust based on team feedback',
      severity: 'LOW'
    },
    {
      risk: 'Policy not followed',
      mitigation: 'Enforce via QA sub-agent automation',
      severity: 'LOW'
    }
  ],

  success_metrics: [
    {
      metric: 'Conditional approval consistency',
      target: '100% reference policy',
      current: '0% (no policy)'
    },
    {
      metric: 'Test coverage ambiguity',
      target: '0 debates per week',
      current: '1-2 debates per week'
    }
  ],

  stakeholders: ['QA Engineering Director Sub-Agent', 'PLAN Agent', 'EXEC Agent'],

  created_by: 'RETROSPECTIVE_ANALYSIS_2025_10_04',
  approved_by: null,
  approval_date: null,
  created_at: timestamp,
  updated_at: timestamp,
  updated_by: 'RETROSPECTIVE_ANALYSIS_2025_10_04',
  is_active: true,
  metadata: {
    source: 'retrospective_analysis',
    analysis_date: '2025-10-04',
    improvement_area_rank: 8,
    estimated_effort_hours: 1,
    retrospectives_analyzed: 10,
    feasibility_status: 'VERY_REALISTIC',
    existing_infrastructure_pct: 40
  }
};

// SD 3: SELECT * Query Optimization (MEDIUM PRIORITY - QUICK WIN)
const sdPerformance001 = {
  id: crypto.randomUUID(),
  sd_key: 'SD-PERFORMANCE-001',
  title: 'SELECT * Query Optimization Enforcement',
  version: '1.0.0',
  status: 'draft',
  category: 'performance_optimization',
  priority: 'medium',

  description: `Eliminate inefficient SELECT * queries across the codebase and prevent future instances through automated enforcement.

**CURRENT STATE**:
- ❌ 17 occurrences of SELECT * across 12 files
- ❌ No linting rule to prevent SELECT *
- ❌ No pre-commit hook enforcement
- ✅ Performance sub-agent exists (lib/agents/performance-sub-agent.js)

**GAP IDENTIFIED** (from retrospective analysis):
- Retrospectives flagged: "SELECT * used instead of specific columns - optimization opportunity"
- Bandwidth waste on large tables (ventures, strategic_directives_v2)
- No automated detection or prevention

**TARGET OUTCOME**:
- Zero SELECT * queries in production code
- ESLint rule blocks new instances
- Existing instances replaced with column lists
- Performance guidelines documented`,

  strategic_intent: 'Optimize database bandwidth and query performance by enforcing explicit column selection, reducing data transfer and improving application responsiveness.',

  rationale: `**Business Impact**:
- Reduced database bandwidth costs (estimated 20-30% reduction)
- Faster query response times
- Improved application performance

**Technical Justification**:
- SELECT * pulls unnecessary columns (created_at, updated_at, metadata)
- Explicit columns enable query optimization
- Industry best practice for production code

**From Retrospective Data**:
- Improvement area #10 in feasibility analysis
- 17 instances found across 12 files
- Estimated 2 hours implementation effort`,

  scope: `**PHASE 1: Analysis** (0.5 hours)
1. Audit all 17 SELECT * instances
2. Identify required columns for each query
3. Document replacement column lists

**PHASE 2: Migration** (1 hour)
4. Create migration script to replace SELECT * with column lists
5. Execute migration on all 12 files
6. Test queries return expected data
7. Verify application functionality unchanged

**PHASE 3: Enforcement** (0.5 hours)
8. Add ESLint rule to detect SELECT * in JavaScript/TypeScript
9. Create pre-commit hook to block SELECT * commits
10. Add to CI/CD pipeline as blocking check
11. Document in performance guidelines`,

  success_criteria: [
    'Zero SELECT * queries in src/ directory',
    'ESLint rule detects and blocks SELECT * in code',
    'Pre-commit hook prevents new SELECT * instances',
    'Performance guidelines document explicit column selection',
    'All 17 instances replaced with explicit columns',
    'Application functionality unchanged after migration'
  ],

  key_principles: [
    'Performance-first: Minimize data transfer',
    'Explicit over implicit: Clear column selection',
    'Automated enforcement: Linting + pre-commit hooks',
    'Zero regression: Comprehensive testing'
  ],

  implementation_guidelines: [
    '**STEP 1: Audit Existing Queries**',
    '1. Run: grep -r "SELECT \\*" scripts/ src/',
    '2. Document each instance with file path and line number',
    '3. Identify required columns for each query',
    '',
    '**STEP 2: Create Migration Script**',
    '4. Create scripts/optimize-select-queries.js',
    '5. Define column mappings for each table:',
    '   - strategic_directives_v2: id, sd_key, title, status, priority, description',
    '   - product_requirements_v2: id, title, status, phase, metadata',
    '   - ventures: id, name, status, current_workflow_stage',
    '6. Replace SELECT * with explicit columns',
    '7. Add .bak file creation for rollback safety',
    '',
    '**STEP 3: Execute Migration**',
    '8. Run migration script on all 12 files',
    '9. Test each affected query',
    '10. Verify dashboard loads correctly',
    '11. Run test suite to confirm no regressions',
    '',
    '**STEP 4: Add ESLint Rule**',
    '12. Create eslint-plugin-custom-rules/no-select-star.js',
    '13. Detect "SELECT *" in template literals',
    '14. Add to .eslintrc.js',
    '15. Test rule with existing code',
    '',
    '**STEP 5: Pre-Commit Hook**',
    '16. Create .husky/pre-commit hook',
    '17. Run grep for "SELECT \\*" in staged files',
    '18. Block commit if detected',
    '19. Provide helpful error message with guidance',
    '',
    '**STEP 6: Documentation**',
    '20. Update docs/PERFORMANCE_GUIDELINES.md',
    '21. Add example: SELECT id, name vs SELECT *',
    '22. Document ESLint rule and pre-commit hook'
  ],

  dependencies: [
    'ESLint configuration (exists)',
    'Husky pre-commit hooks (check if exists)',
    'Performance sub-agent (exists)',
    'Test suite for regression detection'
  ],

  risks: [
    {
      risk: 'Breaking queries by missing required columns',
      mitigation: 'Comprehensive testing, .bak file rollback',
      severity: 'MEDIUM'
    },
    {
      risk: 'False positives in ESLint rule',
      mitigation: 'Whitelist non-SQL SELECT * (e.g., comments)',
      severity: 'LOW'
    },
    {
      risk: 'Developer resistance to explicit columns',
      mitigation: 'Document performance benefits, show metrics',
      severity: 'LOW'
    }
  ],

  success_metrics: [
    {
      metric: 'SELECT * instances in codebase',
      target: '0',
      current: '17'
    },
    {
      metric: 'Average query response time',
      target: '-20% reduction',
      current: 'Baseline (TBD)'
    },
    {
      metric: 'Database bandwidth usage',
      target: '-25% reduction',
      current: 'Baseline (TBD)'
    }
  ],

  stakeholders: ['Performance Engineering Lead Sub-Agent', 'EXEC Agent', 'Principal Database Architect'],

  created_by: 'RETROSPECTIVE_ANALYSIS_2025_10_04',
  approved_by: null,
  approval_date: null,
  created_at: timestamp,
  updated_at: timestamp,
  updated_by: 'RETROSPECTIVE_ANALYSIS_2025_10_04',
  is_active: true,
  metadata: {
    source: 'retrospective_analysis',
    analysis_date: '2025-10-04',
    improvement_area_rank: 10,
    estimated_effort_hours: 2,
    retrospectives_analyzed: 10,
    feasibility_status: 'VERY_REALISTIC',
    existing_infrastructure_pct: 20
  }
};

// Insert all 3 SDs
console.log('📝 Creating 3 Strategic Directives from Retrospective Analysis\n');
console.log('═'.repeat(70));

const sds = [
  { sd: sdSecurity002, label: 'SD-SECURITY-002 (HIGH Priority - RLS Verification)' },
  { sd: sdQuality002, label: 'SD-QUALITY-002 (MEDIUM Priority - Test Coverage Policy)' },
  { sd: sdPerformance001, label: 'SD-PERFORMANCE-001 (MEDIUM Priority - SELECT * Optimization)' }
];

for (const { sd, label } of sds) {
  console.log(`\n📌 ${label}`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Effort: ${sd.metadata.estimated_effort_hours} hours`);
  console.log(`   Feasibility: ${sd.metadata.feasibility_status}`);

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sd)
    .select();

  if (error) {
    console.error(`   ❌ Error: ${error.message}`);
    process.exit(1);
  }

  console.log(`   ✅ Created: ${data[0].sd_key}`);
}

console.log('\n' + '═'.repeat(70));
console.log('📊 SUMMARY');
console.log('   Total SDs Created: 3');
console.log('   Total Effort: 7 hours');
console.log('   Status: draft (requires LEAD approval)');
console.log('');
console.log('🎯 NEXT STEPS');
console.log('   1. LEAD review: node scripts/query-active-sds.js');
console.log('   2. Approve SDs: node scripts/lead-approve-sdip.js');
console.log('   3. Create PRDs: Use LEO Protocol LEAD→PLAN handoff');
console.log('');
console.log('✅ All retrospective improvement SDs created successfully!');
