#!/usr/bin/env node
/**
 * Clean-clone launcher CLI — SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-B
 *
 * Seeds a fresh, fully-grounded venture from venture-1's durable thesis so it
 * re-runs S0->S19 with current grounding (Cloudflare-default + operating-model
 * SSOT), replacing dogfood-complete venture-1 (frozen at S19).
 *
 *   node scripts/launch-clean-clone.mjs --dry-run            # validate, persist NOTHING
 *   node scripts/launch-clean-clone.mjs                      # LIVE: persist + activate (cost-bearing)
 *   node scripts/launch-clean-clone.mjs --source <venture-id>
 *
 * --dry-run is the safe path. LIVE activation is a flagship/irreversible
 * cost-bearing op (the daemon then autonomously runs S0->S19) and should be
 * fired only under explicit Adam/chairman authorization.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { executeStageZero } from '../lib/eva/stage-zero/index.js';
import { launchCleanClone, DEFAULT_SOURCE_VENTURE_ID } from '../lib/eva/clean-clone/launch.js';

function parseArgs(argv) {
  const args = { dryRun: false, source: DEFAULT_SOURCE_VENTURE_ID };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--source') args.source = argv[++i];
  }
  return args;
}

async function main() {
  const { dryRun, source } = parseArgs(process.argv.slice(2));
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log(`\n=== Clean-clone launch (${dryRun ? 'DRY-RUN' : 'LIVE'}) ===`);
  if (!dryRun) {
    console.log('⚠️  LIVE mode: this persists + activates a fresh venture; the daemon will autonomously run S0->S19 (cost-bearing).');
  }

  const result = await launchCleanClone(
    { sourceVentureId: source, dryRun },
    { supabase, logger: console, executeStageZero },
  );

  console.log('\n--- Result ---');
  console.log(JSON.stringify({
    ok: result.ok,
    stage: result.stage,
    dryRun: result.dryRun,
    seeded: result.seeded,
    newVentureId: result.newVentureId || null,
    skipped: result.skipped || false,
    existing: result.existing ? { id: result.existing.id, status: result.existing.status } : null,
    prereqsMissing: result.prereqs?.missing || [],
  }, null, 2));

  if (!result.ok) {
    console.error('\n❌ Launch did not proceed (see result above).');
    process.exit(1);
  }
  console.log(`\n✅ ${dryRun ? 'Dry-run validated' : (result.skipped ? 'Idempotent — existing clone' : 'Clone launched')}.`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
