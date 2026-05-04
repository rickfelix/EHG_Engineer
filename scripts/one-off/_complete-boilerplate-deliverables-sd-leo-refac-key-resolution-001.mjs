// Mark auto-generated boilerplate deliverables complete with evidence.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '6b9f5205-6476-4428-8159-32447ddd2486';

const updates = [
  {
    id: '26a07a81-c2dd-4d11-9de6-51b4c0630f05', // configuration: Development environment setup
    completion_status: 'completed',
    completion_notes:
      'N/A for structural refactor SD. Helper module scripts/lib/sd-id-resolver.js is the deliverable; no environment changes required. Worktree isolation already in place. Vitest config unchanged.',
    completion_evidence: {
      reason: 'no-config-changes-required',
      verification: 'grep on .env, vitest.config, eslint.config — no SD-016-related changes needed beyond .eslintrc.json no-restricted-syntax rule',
      eslint_rule_added: '.eslintrc.json — no-restricted-syntax for .eq("id", sd_id-like)',
      commit: '17749fdfce',
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes:
      'ESLint regression rule installed in .eslintrc.json (Phase 5 deliverable). No other configuration changes required for this refactor SD.',
  },
  {
    id: '627973cf-6418-48d9-b4b0-efc4653c8a68', // documentation: Documentation updated
    completion_status: 'completed',
    completion_notes:
      'Documentation provided via: (1) JSDoc contract on scripts/lib/sd-id-resolver.js (resolveSdInput, resolveSdInputOrNull); (2) PRD test_scenarios TS-1..TS-12 in product_requirements_v2; (3) commit message details rationale + tier classification + verification steps; (4) inline migration comments at each migrated callsite (SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001 marker).',
    completion_evidence: {
      jsdoc_path: 'scripts/lib/sd-id-resolver.js',
      prd_id: 'PRD-SD-LEO-REFAC-CONSOLIDATE-KEY-RESOLUTION-001',
      commit: '17749fdfce',
      callsite_markers_count: 11,
      audit_memory: 'reference_sd_id_eq_query_audit_2026_05_03.md',
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes:
      'JSDoc on helper documents contract (throws on not-found, TypeError on bad input). PRD captures full migration scope. Commit message captures rationale and tier classification. Per-callsite markers ensure future readers can trace back to this SD.',
  },
];

for (const u of updates) {
  const { id, ...patch } = u;
  const { error } = await sb.from('sd_scope_deliverables').update(patch).eq('id', id);
  if (error) {
    console.error('FAILED for', id, error.message);
    process.exit(1);
  }
  console.log('completed:', id);
}
console.log('Done.');
