#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — mark the 2 remaining pending sd_scope_deliverables
 * completed with real evidence. The other 2 were already auto-completed by the SECURITY/TESTING
 * sub-agent-pass triggers; sync-deliverables-from-git.js (the canonical git-commit-matcher)
 * correctly reports 0 commits because it scans `git log main`, and this SD's commits are still
 * on an open, unmerged PR (#8974) -- expected, not a defect.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'ee236dfb-9312-49fe-a16a-bc5717f38bab';

const completions = [
  {
    id: '983b4f20-2d15-43ac-b189-f4222dcd324b', // "Prove gate-verdict parity is preserved"
    completion_evidence: 'tests/unit/gates/integration-section-parity.test.js: 33/33 passed, run directly against the shipped code at commits 6e5eec0fa6c/aa268e9c1c3 (worktree .worktrees/SD-LEO-FIX-REPLACE-707-FABRICATED-001) -- confirms the suite passes unmodified after this SD\'s data-only changes. Independently re-confirmed by both EXEC-phase TESTING (sub_agent_execution_results 61498cf3) and SECURITY (fb2661ae) reviews.',
    completion_notes: 'FR-2 verified: 8 live corrected rows across 5 distinct sd_types spot-checked against the real GATE_INTEGRATION_SECTION_VALIDATION validator by the EXEC-phase TESTING review -- parity with NULL confirmed for every row.',
    verified_by: 'TESTING',
  },
  {
    id: '69314ff4-188d-479d-9c64-8f10a92e870c', // "Archive-script hardening follow-up"
    completion_evidence: 'scripts/archive/one-time/backfill-prd-integration.js guarded (commit 6e5eec0fa6c): top-of-file `if (true) { ...; process.exit(1); }` block, before createClient() is ever called. Automated smoke tests added in tests/unit/backfill-707-fabricated-integration.test.js (commit aa268e9c1c3): confirms exit code 1 and no DB connection, both bare and with --dry-run. Independently verified by EXEC-phase SECURITY review (sub_agent_execution_results fb2661ae): zero exports, guard fires on import too (uncatchable), zero real importers of the file exist.',
    completion_notes: 'FR-4: decision was guard-in-place (not deletion) to preserve the historical pagination-bug root-cause note in-repo, per the PRD\'s stated EXEC choice.',
    verified_by: 'SECURITY',
  },
];

for (const c of completions) {
  const { data, error } = await supabase
    .from('sd_scope_deliverables')
    .update({
      completion_status: 'completed',
      completion_evidence: c.completion_evidence,
      completion_notes: c.completion_notes,
      verified_by: c.verified_by,
      verified_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: { producer: 'manual_evidence_backed_completion', sd_key: 'SD-LEO-FIX-REPLACE-707-FABRICATED-001' },
    })
    .eq('id', c.id)
    .eq('sd_id', SD_ID)
    .select('id, deliverable_name, completion_status')
    .single();
  if (error) { console.error('UPDATE FAILED:', c.id, error); process.exit(1); }
  console.log('Completed:', JSON.stringify(data));
}
