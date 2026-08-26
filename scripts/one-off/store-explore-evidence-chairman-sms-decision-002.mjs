// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 -- Explore sub-agent evidence (LEAD-TO-PLAN).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    "All 4 claimed defects independently confirmed REAL and currently present by reading actual code (all file:line cited) plus live DB queries and, for defects 2 and 4, direct empirical re-execution of the actual functions. Defect 1 (consult insert not readback-verified): lib/adam/presend-consult-lane.cjs:79-107 mints a correlationId then calls insertCoordinationRow() without ever inspecting its return value; lib/coordinator/dispatch.cjs's insertCoordinationRow only throws for one narrow enum-violation class, all other insert failures return silently; chairman-sms-gate/index.js:470-484 never sets consult_row_id at all (always null). Correction to SD framing: it's the insert's failure-mode that's unverified, not a universal never-inserted claim; two live held rows (1d7b5399, e49771f2) confirm both the historical and a currently-clean unconfounded instance. Defect 2 (release sweep missing context.now): chairman-held-sends-release-sweep.mjs:82 supplies no releaseDeps in production; chairman-held-send-release.js:201 defaults context to {}; rubric-engine/lint.js:71-84 throws unconditionally on missing context.nowHourET/context.now for every message. Verified empirically by calling evaluate() directly with an empty context -- reproduced the exact gate_unavailable failure. Defect 3 (schema drops reply_instruction/reply_ids/no_reply_consequence): confirmed at both migration level (20260824_chairman_held_sends.sql:104-159, no such columns) and code level (hold-path insert never captures them; release-path reconstruction can never populate them since they were never stored); live held row 1d7b5399's last_error field is an exact-match rubric-block on all three fields. Defect 4 (non-UUID decision-id): scripts/adam-chairman-decision.mjs:43 reads --decision-id with zero validation; the DB column is typed uuid; confirmed via read-only probe that a non-UUID literal produces Postgres 22P02. Correction: the failure is caught (not a process crash) but silently loses the hold row entirely -- arguably worse, since nothing downstream can detect it. No duplicate or overlapping SD exists: SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (completed) fixed a different, earlier pair of defects in this same lane; SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-002 (cancelled) was an unrelated narrow migration-tail SD. Both witness stranded held rows (1d7b5399, e49771f2, both under decision_id 9e5aac51) are confirmed live, current (held today), and genuinely stranded -- in-scope for this SD's orphan-void requirement.",
  findings: [
    { id: 'defect-1-consult-insert-unverified', severity: 'critical', note: 'lib/adam/presend-consult-lane.cjs:79-107 never inspects insertCoordinationRow()\'s return value; chairman-sms-gate/index.js:470-484 never sets consult_row_id (always null). Confirmed live: held row e49771f2 has zero matching session_coordination rows and will wait forever.' },
    { id: 'defect-2-release-missing-context-now', severity: 'critical', note: 'chairman-held-sends-release-sweep.mjs:82 supplies no context; rubric-engine/lint.js:71-84 throws gate_unavailable unconditionally without it. Reproduced empirically by direct function call.' },
    { id: 'defect-3-schema-missing-rubric-fields', severity: 'critical', note: 'database/migrations/20260824_chairman_held_sends.sql:104-159 has no reply_instruction/reply_ids/no_reply_consequence columns; a released decision rubric-blocks by construction, 100% of the time. Live held row 1d7b5399 confirms exact match.' },
    { id: 'defect-4-non-uuid-decision-id', severity: 'high', note: 'scripts/adam-chairman-decision.mjs:43 has zero UUID validation on --decision-id; a non-UUID value causes a caught-but-silent hold-persistence failure (22P02), not a process crash -- the hold row is simply never written, undetectable downstream.' },
    { id: 'no-duplicate-sd', severity: 'info', note: 'SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (completed) and -002 (cancelled) both target this same lane but neither overlaps any of these 4 defects -- confirmed genuinely net-new scope.' },
    { id: 'stranded-rows-confirmed-live', severity: 'medium', note: 'Both witness held rows (1d7b5399, e49771f2, decision_id 9e5aac51) confirmed live, held today, genuinely stranded -- real targets for this SD\'s orphan-void cleanup requirement, not stale examples.' },
  ],
  metadata: { defects_confirmed: 4, defects_already_fixed: 0, duplicate_sd_found: false },
  execution_time_ms: 600000,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'Explore', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('EXPLORE_STORED_ID=' + (stored?.id || 'n/a'));
