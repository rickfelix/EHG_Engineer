/**
 * LEAD-phase Explore evidence + mechanism-claim verifications for
 * SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 (row 23c2a2d4-89af-4885-b87b-7a5b3c4ded1d).
 *
 * The Explore sub-agent is READ-ONLY by construction, so it cannot write its own
 * sub_agent_execution_results row. Its findings are recorded here by the worker who
 * commissioned it, carrying the citations it returned.
 *
 * `summary` and `findings` are NOT mapped columns (a raw insert errors on them; the canonical
 * writer drops them) — fold them into detailed_analysis, which IS mapped and uncapped.
 * metadata on the SD row is MERGED, never replaced: an overwrite would silently drop
 * whatever else the row carries.
 */
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = '23c2a2d4-89af-4885-b87b-7a5b3c4ded1d';
const SD_KEY = 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001';
const CODE = 'Explore';
const PHASE = 'LEAD';

const findings = [
  { id: 'E1', severity: 'high', note: 'THE DEDICATED-CLEAN-TREE PATTERN IS NOT A DROP-IN. lib/fleet/spawn-control.js sites it at .spawn-source on branch "spawn-source" (:169, :229), but SELF_HEALABLE_BRANCH is hardcoded to "main" (lib/fleet/tree-currency.cjs:47) — so enforceTreeCurrency\'s internal self-heal (tree-currency.cjs:236) NEVER fires for that tree. What keeps it current is ensureSpawnSourceWorktree\'s OWN fetch + merge --ff-only (spawn-control.js:251-260, :289-303), which reaches behind===0 BEFORE the currency check runs.', recommendation: 'FR-1 must PORT that refresh mechanism. Merely repointing enforceTreeCurrency at a new dir degrades into exactly today\'s refuse-only tree.' },
  { id: 'E2', severity: 'medium', note: 'THE PATTERN IS DORMANT EVEN ON ITS OWN PATH: gated on FLEET_SPAWN_SOURCE_TREE (spawn-control.js:364-369), default OFF; no .spawn-source directory exists on disk; nothing assigns that env anywhere in the repo.', recommendation: 'Treat it as shipped-but-unproven code. Do not assume the pattern is battle-tested by the spawn path.' },
  { id: 'E3', severity: 'medium', note: 'ESM/CJS WALL: spawn-control.js is ESM; scripts/fleet/worktree-reaper-tick.cjs is CJS and tick() is called SYNCHRONOUSLY from scripts/stale-session-sweep.cjs:3801.', recommendation: 'Reuse needs a dynamic import() or extraction of the pure helpers into a .cjs sibling. tree-currency.cjs is the precedent — both module systems already share it.' },
  { id: 'E4', severity: 'high', note: 'THE REFUSAL ALSO DISABLES EMERGENCY RELIEF. The pool watchdog that force-appends --stage0 --execute at >=80% utilization sits DOWNSTREAM of the currency early-return in tick(), so during a refusal streak it never runs. lib/governance/gauge-registry.js:397 states this outright. A stale tree removes BOTH routine reaping and the only mechanism that could relieve a filling pool.', recommendation: 'FR-2 should move the census/watchdog ABOVE the refusal, or run it unconditionally — reading the pool is non-destructive and safe on a stale tree, unlike reaping.' },
  { id: 'E5', severity: 'medium', note: 'consecutive_refusals IS PROVABLY WRITE-ONLY, and the codebase already knows: lib/governance/gauge-registry.js:390-398 records it as undrained ("the counter exists and logs a BACKLOG line; nothing consumes it") and tests/unit/governance/drain-inventory.test.js:326 PINS VERDICT.NO_CONSUMER. The registry documenting the gap is itself only readable via scripts/drain-inventory.mjs, a manual CLI no workflow schedules.', recommendation: 'FR-2 is not speculative — the no-consumer verdict is already pinned by an existing test. Wire a consumer rather than adding another counter.' },
  { id: 'E6', severity: 'medium', note: 'INVOKER CENSUS (complete, not one example): (1) .github/workflows/worktree-reaper-cadence.yml runs npm run worktree:reap:execute -> scripts/worktree-reaper.mjs DIRECTLY, bypassing the tick, so that path never calls enforceTreeCurrency at all; (2) a Windows Task Scheduler task runs scripts/cron/stale-session-sweep-task.cmd every 5 minutes, which requires worktree-reaper-tick.cjs and calls tick() at stale-session-sweep.cjs:3801. No other invokers exist.', recommendation: 'Any FR-1 that adds a third invoker must state which of these two it replaces, or the census grows again.' },
  { id: 'E7', severity: 'low', note: 'tree-currency contract (lib/fleet/tree-currency.cjs:90-168, :202-314): refusal fires on behind>0 ONLY — a dirty-but-CURRENT tree passes (:141-142). selfHealable requires clean AND branch===SELF_HEALABLE_BRANCH. Every git error/timeout/detached-HEAD is fail-closed to current:false. FLEET_TREE_CURRENCY_BYPASS_REASON (:182, :219-224) is keyed on a non-empty REASON STRING, not a boolean, and is currently set nowhere.', recommendation: 'Note for the PRD: dirt alone never blocks the reaper. Only staleness does. That narrows the fix.' },
  { id: 'E8', severity: 'low', note: 'MAX_WORKTREE_COUNT=28 is defined at lib/worktree-quota.js:44 and DUPLICATED at worktree-reaper-tick.cjs:37 as a manually-synced copy, because the CJS tick cannot require the ESM quota module.', recommendation: 'A second representation of the cap. Out of scope here, but worth a flag if FR-1 does the .cjs extraction anyway.' },
  { id: 'E9', severity: 'low', note: 'scripts/safe-worktree-remove.mjs is confirmed junction-safe: it routes through lib/worktree-manager.js removeWorktreeViaGit, which pre-unlinks the node_modules junction BEFORE git worktree remove. Safety is baked into the chokepoint, not something each caller must remember.', recommendation: 'Keep every new removal path routed through that chokepoint.' },
];

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Read-only surface map for the reaper starvation SD. The load-bearing result is that the dedicated-clean-tree pattern proposed for FR-1 is BOTH dormant AND not a drop-in: its self-heal never fires because SELF_HEALABLE_BRANCH is hardcoded to main while the tree sits on spawn-source, so FR-1 must port ensureSpawnSourceWorktree\'s own fetch+ff-only refresh rather than repointing the currency check. Second: the currency refusal sits UPSTREAM of the pool watchdog, so a stale tree disables emergency Stage-0 relief as well as routine reaping. Third: consecutive_refusals is already pinned NO_CONSUMER by an existing test, so the observability FR is confirmed rather than speculative.',
  findings,
  metadata: {
    read_only: true,
    commissioned_by: 'Alpha-2 (worker) for LEAD-phase evidence',
    note: 'Explore is read-only and cannot write its own evidence row; this row is written by the commissioning worker and carries Explore\'s citations verbatim.',
  },
};

