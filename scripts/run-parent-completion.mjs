#!/usr/bin/env node
/**
 * parent_completion CLI -- SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-LANES-001 (FR-1/FR-2/FR-5).
 *
 * Thin wrapper around lib/fleet/parent-completion.mjs's runParentCompletion, wiring in the real
 * Supabase client and the gate's own live retro-verification functions. MUST be run by a
 * fleet-worker seat -- GATE_CLAIM_VALIDITY's non_fleet_build_forbidden check correctly refuses a
 * non-fleet-build session at the LEAD-FINAL-APPROVAL handoff step regardless of what invokes this
 * script (measured live, 2026-08-15T21:53Z).
 *
 * Reports FR-5's exact 4-value status vocabulary and, when needsRegeneration is true, tells the
 * calling agent (a fleet worker, capable of Task-tool sub-agent invocation -- this script cannot
 * synthesize retrospective content itself) to invoke retro-agent and re-run.
 *
 * Usage:
 *   CLAUDE_SESSION_ID=<sid> node scripts/run-parent-completion.mjs <parent-sd-key> [--json]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runParentCompletion, STATUS } from '../lib/fleet/parent-completion.mjs';
import { getFilteredRetrospective } from './modules/handoff/retro-filters.js';
import { validateSDCompletionReadiness } from './modules/sd-quality-validation.js';

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const parentKey = args.find((a) => !a.startsWith('--'));
  const sessionId = process.env.CLAUDE_SESSION_ID;

  if (!parentKey) {
    console.error('Usage: node scripts/run-parent-completion.mjs <parent-sd-key> [--json]');
    process.exit(1);
  }
  if (!sessionId) {
    console.error('CLAUDE_SESSION_ID is required (this must be run by a fleet-worker seat).');
    process.exit(1);
  }

  const { createSupabaseServiceClient } = await import('./lib/supabase-connection.js');
  const supabase = await createSupabaseServiceClient('engineer');

  const result = await runParentCompletion({
    supabase,
    sessionId,
    parentKey,
    getFilteredRetrospective,
    validateSDCompletionReadiness,
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[${result.status.toUpperCase()}] ${result.message}`);
    if (result.needsRegeneration) {
      console.log('');
      console.log('  --- ACTION REQUIRED (this script cannot do this step itself) ---');
      console.log('  Invoke retro-agent (Task tool, subagent_type="retro-agent") with real content');
      console.log(`  from ${parentKey}'s children's PRD/handoffs -- never boilerplate.`);
      console.log(`  Then re-run: node scripts/run-parent-completion.mjs ${parentKey}`);
    }
    if (result.strandedClaim) {
      console.log('');
      console.log(`  ⚠️  STRANDED_CLAIM: release failed (${result.strandedClaimReason}). Manual clear needed.`);
    }
  }
  // completed = 0 (success); every other status is a non-error steady state or a reported block,
  // never a process crash -- exit 0 for all four FR-5 statuses so a caller distinguishes outcomes
  // by reading the JSON/status, not by exit code alone. strandedClaim is the one operational
  // hazard that should be visible to a script checking $? too.
  process.exit(result.strandedClaim ? 2 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(`FATAL: ${e.message}`);
    process.exit(1);
  });
}
