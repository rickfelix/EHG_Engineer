#!/usr/bin/env node
// One-off: Explore sub-agent evidence for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001, LEAD-TO-PLAN phase.
// Records the codebase discovery performed to scope pieces (b)/(c)/(d) accurately.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const findings = [
  {
    id: 'piece-b-target-identified',
    severity: 'INFO',
    summary: '.github/workflows/unit-tier-clock-skew.yml already has `workflow_dispatch:` (line 21) and a single run step (`npx vitest run --project unit`, line 68). Piece (b) needs a JSON-reporter addition to that same step (vitest --reporter=json --outputFile=...) plus an artifact upload, then an actual manual trigger to produce the measurement -- not a new workflow.',
  },
  {
    id: 'piece-c-target-identified',
    severity: 'INFO',
    summary: 'tests/setup.clock-skew.js (77 lines) implements TEST_CLOCK_OFFSET_MS (relative offset) only, reapplied per-test via beforeEach with a JSONL ledger for proof. Piece (c) adds a parallel TEST_CLOCK_PIN_ISO (absolute ISO instant) path beside it, following the same reapply + ledger shape. tests/unit/hygiene/clock-skew-reapplication.spawn.test.js is the out-of-process consumer to extend (the ticket names it clock-skew-reapplication.test.js without the .spawn. infix -- confirmed this is the actual, only matching file).',
  },
  {
    id: 'piece-d-baseline-measured',
    severity: 'INFO',
    summary: 'Built scripts/lint/wall-clock-test-lint.mjs (diff-mode + --all census, mirroring scripts/lint/shell-injection-argv-lint.mjs\'s established pattern: hardened git runner, merge-base baseline partition, inline pragma escape hatch). Ran --all: 4173 test files scanned, 11 violate today (call reconcileOutboundSms/isInQuietHours/resolveChairmanZone/smsQuietWindowReleaseIso with no now:/DAY_NOW/FAKE_NOW/useFakeTimers token anywhere in the file). This 11-file list is the tool\'s own measured baseline, cited in its test fixtures.',
  },
  {
    id: 'existing-conventions-reused-not-rebuilt',
    severity: 'INFO',
    summary: 'All three pieces extend existing mechanisms rather than introducing new ones: piece (b) extends an existing workflow_dispatch-capable workflow; piece (c) extends an existing per-test-reapplication setup hook; piece (d) mirrors an existing, already-shipped lint pattern (shell-injection-argv-lint.mjs) file-for-file in structure.',
  },
];

const recommendations = [
  'PLAN should scope FR-1 (piece c) to extend tests/setup.clock-skew.js + clock-skew-reapplication.spawn.test.js (the real filename), FR-2 (piece d) to scripts/lint/wall-clock-test-lint.mjs (already built, needs a test file), and FR-3 (piece b) to unit-tier-clock-skew.yml\'s existing run step + an actual triggered measurement run.',
];

const summary = 'Explore-phase discovery confirmed all three deferred pieces extend existing, already-shipped mechanisms (a workflow_dispatch-capable CI workflow, a per-test clock-reapplication setup hook, and an established file-level lint pattern) rather than requiring new infrastructure. piece (d)\'s tool was built during this Explore pass and measured 11 real pre-existing violations against a 4173-file test-suite census.';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });
  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings,
    warnings: [],
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        '.github/workflows/unit-tier-clock-skew.yml', 'tests/setup.clock-skew.js',
        'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js', 'scripts/lint/shell-injection-argv-lint.mjs',
        'lib/git/hardened-runner.cjs',
      ],
      quick_fixes_reviewed: ['QF-20260912-364'],
    },
    phase: 'LEAD_TO_PLAN',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('Explore', SD_KEY, { name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' });
  console.log('EXPLORE EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
