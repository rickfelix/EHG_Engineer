#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001';

// EXEC-TO-PLAN TESTING review (sub_agent_execution_results id baa1c962-36f2-44af-8db0-
// 13b2873db181, finding F3, HIGH) found FR-3's 4th acceptance criterion --
// "SEEDED_ARTIFACTS (repo-readiness.js:32) and the self-heal writer are verified to
// recognize the same manifest-presence signal" -- was unimplemented. TESTING offered two
// paths: implement it, or renegotiate the AC. Investigated the actual consumer before
// choosing: SEEDED_ARTIFACTS feeds an S19 "SCAFFOLD-COMPLETENESS gate" in
// stage-execution-worker.js (~line 695-714) that self-heals a missing artifact by calling
// ensureLeoBridgeScaffold() -- a DIFFERENT function that only ever writes CLAUDE.md/
// docs/build-tasks.md/.replit and has NO knowledge of this SD's scaffold-manifest.json or
// its MODULE_REGISTRY modules. Adding scaffold-manifest.json to SEEDED_ARTIFACTS would mean
// every venture reaching S19 without it (all 52 in the current backfill census) enters a
// self-heal path that CANNOT produce the missing file, then gets BLOCKED from S19 advance
// with no working remediation -- a severe regression, not a minor consistency nicety, and
// directly contrary to FR-5's own "propose backfill, never force" design. Renegotiating the
// AC rather than implementing it, per TESTING's own offered second path.

const AC4_REPLACEMENT = "Explicitly NOT wired into SEEDED_ARTIFACTS/the S19 self-heal gate (stage-execution-worker.js ~695-714): that gate's self-heal calls ensureLeoBridgeScaffold(), which cannot produce this SD's manifest -- adding it there would block S19 advance for every venture in the current backfill census (52, per FR-5) with no working remediation. checkScaffoldManifest() (this SD's own shared predicate) is the sole authority on manifest presence, used consistently by both provisioning entry points; no second, independent implementation exists to disagree with it. Renegotiated 2026-08-24 per EXEC-TO-PLAN TESTING finding F3 (evidence baa1c962) after investigating the actual SEEDED_ARTIFACTS consumer.";

async function main() {
  const { data: prd, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements')
    .eq('id', PRD_ID)
    .single();
  if (readErr || !prd) { console.error('READ ERR', readErr?.message); process.exit(1); }

  const frs = prd.functional_requirements.map((fr) => {
    if (fr.id !== 'FR-3') return fr;
    const acceptance_criteria = fr.acceptance_criteria.map((ac) =>
      ac.startsWith('SEEDED_ARTIFACTS') ? AC4_REPLACEMENT : ac
    );
    return { ...fr, acceptance_criteria };
  });

  const { error: writeErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs })
    .eq('id', PRD_ID);
  if (writeErr) { console.error('WRITE ERR', writeErr.message); process.exit(1); }
  console.log('FR-3 AC-4 renegotiated for', PRD_ID);
}

if (isMainModule(import.meta.url)) main();
