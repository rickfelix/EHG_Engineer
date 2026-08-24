// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — TESTING evidence REV 2 (EXEC phase).
// Delta over rev1 (e77cea46-b807-4069-9e0a-feb136e88b43): TS-29 Stage 1 has now been EXECUTED
// against the live PostgREST layer, so the one question the PRD says "must be resolved before EXEC
// proceeds, not discovered by it" is answered rather than assumed.
// Rebuilds from the stored rev1 row rather than restating it, so the two revisions cannot drift.
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'EXEC';
const REV1_ID = 'e77cea46-b807-4069-9e0a-feb136e88b43';

const client = await createDatabaseClient('engineer', { verify: false });
const { rows } = await client.query(
  'SELECT summary, confidence, verdict, metadata FROM sub_agent_execution_results WHERE id = $1',
  [REV1_ID],
);
await client.end();
if (!rows.length) throw new Error('rev1 row not found: ' + REV1_ID);
const prev = rows[0];
const prevMeta = prev.metadata || {};
const prevFindings = Array.isArray(prevMeta.findings) ? prevMeta.findings : [];
if (!prevFindings.length) throw new Error('rev1 findings missing — refusing to store a rev2 that would lose them');

const TS29_FINDING = {
  id: 'ts29-stage1-executed-sqlstate-round-trip-holds',
  severity: 'high',
  note:
    'RESOLVED BY MEASUREMENT, not assumption. TS-29 Stage 1 ran live on 2026-08-24 ' +
    '(scripts/sdcw1-sqlstate-roundtrip-probe.mjs; raw observations checked in at ' +
    'database/evidence/canonical-writer-choke/TS-29-stage1-sqlstate-roundtrip.json). THE QUESTION: does a ' +
    'CUSTOM 5-character SQLSTATE in the unassigned range survive PostgREST\'s error-translation layer as ' +
    'error.code, or get flattened/remapped/absorbed into a 0-row success? It mattered because ' +
    'isCanonicalWriteRejection() and FR-4\'s F7 finding both assume error.code === SDCW1, and a negative ' +
    'answer would have required a documented message-text fallback at all 15 wired sites. FIRST, why a ' +
    'scratch table was necessary: a live sweep of every function in the estate found ZERO custom ' +
    'SQLSTATEs — every explicit ERRCODE is a STANDARD code (22004, 22023, 23514, 28000, 42501, 53400) or ' +
    'plpgsql\'s own P0001/P0002 — so there was no zero-DDL surface to probe, and the previously-cited ' +
    '"round-trips verbatim for two real codes" evidence measured STANDARD codes, i.e. exactly the case ' +
    'not in doubt. RESULT, 9/9 checks pass, VERDICT=ROUND_TRIP_HOLDS: a rejection reaches supabase-js as ' +
    '{code:"SDCW1", message, details, hint} with code AND both message texts VERBATIM; a zero-row ' +
    'predicate returns error:null with data:[]; a valid stamp succeeds (two-sided, so a guard that ' +
    'rejected everything would have failed). `error !== null` therefore genuinely discriminates ' +
    'rejection from lost-CAS-race and NO message-text fallback is needed — the 15 wired sites\' ' +
    'error-handling shape is correct as built, unchanged. THREE INCIDENTAL MEASUREMENTS WORTH KEEPING: ' +
    '(1) PostgREST returns HTTP 400 for the unknown SQLSTATE, NOT 500 — so a rejection will not read as ' +
    'a server fault in logs, dashboards or alerting, which was a live operational risk nobody had ' +
    'checked. (2) On a REJECTION that also calls .select(), supabase-js returns data:null, NOT [] — ' +
    'confirming the PRD\'s latent trap live; only the zero-row case returns []. Any code reading ' +
    'data.length near a rejection path needs an Array.isArray() guard, which cas-completion.js already ' +
    'has and EXEC did not regress. (3) FIELD-NAME TRAP: the DETAIL payload is error.details (plural) ' +
    'through supabase-js/PostgREST but error.detail (singular) through node-postgres in the DDL tier — ' +
    'same value, different key; the two tiers\' assertions are each correct and must not be "unified". ' +
    'All three are now recorded in canonical-writer-stamp.js\'s own doc comment and the migration header. ' +
    'TR-1 COMPLIANCE, VERIFIED BY AN INDEPENDENT INSTRUMENT AFTER THE RUN (catalog query, not the ' +
    'probe\'s own success log): the throwaway table/function/trigger are gone (to_regclass NULL, 0, 0) ' +
    'and strategic_directives_v2 still has NO lifecycle_write_token column — zero DDL touched the real ' +
    'table at any point. STILL OPEN: TS-29 Stage 2 (the same assertions against the REAL guard once the ' +
    'chairman-gated migration applies). Stage 1 proves the PostgREST LAYER; only Stage 2 proves it for ' +
    'this trigger on this table, and it belongs to the apply ceremony.',
};

const results = {
  verdict: prev.verdict,
  confidence: 92,
  summary:
    prev.summary +
    ' REV 2 DELTA: TS-29 Stage 1 is now EXECUTED, not deferred — the custom-SQLSTATE round-trip through ' +
    'PostgREST + supabase-js was measured live against a throwaway scratch table (never ' +
    'strategic_directives_v2, and TR-1 compliance re-verified by catalog query afterwards). ' +
    'ROUND_TRIP_HOLDS, 9/9: error.code and both message texts arrive VERBATIM at HTTP 400 (not 500), ' +
    'and a zero-row predicate still returns error:null — so `error !== null` discriminates rejection ' +
    'from lost-race and the 15 wired sites need no message-text fallback. The verdict stays ' +
    'CONDITIONAL_PASS for the two unchanged reasons (13 registered-but-unwired writers as an apply-time ' +
    'blocker; FR-8 half-delivered), not for anything TS-29 revealed. Confidence 88 -> 92: the largest ' +
    'unmeasured assumption in the build is now measured.',
  findings: [TS29_FINDING, ...prevFindings],
  metadata: {
    ...prevMeta,
    revision: 2,
    supersedes_row_id: REV1_ID,
    supersedes_chain: [REV1_ID],
    ts_coverage: {
      ...(prevMeta.ts_coverage || {}),
      live_postgrest_tier: 'TS-29 Stage 1 — EXECUTED, 9/9 checks, verdict ROUND_TRIP_HOLDS',
      deferred:
        'TS-29 Stage 2 only — the same assertions re-run against the REAL guard post-apply; belongs to the chairman ceremony',
    },
    ts29_stage1: {
      probe: 'scripts/sdcw1-sqlstate-roundtrip-probe.mjs',
      evidence: 'database/evidence/canonical-writer-choke/TS-29-stage1-sqlstate-roundtrip.json',
      verdict: 'ROUND_TRIP_HOLDS',
      checks_passed: 9,
      http_status_for_custom_sqlstate: 400,
      message_text_fallback_required: false,
      scratch_objects_cleaned_up_verified_independently: true,
      strategic_directives_v2_untouched: true,
    },
  },
  execution_time_ms: 10_800_000,
};
delete results.metadata.findings;
delete results.metadata._findings_stripped;
delete results.metadata._findings_had_keys;
delete results.metadata.error;
delete results.metadata.stack;

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD_ID,
  { name: 'Enhanced QA Engineering Director' },
  results,
  { phase: PHASE },
);
console.log('CARRIED_FORWARD_FINDINGS=' + prevFindings.length + ' -> TOTAL=' + results.findings.length);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
