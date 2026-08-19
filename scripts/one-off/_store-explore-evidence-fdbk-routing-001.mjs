// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 — Explore sub-agent evidence writer (LEAD-TO-PLAN).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 85,
  summary:
    'Mapped the three claim-status read surfaces implicated in the reported incident (enforcement gate, /checkin resume, ' +
    'npm run sd:next CONTINUE) with exact file:line citations, before any fix was proposed. Confirmed the enforcement gate ' +
    '(lib/claim-validity-gate.js, called from scripts/sd-start.js) reads strategic_directives_v2.claiming_session_id as the ' +
    'sole ownership authority, and joins claude_sessions for liveness (900s TTL, is_alive/status, PID-marker escape hatch, ' +
    'armed-silence honor) fresh on every call, with no caching layer. Confirmed /checkin resume (lib/checkin/steps/resume.cjs) ' +
    'also keys off claiming_session_id (matching the gate) but only re-routes on a terminal/deleted status, never on a stolen ' +
    'claim. Confirmed the self-claim dedup path (merged-pool-self-claim.cjs / worker-checkin.cjs foreignSessionForSd) keys off ' +
    'claude_sessions.sd_key via v_active_sessions, a documented-as-divergent cache column, backstopped by the claim_sd RPC\'s ' +
    'own 900s/claiming_session_id-keyed refusal before any write lands. Confirmed sd:next (scripts/modules/sd-next/*) ' +
    'correctly keys its CONTINUE query off claiming_session_id but determines claimant liveness via three independently-' +
    'drifted staleness models (a 300s reclassification threshold in lib/claim/stale-threshold.js, a 600s hard cutoff baked ' +
    'into the v_active_sessions.computed_status view consumed by lib/session-manager.mjs getActiveSessions(), and a 30-minute ' +
    'SD-activity-evidence fallback) with no arbiter call to claim_sd between recommending and the operator running ' +
    'sd-start.js. Catalogued the full claim-related column set on strategic_directives_v2 (claiming_session_id authoritative ' +
    'per its own doc comment; is_working_on legacy-but-still-read; active_session_id a third mirror, written but never ' +
    'consulted by any of the three surfaces traced; no locked_by/assigned_to column exists). This discovery-only pass\'s ' +
    'threshold-divergence framing was subsequently CORRECTED by prospective TESTING and VALIDATION sub-agent passes (see ' +
    'their evidence rows) to a column/surface-divergence root cause -- several recommendation surfaces (fallback-queue.js, ' +
    'the private getWorkingOnSD in recommendations.js, tracks.js) do not correctly read claiming_session_id at all, ' +
    'independent of any staleness threshold. This Explore pass supplied the accurate map of the THREE SD-named surfaces ' +
    '(gate/checkin/sd:next) that the deeper passes then built on and corrected.',
  findings: [
    { id: 'gate-authoritative-column', severity: 'info', note: 'lib/claim-validity-gate.js:438-442 selects strategic_directives_v2.claiming_session_id as the sole ownership signal; !claiming_session_id -> unclaimed, otherwise enters the foreign-claim branch at :468.' },
    { id: 'gate-liveness-multi-signal', severity: 'info', note: 'lib/claim-validity-gate.js:480-484 joins claude_sessions (status, is_alive, expected_silence_until, heartbeat_at). CLAIM_TTL_MS=900_000 (:227). ownerIsDeadByLiveness (:257-262), isOwnerProcessAlive PID-marker escape hatch (:517, lib/fleet/cc-pid-liveness.cjs), armed-silence honor (:511). No caching layer -- every check is a live query.' },
    { id: 'checkin-resume-matches-gate', severity: 'info', note: 'lib/checkin/steps/resume.cjs via findOwnSdClaim (worker-checkin.cjs:1518-1529) queries .eq(claiming_session_id, sessionId) -- the same authoritative column. Only re-routes on terminal/deleted status (resume.cjs:100-138), never on a stolen claim.' },
    { id: 'checkin-dedup-divergent-but-backstopped', severity: 'warning', note: 'lib/checkin/steps/merged-pool-self-claim.cjs dedups foreign claims via isSdInFlight -> foreignSessionForSd (worker-checkin.cjs:1247-1255), keyed on claude_sessions.sd_key (a documented-divergent cache column, resume.cjs:10-17) via v_active_sessions, not claiming_session_id directly. Lower risk than sd:next because claim_sd RPC (database/migrations/20260816_claim_sd_tier_check.sql:268-333) independently refuses a live foreign claim (900s/claiming_session_id-keyed) before any write lands.' },
    { id: 'sdnext-three-staleness-models', severity: 'warning', note: 'scripts/modules/sd-next/claim-analysis.js:40-137 (analyzeClaimRelationship) uses a 300s threshold (lib/claim/stale-threshold.js:40) for relationship classification; lib/session-manager.mjs:648-660 getActiveSessions() queries v_active_sessions filtered to computed_status IN (active,idle), a 600s cutoff baked into the view definition; a 30-minute SD-activity-evidence fallback (claim-analysis.js:150-182) applies when the claimant is absent from activeSessions. No call to claim_sd or any other live arbiter exists between a sd:next recommendation and sd-start.js running the gate.' },
    { id: 'claim-columns-catalogued', severity: 'info', note: 'strategic_directives_v2 claim-related columns (docs/reference/schema/engineer/tables/strategic_directives_v2.md): claiming_session_id (authoritative per its own doc comment, "Replaces is_working_on boolean"), is_working_on (legacy, still read by v_sd_next_candidates ordering + findOwnSdClaim + getWorkingOnSD .or() filter), active_session_id (a third mirror column, written by claim_sd RPC and the gate\'s reconciliation write, but not consulted by any of the three traced surfaces). No locked_by/assigned_to column exists.' },
  ],
  metadata: {
    surfaces_mapped: ['lib/claim-validity-gate.js (enforcement gate)', 'lib/checkin/steps/resume.cjs (checkin resume)', 'scripts/modules/sd-next/* (CONTINUE/START recommendations)'],
    initial_hypothesis: 'threshold divergence (300s/600s/900s)',
    superseded_by: 'prospective TESTING + VALIDATION passes -- corrected root cause to column/surface divergence, see their evidence rows',
  },
  execution_time_ms: 480000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
