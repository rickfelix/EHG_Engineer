import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '54daa184-4ef8-4d19-babb-80ad0b11e17c';

const findings = [
  {
    id: 'canonical-write-paths',
    summary: "docs/reference/canonical-write-paths.json + tests/unit/governance/canonical-helper-registry-freshness.test.js is the writer-canonicality half — which file is allowed to write a table. Scoped only to lib/governance/ and lib/security/ prefixes; its orphan check is soft/non-blocking (expect(true).toBe(true))."
  },
  {
    id: 'drain-descriptors',
    summary: "lib/governance/gauge-registry.js DRAIN_DESCRIPTORS + lib/governance/drain-inventory.js is the closest existing analog to the requested registry: 14 hand-curated entries with source/consumer/closingPath/predicate/shapeContract/evidence fields and a hard-failing verdict enum (NO_CONSUMER, NO_CLOSING_PATH, UNDRAINED, CLOSING_PATH_UNEXERCISED, PASS, MEASURED_ELSEWHERE). buildInventoryRow() is a strong template for the new registry's row shape."
  },
  {
    id: 'periodic-liveness-triple',
    summary: "lib/periodic-liveness/stamp-last-fired.js (writer: stampLastFired/stampFromGithubActionsRun) + scripts/periodic-liveness-watcher.mjs (reader/evaluator) + lib/periodic-liveness/ladder-escalation.mjs (incrementConsecutiveMiss/resetConsecutiveMiss, exactly the 'two consecutive windows' escalation mechanic the SD scope asks for) is a proven, ~50-script-used writer/reader/predicate triple for process liveness -- a PASS exemplar to cite, not a gap."
  },
  {
    id: 'adam-advisory-not-a-table',
    summary: "adam_advisory is NOT a dedicated table (PGRST205 on adam_advisories/adam_advisory) -- it is a session_coordination row with payload.kind='adam_advisory', written by scripts/adam-advisory.cjs, read/acked via lib/coordinator/adam-advisory-store.cjs (selectUnactionedAdvisories, stampActioned). Notably NOT yet represented in DRAIN_DESCRIPTORS itself. The SD's own notifier requirement (raise an adam_advisory) must call this existing writer, not invent a new one."
  },
  {
    id: 'no-repo-wide-discovery',
    summary: "None of the three existing mechanisms do automatic repo-wide discovery of every durable writer requiring an intended-reader declaration at write time. canonical-helper-registry-freshness.test.js is the only repo-wide-discovery attempt and it is scoped to 2 directories, informative-only. This SD's actual novel contribution is generalizing that discovery + making DRAIN_DESCRIPTORS-shaped entries mandatory repo-wide, not building a fourth parallel registry."
  }
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 85,
  summary: 'Three overlapping partial mechanisms already exist (writer-canonicality registry, DRAIN_DESCRIPTORS reader/predicate registry, periodic-liveness writer/reader/predicate triple). PRD should unify/generalize these rather than build a fourth parallel registry from scratch.',
  findings,
  recommendations: [
    'PRD FR for the registry should be framed as unifying canonical-write-paths.json (writer side) with DRAIN_DESCRIPTORS/drain-inventory.js (reader/predicate side), not a net-new schema.',
    'The notifier requirement (FR: raise adam_advisory) must call the existing scripts/adam-advisory.cjs writer via lib/coordinator/adam-advisory-store.cjs conventions, since there is no adam_advisory table.',
    'The "two consecutive windows" escalation semantics should reuse lib/periodic-liveness/ladder-escalation.mjs incrementConsecutiveMiss/resetConsecutiveMiss pattern rather than reinventing counting logic.',
    'canonical-helper-registry-freshness.test.js scope (2 directories, soft-fail) is the seed to harden/widen repo-wide and make hard-failing, per VALIDATION sub-agent finding that this is the load-bearing missing piece.'
  ],
  metadata: {
    repo_path: process.cwd(),
    executed_from_cwd: process.cwd(),
  },
};

async function main() {
  const row = await storeSubAgentResults('Explore', SD_ID, { code: 'Explore', name: 'Explore' }, results, {
    source: 'manual',
    phase: 'LEAD-TO-PLAN',
  });
  console.log('Stored Explore evidence row:', row?.id || row);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
