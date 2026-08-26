// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 -- VALIDATION sub-agent evidence (LEAD-TO-PLAN).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'CONCERNS',
  confidence: 92,
  summary:
    "All 4 defects independently re-verified real (not a rubber stamp): D1 confirmed via live DB (consult_row_id column exists but is never written; both held rows have it null; a positive control shows 10 consult rows written the same day via other paths, so the insert mechanism works generally -- these two specifically didn't land). D2 reproduced empirically by calling rubric-engine's evaluate() directly with an empty context and observing the exact gate_unavailable throw; a held row's persisted last_error confirms the same failure occurred live. D3 confirmed at both schema (30 live columns enumerated, none of the 3 claimed) and code level, with a live held row's last_error exactly matching a rubric-block on all 3 fields. D4 confirmed via read-only UUID-type probe producing Postgres 22P02. No duplicate/overlapping SD found (SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 completed and -002 cancelled both target this lane but neither overlaps these 4 defects). CONCERNS (not blocking, corrected into the SD before LEAD-TO-PLAN): (F1, CRITICAL) the naive fix shape for criterion 3 would double-compose the SMS body on release -- chairman-sms-gate/index.js:379 unconditionally runs composeDecisionSmsBody() on every gate call; if release reconstructs message.body + options/replyInstruction/noReplyConsequence from the held row and re-passes them, the gate composes a second time, producing a visibly duplicated message to the chairman. Reproduced via a 3-pass body-composition trace matching the exact proposed fix shape. (F2) criterion 1's cited witness row (1d7b5399) is actually the ANSWERED case (1 matching session_coordination row, a manual Solomon workaround reply) -- the genuinely-unanswered example is row e49771f2 (zero matching rows, attempts=0). (F3, HIGH) the 3 new schema columns must be nullable with no CHECK constraint -- confirmed via the migration delegation classifier that a NOT NULL or CHECK-constrained version is non-delegatable, requiring a chairman apply ceremony EXEC cannot self-approve, which would stall the SD; two live rows also block a NOT NULL backfill. (F4) the schema-reference-allowlist.json still lists this table as chairman-gated/staged-not-applied despite being live since 2026-08-25 -- stale entry means the schema change would land unguarded by lint. (F5) the orphan detector should target consult_row_id IS NULL / attempts>0 / stuck-in-releasing, not duplicate the existing v_chairman_held_sends_unreconcilable view (which is correctly scoped to correlation-null-or-expired, just blind for the first 24h). (F6) naming mismatch: rubric reads message.replyId (singular) while the column/criterion says reply_ids (plural) -- PRD must state the explicit mapping. All corrections applied directly to the SD's success_criteria/risks/description before LEAD-TO-PLAN handoff.",
  findings: [
    { id: 'f1-double-composition-critical', severity: 'critical', note: 'Naive fix for success_criteria[2] would double-compose the SMS body on release (chairman-sms-gate/index.js:379 runs composeDecisionSmsBody unconditionally on every call) -- reproduced empirically, corrected into the SD text as a mandatory idempotence requirement.' },
    { id: 'f2-witness-misattribution', severity: 'high', note: 'success_criteria[0]\'s cited witness (1d7b5399) is actually the answered case; e49771f2 is the correct unanswered example. Corrected in the SD text.' },
    { id: 'f3-schema-must-be-nullable', severity: 'high', note: 'The 3 new columns must be nullable/no-CHECK to remain self-applicable per the migration delegation classifier; a NOT NULL/CHECK version would stall the SD on a chairman apply ceremony. Added as a new risk.' },
    { id: 'f4-stale-lint-allowlist', severity: 'medium', note: 'scripts/lint/schema-reference-allowlist.json still marks chairman_held_sends as chairman-gated/staged-not-applied despite being live since 2026-08-25; removal folded into scope via a new risk entry.' },
    { id: 'f5-orphan-detector-scope', severity: 'medium', note: 'Orphan detector criterion should target consult_row_id IS NULL / attempts>0 / stuck-in-releasing rather than re-implementing the existing v_chairman_held_sends_unreconcilable view.' },
    { id: 'f6-reply-ids-naming-mismatch', severity: 'medium', note: 'Rubric reads message.replyId (singular) while the criterion/column is reply_ids (plural) -- explicit mapping required in PRD, corrected note added to the relevant success_criteria entry.' },
    { id: 'no-duplicate-sd-confirmed', severity: 'info', note: 'SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (completed) and -002 (cancelled) both target this lane but neither overlaps these 4 defects -- independently re-confirmed.' },
  ],
  metadata: { defects_confirmed: 4, fix_shape_corrections_applied: 4, sd_content_corrected: true },
  execution_time_ms: 1051000,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'VALIDATION', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst' }, results, { phase: PHASE });
console.log('VALIDATION_STORED_ID=' + (stored?.id || 'n/a'));
