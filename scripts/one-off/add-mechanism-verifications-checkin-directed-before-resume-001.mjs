#!/usr/bin/env node
// SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 -- GATE_MECHANISM_CLAIM_VERIFIER requires a
// named verifier with real file:line citations for the mechanism claims in the spine about
// lib/checkin/steps/index.cjs, directed-assignment.cjs, lib/coordinator/dispatch.cjs.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'b13a3eed-28f2-4cc0-9500-f567b1eb56b1';

const NEW_VERIFICATIONS = [
  {
    claim: 'resume (rung 4) is registered BEFORE directed-assignment (rung 5) in the ordered step registry -- the exact ordering the specimen exploits (a resumable-release claim resolves the checkin before the directed lane is ever read).',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'lib/checkin/steps/index.cjs:51',
  },
  {
    claim: 'directed-assignment.cjs pulls unackedOnly WORK_ASSIGNMENT rows within the recency window -- confirmed still at the exact line the spine cites, unaffected by this SD\'s FR-1/FR-2 edits (which land earlier in the file, in the resume-yield branch and terminal-verdict stamps).',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'lib/checkin/steps/directed-assignment.cjs:91',
  },
  {
    claim: 'lib/coordinator/dispatch.cjs is the insert-time chokepoint where a WORK_ASSIGNMENT with neither sd_key/assigned-key nor assignment_type could be refused (FR-5, deferred scope) -- assertSdDispatchable is the existing sibling assert() this SD\'s deferred FR-5 would sit beside.',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'lib/coordinator/dispatch.cjs:1358',
  },
];

// Read-then-write on a shared JSONB column races a concurrent metadata writer (this repo runs
// many parallel sessions). Guarded with an updated_at compare-and-swap: retry the read+merge if
// another writer landed between fetch and update, instead of silently clobbering it.
async function run() {
  const supabase = createSupabaseServiceClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: current, error: fetchErr } = await supabase
      .from('strategic_directives_v2')
      .select('metadata, updated_at')
      .eq('id', SD_UUID)
      .single();
    if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

    const newMetadata = {
      ...current.metadata,
      mechanism_verifications: [
        ...(current.metadata?.mechanism_verifications || []),
        ...NEW_VERIFICATIONS,
      ],
    };

    const { data: updated, error: updateErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: newMetadata })
      .eq('id', SD_UUID)
      .eq('updated_at', current.updated_at)
      .select('id');
    if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
    if (updated && updated.length > 0) {
      console.log('mechanism_verifications added.');
      return;
    }
    console.log(`   [CAS] updated_at changed since read (attempt ${attempt + 1}/5) -- retrying`);
  }
  throw new Error('CAS retries exhausted -- another writer keeps winning the race');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
