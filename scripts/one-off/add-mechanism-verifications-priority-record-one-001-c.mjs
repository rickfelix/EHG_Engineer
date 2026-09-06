#!/usr/bin/env node
// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier with real file:line citations for the mechanism claims in the spine about
// coordinator-backlog-rank.mjs, claimable-leaves.mjs.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'b5c42d3d-7e13-4d2b-8187-c896c6377892';

const NEW_VERIFICATIONS = [
  {
    claim: 'unlockScore() is a cycle-safe DFS over a `dependents` map, giving the transitive count of non-terminal SDs downstream of a key -- the exact LEVERAGE mechanism this SD extracts.',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'scripts/coordinator-backlog-rank.mjs:261',
  },
  {
    claim: 'blockerKeysFor() unions the parsed `dependencies` column with metadata.blocked_by_sd_key into one blocker-key list, which feeds the `dependents` map unlockScore walks.',
    verified_by: 'Explore (LEAD-TO-PLAN breadth pass)',
    verified_at: 'scripts/lib/claimable-leaves.mjs:28',
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
