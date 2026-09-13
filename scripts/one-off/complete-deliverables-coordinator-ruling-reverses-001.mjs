#!/usr/bin/env node
// Mark the 4 remaining pending sd_scope_deliverables rows for
// SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001 completed, with real evidence
// (commit hash + file paths). FR-3's deliverable was already auto-marked completed.
// sync-deliverables-from-git.js was tried first and does not fit this pre-merge EXEC-phase
// point (it scans `git log main`, i.e. commits already reachable from local main, which a
// not-yet-merged feature-branch commit never is) -- direct update with cited evidence instead.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '71fb0b59-adb5-4c65-88d3-5fe788b062d1';
const COMMIT = 'abf5d9184bd62cc3417bd5c30cdc3d8c2a67badc';

const completions = [
  {
    id: '4c1386f4-4f98-441f-b9cc-ce0c6cfd438e', // FR-1
    completion_evidence: `commit ${COMMIT}: lib/coordinator/urgency-levels.cjs (new), lib/coordinator/dispatch.cjs opts.urgency wiring in insertCoordinationRow (lines ~1453-1489)`,
    completion_notes: 'Verified by TESTING (d04bb6d6, 1582/1582 targeted tests) and SECURITY (c605ec77, PASS 93%) sub-agent evidence at EXEC-TO-PLAN.',
  },
  {
    id: '292509d1-8919-4822-b891-812fe8bae8ce', // FR-2
    completion_evidence: `commit ${COMMIT}: scripts/hooks/coordination-inbox.cjs comment fix + docs/protocol/coordinator-adam-comms.md new "Urgency escalation" subsection`,
    completion_notes: 'grep -c urgency docs/protocol/coordinator-adam-comms.md = 8 (was 0) after this commit.',
  },
  {
    id: '1ee81703-a44d-40e5-80e4-7be4aabf443f', // FR-4
    completion_evidence: 'Verified byte-identical to origin/main by VALIDATION (39101e4d) at LEAD-TO-PLAN; scripts/hooks/coordination-inbox.cjs functional code untouched by this commit (comment-only diff).',
    completion_notes: 'No new code required for this FR by design -- it documents/preserves the already-merged QF-20260912-269 reader.',
  },
  {
    id: '09eb9cc6-764b-40ee-9000-d6a10f82d3c1', // FR-5
    completion_evidence: 'Disposition recorded in this SD record and its PRD (functional_requirements[4]): limb (e) is DEFERRED, not implemented, per the originating ticket marking it optional.',
    completion_notes: 'No code required for this FR by design -- it is a disposition-only requirement.',
  },
];

async function main() {
  for (const c of completions) {
    // DELIVERABLES_COMPLETENESS's isUnprovenancedPostCutover() rejects a completed row with no
    // metadata.producer (post-cutover provenance requirement) -- set it alongside the status flip,
    // not as an afterthought.
    const { error } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        completion_evidence: c.completion_evidence,
        completion_notes: c.completion_notes,
        completed_at: new Date().toISOString(),
        metadata: { producer: 'exec_agent_manual_with_evidence' },
      })
      .eq('id', c.id)
      .eq('sd_id', SD_ID);
    if (error) { console.error(`FAILED ${c.id}: ${error.message}`); process.exitCode = 1; continue; }
    console.log(`completed: ${c.id}`);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
