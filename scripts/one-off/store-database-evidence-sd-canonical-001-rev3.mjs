// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — DATABASE evidence REV 3 (PLAN phase).
// Delta over rev2 (dc628f78-2a08-4bb1-bf35-2985890541df): adds the rollback-path hazard (evidence file Section 6e).
// Rebuilds from the stored rev2 row rather than restating it, so the two revisions cannot drift.
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'PLAN';
const REV2_ID = 'dc628f78-2a08-4bb1-bf35-2985890541df';

const client = await createDatabaseClient('engineer', { verify: false });
const { rows } = await client.query(
  'SELECT summary, confidence, verdict, metadata FROM sub_agent_execution_results WHERE id = $1',
  [REV2_ID]
);
await client.end();
if (!rows.length) throw new Error('rev2 row not found: ' + REV2_ID);
const prev = rows[0];
const prevMeta = prev.metadata || {};
const prevFindings = Array.isArray(prevMeta.findings) ? prevMeta.findings : [];
if (!prevFindings.length) throw new Error('rev2 findings missing — refusing to store a rev3 that would lose them');

const ROLLBACK_FINDING = {
  id: 'rollback-paths-guard-can-block-failure-recovery',
  severity: 'critical',
  note: 'Two of the 12 reachable handoff sites are ROLLBACK/compensation paths, not forward transitions: lead-to-plan/state-transitions.js:39 (rollbackSdState, restores {current_phase, status} from a pre-handoff snapshot) and plan-to-exec/state-transitions.js:35 (restores {current_phase, status, is_working_on}). They fire precisely when a handoff has ALREADY failed. If the rollback write is itself rejected for lacking a stamp, a RECOVERABLE handoff failure becomes a STUCK SD -- the forward transition is half-applied, the compensating write is blocked, and no automated path restores consistency. The guard would convert a self-healing failure mode into one requiring manual DB intervention, the opposite of the invariant this SD protects. Verified live: both rollback handlers SWALLOW their errors (if (error) { console.log("Rollback failed: ...") } with no rethrow and no retry), so a stamp rejection would be logged and dropped, not surfaced -- and combined with the CAS-masking finding, a rejected rollback is invisible at every layer. EXEC REQUIREMENT: rollback paths must carry the SAME allowlist identity as their forward-path counterparts (handoff.js) and be stamped in the SAME change -- stamping the forward path (lead-to-plan/state-transitions.js:101) without its rollback (:39) is strictly WORSE than stamping neither, because it lets the forward transition succeed while guaranteeing its compensation cannot run. TEST REQUIREMENT: acceptance criteria must include a negative test that forces a mid-handoff failure and asserts the rollback write still lands; a green forward-path test proves nothing about the compensation path, which only executes under conditions the happy-path suite never creates.',
};

const results = {
  verdict: prev.verdict,
  confidence: prev.confidence,
  summary:
    prev.summary +
    ' REV 3 DELTA: adds the rollback-path hazard (evidence file Section 6e) -- lead-to-plan/state-transitions.js:39 and ' +
    'plan-to-exec/state-transitions.js:35 are compensation paths that fire only after a handoff has already failed; if the ' +
    'guard rejects them a recoverable failure becomes a stuck SD, and both handlers swallow their errors so the rejection ' +
    'is never surfaced. Rollback paths must share the forward path allowlist identity and be stamped in the same change.',
  findings: [ROLLBACK_FINDING, ...prevFindings],
  metadata: {
    ...prevMeta,
    revision: 3,
    supersedes_row_id: REV2_ID,
    supersedes_chain: ['eadd5e30-93dd-4680-82d0-84cb212f5210', REV2_ID],
    rollback_path_sites: [
      'scripts/modules/handoff/executors/lead-to-plan/state-transitions.js:39 (rollbackSdState)',
      'scripts/modules/handoff/executors/plan-to-exec/state-transitions.js:35',
    ],
    rollback_handlers_swallow_errors: true,
    rollback_must_share_forward_allowlist_identity: true,
  },
  execution_time_ms: 2400000,
};
delete results.metadata.findings;
delete results.metadata._findings_stripped;
delete results.metadata._findings_had_keys;
delete results.metadata.error;
delete results.metadata.stack;

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'DATABASE', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('DATABASE', SD_ID, { name: 'Principal Database Architect' }, results, { phase: PHASE });
console.log('CARRIED_FORWARD_FINDINGS=' + prevFindings.length + ' -> TOTAL=' + results.findings.length);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
