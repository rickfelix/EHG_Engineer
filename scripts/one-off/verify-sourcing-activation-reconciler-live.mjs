#!/usr/bin/env node
// SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 (US-002 / TS-7): live verification that
// diffSourcingArmStateVsDeployment() (scripts/lib/sourcing-engine-awareness.mjs) genuinely fires
// against real production state.
//
// Deliberately a one-off script, not a vitest test: the `unit` project's injected Supabase client
// refuses live network by design (confirmed live during this SD's own EXEC phase --
// UNIT_TIER_NETWORK_REFUSED), so asserting real state from that tier is dead-by-construction --
// the same class of finding the TESTING sub-agent flagged for TS-5/C2. Run manually:
//   node scripts/one-off/verify-sourcing-activation-reconciler-live.mjs
// (uses `gh auth token` for the GitHub credential, real Supabase env for the DB read)
import { execFileSync } from 'node:child_process';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { diffSourcingArmStateVsDeployment } from '../lib/sourcing-engine-awareness.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token = process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const result = await diffSourcingArmStateVsDeployment(supabase, { token, forceRefresh: true });
  console.log(JSON.stringify(result, null, 2));
  const unresolved = result.filter((r) => r.deployment_state === 'unknown');
  if (unresolved.length) {
    console.error(`⚠ ${unresolved.length} arm(s) unresolved: ${unresolved.map((r) => r.arm).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('✅ all 3 arms resolved');
  }
}

if (isMainModule(import.meta.url)) {
  run();
}