const NL = String.fromCharCode(10);
const HR = '-'.repeat(72);
results.detailed_analysis = [
  'SUMMARY', '=======', results.summary, '',
  'FINDINGS (file:line citations as returned by the Explore sub-agent)',
  '='.repeat(72), '',
  results.findings.map((f) => (
    '[' + String(f.severity).toUpperCase() + '] ' + f.id + NL +
    'FINDING: ' + f.note + NL +
    'RECOMMENDATION: ' + (f.recommendation || '(none - informational)')
  )).join(NL + NL + HR + NL + NL),
].join(NL);

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: CODE, targetApplication: 'EHG_Engineer', fallback: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_ID, { name: 'Explore (read-only surface map)' }, results, { sdKey: SD_KEY, phase: PHASE });
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('REPO_PATH=' + results.metadata.repo_path);

// ── mechanism_verifications: NAME + file:line, both halves, per the gate's own contract ──
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd, error: readErr } = await sb.from('strategic_directives_v2').select('metadata').eq('id', SD_ID).maybeSingle();
if (readErr) { console.error('SD READ FAILED:', readErr.message); process.exit(3); }

const verifications = [
  { verified_by: 'Alpha-2 (worker, first-hand read)', verified_at: 'scripts/fleet/worktree-reaper-tick.cjs:256', claim: 'tick calls enforceTreeCurrency with allowSelfHeal:false and refuses on any behind>0' },
  { verified_by: 'VALIDATION sub-agent (row 7983c589-d9dc-4fc0-8990-04fbf0b443de)', verified_at: 'lib/worktree-quota.js:150', claim: 'listActiveWorktrees runs git worktree list --porcelain excluding the main checkout, so a fresh CI clone yields exactly 0 worktrees' },
  { verified_by: 'Explore sub-agent (evidence row written above)', verified_at: 'lib/fleet/spawn-control.js:251', claim: 'ensureSpawnSourceWorktree refreshes via its OWN fetch + merge --ff-only; the currency self-heal never fires for that tree' },
  { verified_by: 'Explore sub-agent (evidence row written above)', verified_at: 'lib/fleet/tree-currency.cjs:47', claim: 'SELF_HEALABLE_BRANCH === main, which is why a spawn-source-branch tree is never self-healable' },
];

const merged = { ...(sd?.metadata || {}), mechanism_verifications: verifications };
const { error: updErr } = await sb.from('strategic_directives_v2').update({ metadata: merged }).eq('id', SD_ID);
if (updErr) { console.error('METADATA UPDATE FAILED:', updErr.message); process.exit(4); }

const { data: after } = await sb.from('strategic_directives_v2').select('metadata').eq('id', SD_ID).maybeSingle();
const back = after?.metadata?.mechanism_verifications;
console.log('mechanism_verifications persisted:', Array.isArray(back) ? back.length : 'MISSING');
console.log('other metadata keys preserved:', Object.keys(after?.metadata || {}).length);
