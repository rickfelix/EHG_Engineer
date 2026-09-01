import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B';
const REPO = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-B';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  await storeSubAgentResults('TESTING', sd.id, { code: 'TESTING', name: 'TESTING' }, {
    verdict: 'PASS',
    confidence_score: 95,
    summary: 'PLAN-phase test plan review for the 4 code changes (drain-set registration, severity-preserving reroute, repeat-offender re-arm, alert body rewrite). Ran the full existing + new unit suite for both directly-touched files and the broader fleet/coordinator surface: tests/unit/fleet/orphan-reroute-sweep.test.js (16 tests incl. 4 new), tests/unit/fleet/drain-set-registry.test.js (updated count pin), tests/unit/fleet/drain-sets-adam-reconciliation.test.js (updated coordinator count pin 16->20), tests/unit/coordinator/reaper-starvation.test.js, tests/unit/coordinator/reaper-alert-wire.test.js -- all passing. Full regression run: `npx vitest run tests/unit/fleet/ tests/unit/coordinator/` = 276 files, 3374 passed, 1 skipped, 0 failed.',
    detailed_analysis: {
      commands_run: [
        'npx vitest run tests/unit/fleet/orphan-reroute-sweep.test.js tests/unit/fleet/drain-set-registry.test.js tests/unit/coordinator/reaper-starvation.test.js tests/unit/coordinator/reaper-alert-wire.test.js  -> 53 passed',
        'npx vitest run tests/unit/fleet/ tests/unit/coordinator/  -> 276 files, 3374 passed, 1 skipped, 0 failed',
      ],
      new_tests_added: [
        'severity=high orphan reroutes to REROUTE_TO_KIND_HIGH_SEVERITY',
        'non-high-severity orphan still reroutes to routine REROUTE_TO_KIND',
        'DOES re-alarm past threshold when no recent alarm exists',
        'does NOT re-alarm when a recent (within-window) unread alarm already exists',
      ],
    },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'PLAN' });

  console.log('OK stored PLAN TESTING evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
