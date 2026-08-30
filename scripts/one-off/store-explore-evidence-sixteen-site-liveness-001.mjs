#!/usr/bin/env node
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001';
const REPO_PATH = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const EXECUTED_FROM_CWD = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001';

const findings = {
  summary: 'Explore audit of isDispatchableFleetMember and everClaimed call sites, repo-wide (excludes .worktrees/, node_modules/, docs/, .artifacts/, .prd-payloads/).',
  isDispatchableFleetMember: {
    definition: 'lib/fleet/session-predicates.mjs:90 — does NOT call everClaimed; checks quarantined_at/parked_until directly at :104/:110',
    direct_call_sites: [
      'scripts/coordinator-charter-audit.mjs:153',
      'scripts/fleet-rollcall.cjs:132',
      'scripts/fleet-dashboard.cjs:385',
      'scripts/lib/live-countable-worker.mjs:35',
      'lib/eva/capacity-governor.js:173',
    ],
    ambiguous: ['scripts/lib/capacity-inputs.mjs:374 — comment reference only in excerpt; likely reached via isLiveCountableWorker wrapper, needs direct verification'],
    test_only: ['tests/unit/session-predicates.test.js (16 occurrences)'],
  },
  everClaimed: {
    definition: 'lib/fleet/genuine-worker.mjs:163',
    direct_production_call_sites: 'NONE outside genuine-worker.mjs itself — only internal use by isFleetWorker (:178)',
    test_only: ['lib/fleet/db-clock.test.js', 'tests/unit/fleet/genuine-worker.test.js (7)', 'tests/unit/fleet/canary-session.test.js (3)'],
    comment_or_docblock_only: ['genuine-worker.mjs :20,25,143,168,208-224', 'stuck-seat-predicate.cjs :8,23', 'stuck-seat-population.cjs :6,10,16,20', 'session-predicates.mjs :10,64-65,77,80,115', 'live-fleet-sessions.cjs :24', 'scripts/lib/engagement-buckets.mjs :21-22,82-83', 'scripts/coordinator-idle-qf-hint.mjs :216', 'scripts/seeded-firing-stuck-seat.cjs :28-29', 'various scripts/one-off/* incident writeups'],
  },
  isFleetWorker_transitive_consumers: [
    'scripts/adam-exec-summary.mjs:175',
    'scripts/coordinator-email-summary.mjs:158',
    'scripts/fleet-worker-pulse.mjs:75',
    'scripts/one-off/_fleet-down-pager-ab-compare.mjs:16,30',
  ],
  liveFleetWorkers_transitive_consumers: [
    'scripts/adam-exec-summary.mjs:173',
    'scripts/adam-coordinator-health.mjs:83',
    'scripts/coordinator-idle-qf-hint.mjs:269',
    'scripts/coordinator-email-summary.mjs:84',
    'scripts/coordinator-audit.mjs:87',
    'scripts/fleet-worker-pulse.mjs:73',
    'lib/fleet/tier-ladder.cjs:523',
    'lib/fleet/tier-backlog.cjs:122',
    'lib/fleet/live-fleet-sessions.cjs:71',
    'lib/fleet/db-clock.test.js:67,71 (test)',
  ],
  isRecentlyReleased: {
    only_consumer: 'scripts/coordinator-idle-qf-hint.mjs:220 (import :36); comment cross-ref to everClaimed-inclusive gap at :216',
  },
  quarantined_at_parked_until: 'Only enforced inside isDispatchableFleetMember (session-predicates.mjs:104,110). Unrelated JSON-field usages elsewhere (scripts/unit-tier-quarantine.mjs, lib/quarantine/retriage.js) are a different test-quarantine domain, not fleet-liveness.',
  reconciliation_with_sd_premise: "SD claims 16 isDispatchableFleetMember call sites. Direct executable production call sites measured here: 5 (plus 1 ambiguous needing direct verification). everClaimed has ZERO direct production callers — it is only reached transitively via isFleetWorker (4 call sites) and liveFleetWorkers (9-10 call sites, several importing both). The PRD must pin the denominator explicitly (which axis is being counted: direct calls of isDispatchableFleetMember alone, vs the full liveness-predicate family including everClaimed/isFleetWorker/liveFleetWorkers/isRecentlyReleased) rather than inherit the unverified '16' figure.",
};

async function main() {
  await storeSubAgentResults(
    'Explore',
    SD_KEY,
    null,
    {
      phase: 'LEAD',
      source: 'manual',
      verdict: 'PASS',
      confidence: 90,
      execution_time_ms: 0,
      summary: 'Repo-wide call-site census for isDispatchableFleetMember/everClaimed and the transitive liveness-predicate family. Confirms SD premise of "16" is not directly reproducible as a single measure; pins actual counts for PRD authoring.',
      findings,
      metadata: {
        repo_path: REPO_PATH,
        executed_from_cwd: EXECUTED_FROM_CWD,
      },
    }
  );
  console.log('Explore evidence stored');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
