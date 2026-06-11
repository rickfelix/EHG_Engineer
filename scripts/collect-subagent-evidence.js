#!/usr/bin/env node

/**
 * subagents:collect — one-command parallel evidence collection for a handoff.
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-C (FR-2, FR-4).
 *
 * Thin wrapper over the EXISTING phase-subagent-orchestrator (Promise.all
 * fan-out shipped by SD-LEO-INFRA-HARDENING-001) — this script deliberately
 * builds NO second fan-out engine. It translates handoff vocabulary
 * (LEAD-TO-PLAN, EXEC-TO-PLAN, ...) into orchestrator phases, passes the
 * handoff type down so the gate's blocking set is unioned into the launch
 * (required-subagents.js SSOT), and instruments total wall-clock.
 *
 * Usage:
 *   npm run subagents:collect -- --sd <SD-KEY> --phase <HANDOFF-or-PHASE>
 *   node scripts/collect-subagent-evidence.js --sd SD-XXX-001 --phase EXEC-TO-PLAN
 *
 * Accepts either a handoff type (LEAD-TO-PLAN | PLAN-TO-EXEC | EXEC-TO-PLAN |
 * PLAN-TO-LEAD | LEAD-FINAL-APPROVAL) or a raw orchestrator phase
 * (LEAD_PRE_APPROVAL | PLAN_PRD | EXEC_IMPL | PLAN_VERIFY | LEAD_FINAL).
 *
 * Emits on success/failure: SUBAGENT_COLLECT_MS=<total> AGENTS=<n> PARALLEL=true
 * (per-agent durations are stored by the orchestrator in each evidence row's
 * metadata/execution_time — sub_agent_execution_results has no started_at column,
 * so in-process capture is the only timing source).
 */

import { HANDOFF_TO_ORCHESTRATOR_PHASE, getRequiredSubAgents } from './modules/handoff/required-subagents.js';
import { VALID_PHASES } from './modules/phase-subagent-orchestrator/phase-config.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

/**
 * Parse CLI args (pure — unit-tested).
 * @param {string[]} argv - args after node+script
 * @returns {{sd: string, phase: string, handoffType: string|null}}
 * @throws {Error} on missing/invalid args, message includes valid values
 */
export function parseCollectArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    if (i === -1 || i === argv.length - 1 || argv[i + 1].startsWith('--')) return null;
    return argv[i + 1];
  };
  const sd = get('--sd');
  const rawPhase = get('--phase');
  if (!sd || !rawPhase) {
    throw new Error(
      'Usage: npm run subagents:collect -- --sd <SD-KEY> --phase <HANDOFF-or-PHASE>\n' +
      `  Handoffs: ${Object.keys(HANDOFF_TO_ORCHESTRATOR_PHASE).join(', ')}\n` +
      `  Phases:   ${VALID_PHASES.join(', ')}`
    );
  }
  if (HANDOFF_TO_ORCHESTRATOR_PHASE[rawPhase]) {
    return { sd, phase: HANDOFF_TO_ORCHESTRATOR_PHASE[rawPhase], handoffType: rawPhase };
  }
  if (VALID_PHASES.includes(rawPhase)) {
    return { sd, phase: rawPhase, handoffType: null };
  }
  throw new Error(
    `Invalid --phase "${rawPhase}".\n` +
    `  Handoffs: ${Object.keys(HANDOFF_TO_ORCHESTRATOR_PHASE).join(', ')}\n` +
    `  Phases:   ${VALID_PHASES.join(', ')}`
  );
}

async function main() {
  let parsed;
  try {
    parsed = parseCollectArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const { sd, phase, handoffType } = parsed;
  if (handoffType) {
    console.log(`Collecting evidence for ${handoffType} (orchestrator phase ${phase})`);
    console.log(`Gate blocking set: [${getRequiredSubAgents(handoffType).join(', ')}]`);
  }

  // Lazy-import the orchestrator AFTER arg validation (it opens a DB connection at module load).
  const { orchestrate } = await import('./orchestrate-phase-subagents.js');

  const start = Date.now();
  try {
    const result = await orchestrate(phase, sd, handoffType ? { handoffType } : {});
    const totalMs = Date.now() - start;
    console.log(`SUBAGENT_COLLECT_MS=${totalMs} AGENTS=${result.total_agents ?? 0} PARALLEL=true`);
    process.exit(result.can_proceed ? 0 : 1);
  } catch (error) {
    const totalMs = Date.now() - start;
    console.log(`SUBAGENT_COLLECT_MS=${totalMs} AGENTS=0 PARALLEL=true`);
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
