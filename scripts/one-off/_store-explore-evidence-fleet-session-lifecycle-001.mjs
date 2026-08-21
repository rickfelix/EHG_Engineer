#!/usr/bin/env node
/**
 * Persist the LEAD-phase Explore agent's findings for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001
 * as formal sub_agent_execution_results evidence -- the Task-tool run itself does not write
 * this row automatically.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001';
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, target_application').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr || !sd) { console.error('SD lookup failed', sdErr); process.exit(1); }

const results = {
  verdict: 'PASS',
  confidence: 90,
  status: 'completed',
  summary: 'Discovery pass (very thorough) across EHG_Engineer confirming: FR-1 has no existing/dead UI consumer and no client-side decision logic to worry about reintroducing (server-first enforcement already locked in by tests/unit/fleet/fleet-panel-no-ui-only-gate.test.js); fetchAllAdams/fetchAllAdamsStrict/fetchAllSolomons/fetchAllSolomonsStrict (unfiltered) already exist and exported. FR-2s scheduled-task setup script (scripts/setup-console-reaper-task.mjs) already exists fully implemented -- FR-2 is activation, not authoring; scan-time-vs-creation-time gap pinned to run-console-reaper.mjs:99-101 (buildParentageRecord called from inside the periodic scan loop). FR-3: buildKillDeps has exactly one caller (fleet-kill.mjs main(), line 109) -- no second caller changes the blast radius. No duplicate/overlapping SD or QF found for any of the 4 FRs; the archived plan doc\'s premises hold on current main.',
  findings: [
    {
      id: 'E-1',
      severity: 'INFO',
      title: 'FR-1: no dead/orphaned UI code; server-first enforcement already tested; unfiltered resolver helpers already exist',
      detail: 'server/public/fleet-ui/fleet-panel.js is vanilla JS (not React/src/), prompt()-based, zero role-aware rendering -- no partial FR-1 implementation exists. tests/unit/fleet/fleet-panel-no-ui-only-gate.test.js asserts decideSingletonSpawn/isSingletonRole must NEVER appear client-side -- FR-1s fix (route forwards server-computed uiLabel/uiEnabled as response data) is compatible with this constraint; recreating decision logic client-side would break this test. fetchAllAdams/fetchAllAdamsStrict (lib/coordinator/adam-identity.cjs) and fetchAllSolomons/fetchAllSolomonsStrict (solomon-identity.cjs) already exist and are exported, ready to swap in for the current fetchFreshAdams/fetchFreshSolomons pre-filtered resolvers.',
    },
    {
      id: 'E-2',
      severity: 'INFO',
      title: 'FR-2: setup script already fully built; scan-time bug pinned to an exact line range',
      detail: 'scripts/setup-console-reaper-task.mjs already exists, fully implemented and tested (built under the predecessor SD FR-5): registers LEO-ConsoleReaper via schtasks, session-0-only principal, idempotent. Sibling precedents: setup-reboot-respawn-task.mjs, setup-liveness-watcher-task.mjs, setup-eva-watcher-task.mjs. FR-2 is therefore scoped to: run the existing script + set the env flag + fix the scan-time capture. Confirmed gap: run-console-reaper.mjs:99-101 calls buildParentageRecord from inside its periodic scan loop, not a spawn-time hook, contradicting the modules own "creation-time" docstring claim.',
    },
    {
      id: 'E-3',
      severity: 'INFO',
      title: 'FR-3: only one buildKillDeps caller repo-wide; FR-4: no duplicates found anywhere',
      detail: 'buildKillDeps is called only from scripts/fleet-kill.mjs\'s own main() (line 109) -- no second caller found repo-wide, so the "future caller silently skips RECORD" risk named in the PRD is precautionary/forward-looking, not an active gap today. Duplicate/overlap check: SCHEDULED-WORKTREE-REAPER-001 reaps git worktrees, an unrelated domain -- no genuine overlap. The archived plan doc (docs/plans/archived/sd-leo-infra-fleet-session-lifecycle-001-plan.md) already documents all of the above premises; this exploration confirms they hold on current main, nothing new/contradictory surfaced. Sibling ehg repo: no relevant hits.',
    },
  ],
  critical_issues: [],
  warnings: [],
  recommendations: [
    'PLAN should pin the exact file for FR-3\'s decidePrepark (lib/fleet/prepark-wip.cjs:47, a separate CJS module from graceful-kill.mjs -- already corrected in the PRD per validation-agent evidence 0a576761-dc6f-400f-9ca6-dbafc0701cb6) to avoid a second/duplicate decidePrepark being created in the wrong file.',
  ],
  detailed_analysis: 'Explore-agent discovery pass, LEAD phase, prior to LEAD-TO-PLAN handoff -- run alongside (not instead of) the prospective testing-agent pass (evidence d77d48ea-9d07-4ca5-bb87-97b4d0fd5d02) and the formal validation-agent duplicate-check (evidence 0a576761-dc6f-400f-9ca6-dbafc0701cb6). No scope-invalidating findings; several implementation-level refinements (exact line numbers, confirmation that FR-2s setup script is activation-only, confirmation FR-1 has no client-side-logic risk) folded into PLAN handoff context.',
  metadata: {
    phase: 'LEAD',
    sd_key: SD_KEY,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application || 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', sd.id, { name: 'Explore' }, results, {
  phase: 'LEAD',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
