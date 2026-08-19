// Mark auto-generated boilerplate deliverables complete with evidence.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = 'db2122ec-2561-4e91-86ed-558bca57c9dc';

const updates = [
  {
    id: 'bfe29664-f7c3-45bb-a793-5e2dcd26f648', // configuration: Development environment setup
    completion_status: 'completed',
    completion_notes:
      'N/A for this SD. All 5 code FRs are query-shape/logic fixes to existing modules (fallback-queue.js, tracks.js, SDNextSelector.js, recommendations.js, resume.cjs, worker-checkin.cjs); FR-6 is a documentation update. No new env vars, config files, dependencies, or dev-environment setup required.',
    completion_evidence: {
      reason: 'no-config-changes-required',
      verification: 'PRs #7279/#7287/#7291 diffs touch only .js/.cjs source, .test.js test files, and one .md doc -- no package.json, .env.example, config file, or CI workflow changes anywhere in the SD scope.',
      prs: ['#7279', '#7287', '#7291'],
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes: 'No configuration changes were part of this SD scope (FR-1 through FR-6).',
  },
  {
    id: 'ed6e0894-bf62-4e1a-bf9c-46d90aa91078', // documentation: Documentation updated
    completion_status: 'completed',
    completion_notes:
      'FR-6: docs/protocol/claim-ownership-vs-liveness.md extended with a "Known threshold divergence" section disclosing the 4 items deliberately left out of scope (300/600/900s threshold divergence, session-liveness.cjs/gate unification, stale-threshold.js 300 constant, gate uncleanly-killed-session design gap), each with an owner and next step, per the PRD FR-6 acceptance criteria.',
    completion_evidence: {
      doc_path: 'docs/protocol/claim-ownership-vs-liveness.md',
      commit: '2a3fac64fb3',
      pr: '#7279',
      section_added: 'Known threshold divergence (out of scope for SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001)',
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes: 'Documentation section merged to main via PR #7279 (commit 2a3fac64fb3), extending the existing claim-ownership-vs-liveness.md doc rather than creating a new file.',
  },
];

for (const u of updates) {
  const { id, ...patch } = u;
  const { error } = await sb.from('sd_scope_deliverables').update(patch).eq('id', id).eq('sd_id', SD_ID);
  if (error) {
    console.error('FAILED for', id, error.message);
    process.exit(1);
  }
  console.log('completed:', id);
}
console.log('Done.');
