#!/usr/bin/env node

/**
 * Strategic Directive: Runtime Audit Infrastructure Fixes
 *
 * ORCHESTRATOR SD with 4 CHILD SDs
 *
 * Created from: EHG Runtime Audit - December 26, 2025
 * Triangulated Analysis: Claude Code + OpenAI ChatGPT + Google Antigravity
 *
 * Issues Addressed:
 * - A-06: chairman_pending_decisions view missing (404)
 * - A-08: ventures column mismatch - stage vs current_lifecycle_stage (400)
 * - A-09: EVA insights API routing returns HTML instead of JSON
 * - A-01, A-02, A-03: UX cleanup (persona toggle, route maturity, logo navigation)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TODAY = new Date().toISOString();
const AUDIT_DATE = '2025-12-26';

// ============================================================================
// TRIANGULATION EVIDENCE (Reference Links)
// ============================================================================
const TRIANGULATION_EVIDENCE = {
  summary: 'Root cause analysis triangulated across 3 AI models',
  models: {
    claude_code: {
      agent: 'Claude Code (Opus 4.5)',
      role: 'Codebase exploration + database verification',
      findings: [
        'A-06: Migration exists at supabase/migrations/20251216000001_chairman_unified_decisions.sql but not applied',
        'A-07: FALSE ALARM - table exists as crewai_crews (correct name)',
        'A-08: ventures table has current_lifecycle_stage, not stage',
        'A-09: Endpoint exists but routing returns HTML'
      ]
    },
    openai: {
      agent: 'OpenAI ChatGPT',
      role: 'Query location tracing + schema drift analysis',
      findings: [
        'A-06: Query at useChairmanDashboardData.ts:169-186, view in migration but not applied',
        'A-08: Code uses current_lifecycle_stage but base migrations use stage - drift detected',
        'A-09: Next.js routing issue - SPA fallback returning HTML for API route'
      ]
    },
    antigravity: {
      agent: 'Google Antigravity (Gemini)',
      role: 'Column mismatch detection + auth middleware analysis',
      findings: [
        'A-06: Migration 20251216000001 not applied or failed',
        'A-08: useChairmanData.ts:219-231 uses stage but DB has current_lifecycle_stage',
        'A-09: withChairmanAuth middleware may be failing and returning HTML error page'
      ]
    }
  },
  consensus: {
    'A-06': 'HIGH - All 3 confirm migration exists but not applied to remote DB',
    'A-08': 'HIGH - All 3 confirm column name mismatch (stage vs current_lifecycle_stage)',
    'A-09': 'MEDIUM-HIGH - All 3 confirm routing issue, different hypotheses on exact cause'
  },
  database_verification: {
    agent: 'Claude Code Database Agent',
    confirmed: [
      'chairman_pending_decisions VIEW does NOT exist',
      'crewai_crews table EXISTS (A-07 was false alarm)',
      'ventures.current_lifecycle_stage column EXISTS',
      'ventures.stage column does NOT exist',
      '23+ migrations pending application to remote DB'
    ]
  }
};

// ============================================================================
// PARENT ORCHESTRATOR SD
// ============================================================================
const parentSD = {
  id: 'SD-RUNTIME-AUDIT-001',
  sd_key: 'SD-RUNTIME-AUDIT-001',
  uuid_id: randomUUID(),

  // LEO Protocol hierarchy fields (per docs/reference/sd-hierarchy-schema-guide.md)
  relationship_type: 'parent',
  sd_type: 'orchestrator',
  sequence_rank: 1,

  title: 'EHG Runtime Audit - Critical Infrastructure Fixes',

  description: `Orchestrator SD for addressing critical infrastructure issues discovered during the EHG runtime audit on ${AUDIT_DATE}.

This audit was conducted using a triangulation methodology with 3 AI models (Claude Code, OpenAI ChatGPT, Google Antigravity) to identify and confirm root causes before proposing fixes.

Issues identified:
- A-06: Chairman dashboard 404 errors (missing database view)
- A-08: Ventures API 400 errors (column name mismatch)
- A-09: EVA insights returning HTML instead of JSON (routing issue)
- A-01/A-02/A-03: UX cleanup items (persona toggle, route maturity, logo navigation)`,

  rationale: `The Chairman Console and core venture management features are non-functional due to:
1. 23+ pending database migrations not applied to remote Supabase instance
2. Schema drift between frontend code expectations and actual database columns
3. API routing misconfiguration causing HTML fallback instead of JSON responses

These issues block basic product functionality and must be resolved before further development.`,

  scope: JSON.stringify({
    in_scope: [
      'Apply pending Supabase migrations (fixes A-06)',
      'Resolve column name mismatches in ventures queries (fixes A-08)',
      'Fix API routing for chairman insights endpoint (fixes A-09)',
      'Clean up legacy UX elements: persona toggle, route maturity filters, logo navigation (fixes A-01, A-02, A-03)'
    ],
    out_of_scope: [
      'New feature development',
      'Performance optimization beyond fixing broken functionality',
      'Refactoring beyond minimal fixes'
    ],
    constraints: [
      'Minimal diffs - fix only what is broken',
      'Regression test all changes',
      'Do not introduce new technical debt'
    ]
  }),

  category: 'infrastructure',
  priority: 'critical',
  status: 'active',
  target_application: 'EHG',
  current_phase: 'LEAD',

  strategic_intent: 'Restore core EHG application functionality by resolving critical infrastructure gaps identified through triangulated AI analysis.',

  strategic_objectives: [
    'Apply all pending Supabase migrations to remote database',
    'Align frontend query column names with actual database schema',
    'Fix API routing to return JSON for all API endpoints',
    'Remove legacy UX elements that no longer serve a purpose'
  ],

  success_criteria: [
    'Chairman Console loads without 404/400 errors',
    'Ventures API queries return valid data',
    'EVA insights endpoint returns JSON',
    'Persona toggle removed or assessed',
    'All E2E tests pass'
  ],

  key_changes: [
    'Database: Apply 23+ pending migrations via npx supabase db push',
    'Frontend: Update stage → current_lifecycle_stage in queries',
    'Backend: Fix Next.js API routing configuration',
    'UI: Remove persona toggle and route maturity filters'
  ],

  key_principles: [
    'Triangulated diagnosis before any fixes',
    'Minimal viable changes only',
    'Regression testing mandatory',
    'Document all changes for future reference'
  ],

  dependencies: [],

  risks: [
    {
      description: 'Migration application could affect production data',
      mitigation: 'Review migrations before applying; use staging if available',
      severity: 'medium'
    },
    {
      description: 'Column rename may have cascading effects',
      mitigation: 'Search all code references before changing; run full test suite',
      severity: 'medium'
    }
  ],

  metadata: {
    is_orchestrator: true,
    child_sd_count: 4,
    child_sds: [
      'SD-RUNTIME-AUDIT-001A',
      'SD-RUNTIME-AUDIT-001B',
      'SD-RUNTIME-AUDIT-001C',
      'SD-RUNTIME-AUDIT-001D'
    ],
    audit_date: AUDIT_DATE,
    triangulation_evidence: TRIANGULATION_EVIDENCE,
    issues_addressed: ['A-06', 'A-08', 'A-09', 'A-01', 'A-02', 'A-03'],
    estimated_effort: '4-8 hours total'
  },

  created_by: 'Chairman + Claude Code',
  created_at: TODAY,
  updated_at: TODAY,
  version: '1.0',
  is_active: true,
  progress: 0,
  phase_progress: 0
};

// ============================================================================
// CHILD SD 1: Apply Pending Migrations (A-06)
// ============================================================================
const childSD_A = {
  id: 'SD-RUNTIME-AUDIT-001A',
  sd_key: 'SD-RUNTIME-AUDIT-001A',
  uuid_id: randomUUID(),
  parent_sd_id: 'SD-RUNTIME-AUDIT-001',

  // LEO Protocol hierarchy fields (per docs/reference/sd-hierarchy-schema-guide.md)
  relationship_type: 'child',
  sd_type: 'implementation',
  sequence_rank: 1,

  title: 'Apply Pending Supabase Migrations',

  description: `Apply 23+ pending database migrations to the remote Supabase instance.

Root Cause (Triangulated):
- Migration file exists: supabase/migrations/20251216000001_chairman_unified_decisions.sql
- Creates VIEW: chairman_pending_decisions
- Migration was never applied to remote database
- PostgREST returns 404 for non-existent relations

Evidence:
- Claude Code: Confirmed migration exists, view missing in DB
- OpenAI: Located query at useChairmanDashboardData.ts:169-186
- Antigravity: Migration either not applied, failed, or view was dropped`,

  rationale: 'The chairman_pending_decisions view is required for the Chairman Console Decision Stack. Without it, the dashboard shows errors.',

  scope: JSON.stringify({
    in_scope: ['Apply all pending migrations via npx supabase db push'],
    out_of_scope: ['Creating new migrations', 'Schema redesign'],
    fix_approach: 'cd ../ehg && npx supabase db push'
  }),

  category: 'infrastructure',
  priority: 'critical',
  status: 'active',
  target_application: 'EHG',
  current_phase: 'EXEC',

  strategic_intent: 'Restore database schema to expected state by applying pending migrations.',

  success_criteria: [
    'chairman_pending_decisions view exists in database',
    'No more 404 errors on chairman dashboard queries',
    'All 23+ pending migrations applied successfully'
  ],

  key_changes: [
    'Run: cd ../ehg && npx supabase db push'
  ],

  metadata: {
    issue_id: 'A-06',
    severity: 'Critical',
    root_cause: 'Migration not applied to remote DB',
    fix_command: 'npx supabase db push',
    affected_files: [
      'supabase/migrations/20251216000001_chairman_unified_decisions.sql',
      'supabase/migrations/20251216000002_get_pending_chairman_items_rpc.sql'
    ],
    triangulation_consensus: 'HIGH'
  },

  created_by: 'Claude Code',
  created_at: TODAY,
  updated_at: TODAY,
  version: '1.0',
  is_active: true,
  progress: 0
};

// ============================================================================
// CHILD SD 2: Fix Column Name Mismatch (A-08)
// ============================================================================
const childSD_B = {
  id: 'SD-RUNTIME-AUDIT-001B',
  sd_key: 'SD-RUNTIME-AUDIT-001B',
  uuid_id: randomUUID(),
  parent_sd_id: 'SD-RUNTIME-AUDIT-001',

  // LEO Protocol hierarchy fields (per docs/reference/sd-hierarchy-schema-guide.md)
  relationship_type: 'child',
  sd_type: 'implementation',
  sequence_rank: 2,

  title: 'Fix Ventures Column Name Mismatch (stage → current_lifecycle_stage)',

  description: `Resolve column name mismatch causing 400 Bad Request errors on ventures queries.

Root Cause (Triangulated):
- Frontend code queries: .select('..., stage, ...')
- Database column is: current_lifecycle_stage
- PostgREST returns 400 for non-existent columns

Evidence:
- Claude Code: ventures.current_lifecycle_stage exists, ventures.stage does NOT exist
- OpenAI: Schema drift - code at ventures.ts:27-44 uses wrong column names
- Antigravity: useChairmanData.ts:219-231 uses stage but DB has current_lifecycle_stage`,

  rationale: 'The ventures API is returning 400 errors because queries reference columns that do not exist in the database schema.',

  scope: JSON.stringify({
    in_scope: [
      'Update all code references from stage to current_lifecycle_stage',
      'Verify all ventures queries use correct column names'
    ],
    out_of_scope: ['Renaming database columns', 'Adding new columns'],
    files_to_check: [
      'src/hooks/useChairmanData.ts',
      'src/hooks/useChairmanDashboardData.ts',
      'src/services/ventures.ts',
      'src/pages/api/v2/ventures/*.ts'
    ]
  }),

  category: 'bug_fix',
  priority: 'critical',
  status: 'active',
  target_application: 'EHG',
  current_phase: 'PLAN',

  strategic_intent: 'Align frontend query column names with actual database schema.',

  success_criteria: [
    'No 400 errors on ventures queries',
    'All venture data loads correctly',
    'E2E tests pass'
  ],

  key_changes: [
    'Replace stage with current_lifecycle_stage in all query selects',
    'Update any related TypeScript interfaces'
  ],

  metadata: {
    issue_id: 'A-08',
    severity: 'Critical',
    root_cause: 'Column name mismatch - code uses stage, DB has current_lifecycle_stage',
    affected_files: [
      'src/hooks/useChairmanData.ts',
      'src/hooks/useChairmanDashboardData.ts',
      'src/services/ventures.ts'
    ],
    triangulation_consensus: 'HIGH'
  },

  created_by: 'Claude Code',
  created_at: TODAY,
  updated_at: TODAY,
  version: '1.0',
  is_active: true,
  progress: 0
};

// ============================================================================
// CHILD SD 3: Fix API Routing (A-09)
// ============================================================================
const childSD_C = {
  id: 'SD-RUNTIME-AUDIT-001C',
  sd_key: 'SD-RUNTIME-AUDIT-001C',
  uuid_id: randomUUID(),
  parent_sd_id: 'SD-RUNTIME-AUDIT-001',

  // LEO Protocol hierarchy fields (per docs/reference/sd-hierarchy-schema-guide.md)
  relationship_type: 'child',
  sd_type: 'implementation',
  sequence_rank: 3,

  title: 'Fix EVA Insights API Routing (HTML → JSON)',

  description: `Resolve API routing issue where /api/v2/chairman/insights returns HTML instead of JSON.

Root Cause (Triangulated):
- Endpoint exists at: src/pages/api/v2/chairman/insights.ts
- Request returns HTML error page instead of JSON
- Client receives: <!DOCTYPE...> and fails JSON.parse()

Evidence:
- Claude Code: Endpoint file exists but routing/proxy issue at localhost:8080
- OpenAI: Next.js routing issue - SPA fallback returning HTML for API route
- Antigravity: withChairmanAuth middleware may be failing and redirecting to HTML error`,

  rationale: 'The EVA insights panel cannot load because the API returns HTML instead of JSON, causing client-side parse errors.',

  scope: JSON.stringify({
    in_scope: [
      'Investigate Vite/Next.js proxy configuration',
      'Fix API routing to return JSON',
      'Add error handling to prevent HTML fallback'
    ],
    out_of_scope: ['Rewriting the EVA insights endpoint', 'Authentication changes'],
    investigation_areas: [
      'vite.config.ts proxy settings',
      'Next.js API route configuration',
      'withChairmanAuth middleware error handling'
    ]
  }),

  category: 'bug_fix',
  priority: 'high',
  status: 'active',
  target_application: 'EHG',
  current_phase: 'PLAN',

  strategic_intent: 'Ensure all API endpoints return JSON responses, not HTML fallbacks.',

  success_criteria: [
    '/api/v2/chairman/insights returns JSON (200 or error)',
    'EVA panel loads in Chairman Console',
    'No JSON parse errors in console'
  ],

  key_changes: [
    'Review and fix proxy configuration',
    'Add proper error handling in API routes',
    'Ensure middleware returns JSON errors'
  ],

  metadata: {
    issue_id: 'A-09',
    severity: 'Major',
    root_cause: 'API routing returns HTML fallback instead of JSON',
    affected_files: [
      'src/pages/api/v2/chairman/insights.ts',
      'src/middleware/chairman-auth.ts',
      'vite.config.ts'
    ],
    triangulation_consensus: 'MEDIUM-HIGH'
  },

  created_by: 'Claude Code',
  created_at: TODAY,
  updated_at: TODAY,
  version: '1.0',
  is_active: true,
  progress: 0
};

// ============================================================================
// CHILD SD 4: UX Cleanup (A-01, A-02, A-03)
// ============================================================================
const childSD_D = {
  id: 'SD-RUNTIME-AUDIT-001D',
  sd_key: 'SD-RUNTIME-AUDIT-001D',
  uuid_id: randomUUID(),
  parent_sd_id: 'SD-RUNTIME-AUDIT-001',

  // LEO Protocol hierarchy fields (per docs/reference/sd-hierarchy-schema-guide.md)
  relationship_type: 'child',
  sd_type: 'implementation',
  sequence_rank: 4,

  title: 'UX Cleanup - Persona Toggle, Route Maturity, Logo Navigation',

  description: `Address legacy UX elements identified during runtime audit that need assessment/removal.

Issues:
- A-01: Persona toggle (Chairman/Builder/Both) in header - legacy from early architecture, needs assessment
- A-02: Route maturity filters in Settings → Navigation - may no longer be needed
- A-03: Sidebar logo not clickable to home - expected UX pattern missing

These are Minor severity items but affect user experience and indicate technical debt.`,

  rationale: 'Legacy UX elements create confusion and indicate unfinished cleanup from earlier development phases.',

  scope: JSON.stringify({
    in_scope: [
      'A-01: Assess persona toggle - inventory Builder-only routes before removal',
      'A-02: Assess route maturity filters - determine if still needed',
      'A-03: Make logo clickable to navigate to home'
    ],
    out_of_scope: ['Major navigation redesign', 'New features'],
    assessment_needed: [
      'What routes are Builder-only?',
      'Are any maturity levels still in use?',
      'What should "home" be - / or /chairman?'
    ]
  }),

  category: 'ux_improvement',
  priority: 'low',
  status: 'active',
  target_application: 'EHG',
  current_phase: 'LEAD',

  strategic_intent: 'Clean up legacy UX elements to improve user experience and reduce confusion.',

  success_criteria: [
    'Persona toggle: assessed and decision made (keep/remove)',
    'Route maturity: assessed and decision made',
    'Logo: clickable, navigates to appropriate home route'
  ],

  key_changes: [
    'Inventory persona-specific routes',
    'Review route maturity usage',
    'Add click handler to sidebar logo'
  ],

  metadata: {
    issue_ids: ['A-01', 'A-02', 'A-03'],
    severity: 'Minor',
    root_cause: 'Legacy architecture artifacts not cleaned up',
    affected_files: [
      'src/components/layout/Header.tsx',
      'src/pages/settings/NavigationSettings.tsx',
      'src/components/layout/Sidebar.tsx'
    ],
    requires_assessment: true
  },

  created_by: 'Claude Code',
  created_at: TODAY,
  updated_at: TODAY,
  version: '1.0',
  is_active: true,
  progress: 0
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function createRuntimeAuditSDs() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Creating Runtime Audit Strategic Directives                           ║');
  console.log('║  Orchestrator + 4 Child SDs                                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  const allSDs = [parentSD, childSD_A, childSD_B, childSD_C, childSD_D];
  const results = [];

  for (const sd of allSDs) {
    try {
      // Check if exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        console.log(`⚠️  ${sd.id} exists, updating...`);
        const { data, error } = await supabase
          .from('strategic_directives_v2')
          .update(sd)
          .eq('id', sd.id)
          .select()
          .single();

        if (error) throw error;
        results.push({ id: sd.id, status: 'updated', title: sd.title });
      } else {
        const { data, error } = await supabase
          .from('strategic_directives_v2')
          .insert(sd)
          .select()
          .single();

        if (error) throw error;
        results.push({ id: sd.id, status: 'created', title: sd.title });
      }

      console.log(`✅ ${sd.id}: ${sd.title}`);

    } catch (error) {
      console.error(`❌ ${sd.id} failed:`, error.message);
      results.push({ id: sd.id, status: 'failed', error: error.message });
    }
  }

  console.log('\n' + '═'.repeat(76));
  console.log('\n📊 Summary:');
  console.log('─'.repeat(40));

  results.forEach(r => {
    const icon = r.status === 'failed' ? '❌' : '✅';
    console.log(`${icon} ${r.id}: ${r.status}`);
  });

  console.log('\n📋 SD Hierarchy:');
  console.log('─'.repeat(40));
  console.log(`📁 ${parentSD.id} (Orchestrator)`);
  console.log(`   ├── ${childSD_A.id} - Migrations (A-06)`);
  console.log(`   ├── ${childSD_B.id} - Column Fix (A-08)`);
  console.log(`   ├── ${childSD_C.id} - API Routing (A-09)`);
  console.log(`   └── ${childSD_D.id} - UX Cleanup (A-01, A-02, A-03)`);

  console.log('\n🚀 Next Steps:');
  console.log('─'.repeat(40));
  console.log('1. Review SDs in database/admin UI');
  console.log('2. Start with SD-RUNTIME-AUDIT-001A (apply migrations)');
  console.log('3. Progress through remaining child SDs');
  console.log('4. Mark orchestrator complete when all children done');

  return results;
}

// Run
createRuntimeAuditSDs()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
