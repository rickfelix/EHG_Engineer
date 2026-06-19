/**
 * Loop-Contract Registry — enumerable, queryable declarations.
 *
 * SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001 (FR-2, FR-3)
 *
 * A frozen array of declared loop contracts plus list()/get()/assertContractsValid().
 * Mirrors the house registry style (lib/adam/adherence-probes.js Object.freeze set,
 * lib/governance/guardrail-registry.js list()/get() + _test reset).
 *
 * FR-3: two EXISTING loops are declared here as exemplars. The declarations are DATA
 * ONLY — this module never imports or runs the loop entrypoints; cron strings + flags
 * are carried as plain strings. So declaring a loop changes NOTHING about how it runs.
 */

import { validateLoopContract, CADENCE_TYPE, BOUNDARY_KIND } from './loop-contract.js';

/**
 * Exemplar 1 — CI Auto-Triage Loop.
 * Entrypoint: scripts/clockwork/ci-autotriage-loop.cjs
 * Workflow:   .github/workflows/clockwork-ci-autotriage-loop.yml (cron '50 * * * *')
 * Built by SD-LEO-INFRA-CI-FAILURE-AUTOTRIAGE-LOOP-001.
 */
const CI_AUTOTRIAGE_CONTRACT = {
  id: 'LOOP-CI-AUTOTRIAGE-001',
  name: 'CI Auto-Triage Loop',
  goals: [
    'Detect recurring, uncovered CI-failure classes (chronic, >= threshold occurrences)',
    'Trace each chronic class to a corrective work item without auto-fixing it',
  ],
  workflow: [
    { step: 1, name: 'Fetch open ci_failure feedback rows', action: 'read' },
    { step: 2, name: 'Strip dead links to terminal SDs so stale links do not suppress recurrence', action: 'cleanup' },
    { step: 3, name: 'Detect chronic uncovered classes (per-class threshold)', action: 'classify' },
    { step: 4, name: 'Source one DRAFT corrective SD per class via leo-create-sd.js --from-feedback', action: 'propose' },
    { step: 5, name: 'Link the class rows to the corrective SD (status in_progress)', action: 'relate' },
  ],
  boundaries: [
    { kind: BOUNDARY_KIND.MAY, description: 'Read feedback rows, detect chronic classes (pure logic), source DRAFT SDs via the canonical CLI, tag metadata, link class rows.' },
    { kind: BOUNDARY_KIND.MAY_NOT, description: 'Edit code, merge, auto-fix CI, write directly to strategy tables, or resolve the class rows (diagnosis is deferred to the SD worker — CONST-002).' },
  ],
  tasks: [
    { task: 'entrypoint', file: 'scripts/clockwork/ci-autotriage-loop.cjs' },
    { task: 'pure_logic', file: 'scripts/lib/ci-recurrence-detector.mjs' },
    { task: 'flag', key: 'CI_AUTOTRIAGE_LOOP_ENABLE', default: 'false' },
  ],
  timeline: { type: CADENCE_TYPE.CRON, cadence: '50 * * * *', description: 'Hourly at :50 (post-capture, post-triage, post-self-heal)', fail_soft: true, proposal_only: true },
  logging: { writes: ['count of DRAFT SDs sourced', 'per-run + per-day cap remaining', 'class->SD linkage'], durable_ledger: null, event_bus: null },
};

/**
 * Exemplar 2 — Adam Opportunity-Scan heartbeat.
 * Entrypoint: scripts/adam-opportunity-scan.cjs (npm run adam:scan)
 * Workflow:   .github/workflows/adam-opportunity-scan-cron.yml (cron '37 * * * *')
 * Ships INERT behind ADAM_GOVERNANCE_HEARTBEAT_V1 (default OFF).
 */
const ADAM_OPPORTUNITY_SCAN_CONTRACT = {
  id: 'LOOP-ADAM-OPPORTUNITY-SCAN-001',
  name: 'Adam Opportunity-Scan Heartbeat',
  goals: [
    'Rotate through portfolio scopes (harness, platform, per-venture) on a deterministic round-robin',
    'Surface at most one ranked advisory per tick when it clears the rationale bar, else stay silent',
  ],
  workflow: [
    { step: 1, name: 'Select the scope for this tick (deterministic weighted round-robin)', action: 'select' },
    { step: 2, name: 'Run a read-only per-scope briefing', action: 'read' },
    { step: 3, name: 'Apply the rationale bar to candidate advisories', action: 'rank' },
    { step: 4, name: 'Either append ADAM_OK to the local ledger or shell ONE advisory to adam-advisory.cjs', action: 'surface' },
  ],
  boundaries: [
    { kind: BOUNDARY_KIND.MAY, description: 'Read existing tables, compute briefings, rank advisories, append the append-only local ledger, shell at most one advisory.' },
    { kind: BOUNDARY_KIND.MAY_NOT, description: 'Write to strategy tables, create SDs directly, or modify portfolio scope (the advisory script — not the scan — decides; CONST-002).' },
  ],
  tasks: [
    { task: 'entrypoint', file: 'scripts/adam-opportunity-scan.cjs' },
    { task: 'scope_registry', file: 'lib/adam/scope-registry.js' },
    { task: 'flag', key: 'ADAM_GOVERNANCE_HEARTBEAT_V1', default: 'off' },
  ],
  timeline: { type: CADENCE_TYPE.CRON, cadence: '37 * * * *', description: 'Hourly at :37 (offset from the exec-email cron to dodge runner congestion)', fail_soft: true, advisory_only: true },
  logging: { writes: ['ADAM_OK | SURFACED | SUPPRESSED_FLAG_OFF verdict', 'selected scope', 'ledger entry (bounded 500)'], durable_ledger: 'local .json', event_bus: null },
};

/** The canonical declared set. Frozen — runtime cannot mutate it. */
export const LOOP_CONTRACTS = Object.freeze([
  Object.freeze(CI_AUTOTRIAGE_CONTRACT),
  Object.freeze(ADAM_OPPORTUNITY_SCAN_CONTRACT),
]);

/** Enumerable summaries (id, name, cadence) for every declared loop. */
export function list() {
  return LOOP_CONTRACTS.map((c) => ({
    id: c.id,
    name: c.name,
    cadence: c.timeline && c.timeline.cadence,
    cadence_type: c.timeline && c.timeline.type,
  }));
}

/** Full contract for a loop id, or undefined. */
export function get(loopId) {
  return LOOP_CONTRACTS.find((c) => c.id === loopId);
}

/**
 * Coherence guard (mirrors VDR assertRegistryCoherence): run the validator over every
 * declared contract and THROW listing any invalid one. Loud-by-design — a malformed
 * declaration must never sit silently in the registry.
 * @returns {true} when all declared contracts are valid.
 */
export function assertContractsValid() {
  const failures = [];
  for (const c of LOOP_CONTRACTS) {
    const { valid, errors } = validateLoopContract(c);
    if (!valid) failures.push(`${(c && c.id) || '<no id>'}: ${errors.join('; ')}`);
  }
  if (failures.length) {
    throw new Error(`Loop-contract registry incoherent — invalid contract(s):\n  - ${failures.join('\n  - ')}`);
  }
  return true;
}

// Loud at import: a malformed declaration fails fast (house style — VDR taxonomy guard).
assertContractsValid();

export const _test = Object.freeze({
  contracts: () => LOOP_CONTRACTS,
});
