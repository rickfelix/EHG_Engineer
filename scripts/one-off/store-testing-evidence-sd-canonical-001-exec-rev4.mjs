// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — TESTING evidence REV 4 (EXEC phase).
// Delta over rev3 (aafdf8c6-d839-4683-9267-9398439a1c55): matches security-agent's re-review
// checklist item by item, and records one hazard the checklist's own F2 item 3 asked about but did
// not anticipate. Rebuilds from the stored rev3 row so the revisions cannot drift.
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'EXEC';
const REV3_ID = 'aafdf8c6-d839-4683-9267-9398439a1c55';

const client = await createDatabaseClient('engineer', { verify: false });
const { rows } = await client.query(
  'SELECT summary, confidence, verdict, metadata FROM sub_agent_execution_results WHERE id = $1',
  [REV3_ID],
);
await client.end();
if (!rows.length) throw new Error('rev3 row not found: ' + REV3_ID);
const prev = rows[0];
const prevMeta = prev.metadata || {};
const prevFindings = Array.isArray(prevMeta.findings) ? prevMeta.findings : [];
if (!prevFindings.length) throw new Error('rev3 findings missing — refusing to store a rev4 that would lose them');

const NEW_FINDINGS = [
  {
    id: 'reset-would-silently-flip-status-via-auto-transition-sibling',
    severity: 'high',
    note:
      'NEW HAZARD, found while answering the re-review checklist rather than by it. The checklist asked ' +
      'me to "confirm the reset UPDATE touches NO protected column ... safe to run even on a re-apply ' +
      'where one of the two triggers already exists". The first half confirms cleanly: the reset SET ' +
      'clause names only lifecycle_write_token, so aaa_ and zzz_ both evaluate `protected changed` as ' +
      'FALSE and pass it through, and zzz_\'s NULL assignment is a no-op on a value already going to ' +
      'NULL. The second half does NOT hold unconditionally, and the reason is a DIFFERENT trigger. ' +
      'status_auto_transition (BEFORE ROW, position 6) has NO TG_OP guard and NO IS DISTINCT FROM — ' +
      'verified against the checked-in live capture — so it fires on EVERY update and unconditionally ' +
      'assigns NEW.status := \'pending_approval\' whenever current_phase IN (EXEC,PLAN) AND progress ' +
      '>= 100. On such a row the reset, despite naming no protected column itself, becomes a ' +
      'protected-column write: a maintenance statement SILENTLY FLIPPING LIFECYCLE STATUS, in bulk, ' +
      'mid-ceremony, with no operator intent — the exact class of unattributable lifecycle mutation ' +
      'this SD exists to make impossible. FIX: the reset block now counts rows in that predicate ' +
      'FIRST and RAISEs with their SD ids rather than proceeding, so the outcome is a loud refusal ' +
      'instead of a silent flip. REACHABILITY, stated honestly rather than overclaimed: the state is ' +
      'believed unreachable today, because the same UPDATE that leaves a stamp also runs ' +
      'status_auto_transition, so any stamped row inside the predicate already reads ' +
      '\'pending_approval\'. The reachable exception is a row that entered the predicate WITHOUT an ' +
      'UPDATE — an INSERT, a restore, or a trigger-disabled load — since that trigger is BEFORE UPDATE ' +
      'only. The DDL fixture builds it exactly that way (a direct INSERT), which is both the proof ' +
      'the state is constructible and the reason six lines of check are worth carrying. Two-sided: a ' +
      'MIRROR test with an otherwise-identical row outside the predicate resets normally, so the ' +
      'check is discriminating rather than a blanket refusal that would make every re-apply impossible.',
  },
  {
    id: 'security-re-review-checklist-applied-item-by-item',
    severity: 'low',
    note:
      'CHECKLIST CONFORMANCE, each item verified mechanically rather than asserted. F1.1 the split ' +
      'file uses ADD COLUMN IF NOT EXISTS (re-runnable, MODE 2 convention). F1.2 the SET lock_timeout ' +
      '= \'3s\' requirement is restated IN FULL in the new file under its own "APPLY-TIME REQUIREMENT ' +
      '— NOT OPTIONAL, AND NOT INHERITED" heading, with the reasoning that ADD COLUMN being ' +
      'catalog-only makes it FAST, not LOCK-FREE — it still takes ACCESS EXCLUSIVE, and a ' +
      'one-statement migration is exactly the kind applied casually. F1.3 canonical-writer-stamp.js ' +
      'now OPENS with the positive claim ("THIS MODULE REQUIRES A DATABASE MIGRATION TO BE APPLIED ' +
      'FIRST", naming the file) before the record of the false claim it replaced, so a reader gets ' +
      'the dependency rather than merely the absence of a wrong statement. F2.1 measured line ' +
      'numbers: DROP aaa (504), DROP zzz (505), $reset_at_rest$ (547-587), CREATE aaa (593), CREATE ' +
      'zzz (600) — the reset sits after BOTH drops and before BOTH creates, so a partial re-run ' +
      'cannot arm one trigger over dirty rows and there is never a window where aaa_ exists without ' +
      'zzz_. F2.2 both assertions are INDEPENDENT re-counts (SELECT count(*) ... WHERE ' +
      'lifecycle_write_token IS NOT NULL), never an echo of the UPDATE\'s ROW_COUNT; ROW_COUNT is used ' +
      'only for the informational NOTICE. A second real count was added to the final $verify$ block, ' +
      'asserting the END STATE (guard armed AND zero at rest) as distinct from the reset block\'s ' +
      'PRECONDITION claim. F2.3 confirmed by grep: zero protected columns in the reset SET clause. ' +
      'F3.1 the authenticated disclosure is now a DISTINCT item 5, not folded into item 4 — different ' +
      'role, different reasoning (a permissive RLS qual + EXECUTE grant, NOT DISABLE TRIGGER access). ' +
      'F3.2 the PRD\'s TR-4 and FR-3 descriptions were amended additively via ' +
      'scripts/one-off/amend-prd-sd-canonical-001-authenticated-non-coverage.mjs (idempotent, anchors ' +
      'asserted, read back independently, TR/FR counts preserved). README now documents THREE ordered ' +
      'steps across TWO migrations with a code deploy between them, including a step-2 section and ' +
      'the outstanding-writers query.',
  },
];

const results = {
  verdict: prev.verdict,
  confidence: 95,
  summary:
    prev.summary +
    ' REV 4 DELTA: matched security-agent\'s re-review checklist item by item (F1.1-1.3, F2.1-2.3, ' +
    'F3.1-3.2, plus the three-step README), and while answering F2 item 3 found a hazard the item ' +
    'asked about but did not anticipate: the reset names no protected column, yet ' +
    'status_auto_transition — which has no TG_OP guard and no IS DISTINCT FROM — would turn it into ' +
    'a silent bulk status flip on any row at current_phase IN (EXEC,PLAN) with progress >= 100. The ' +
    'reset now refuses with the affected SD ids instead, proven two-sided (a row outside the ' +
    'predicate still resets normally). DDL suite 73 -> 75, unit 53/53. Verdict unchanged at ' +
    'CONDITIONAL_PASS for the same two reasons; confidence 94 -> 95.',
  findings: [...NEW_FINDINGS, ...prevFindings],
  metadata: {
    ...prevMeta,
    revision: 4,
    supersedes_row_id: REV3_ID,
    supersedes_chain: [...(prevMeta.supersedes_chain || []), REV3_ID],
    tests_executed: {
      'tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js': '75/75 pass (+2 for the flip-refusal)',
      'tests/unit/handoff/canonical-writer-stamp.test.js': '21/21 pass',
      'tests/unit/governance/canonical-helper-scanner-recall.test.js': '12/12 pass',
      'tests/unit/lib/lead-precheck-helpers.test.js': '20/20 pass (pre-existing suite, no regression)',
    },
    security_checklist: {
      'F1.1 ADD COLUMN IF NOT EXISTS in split file': true,
      'F1.2 lock_timeout restated in split file header': true,
      'F1.3 JS comment states the dependency positively': true,
      'F2.1 reset placed before BOTH CREATE TRIGGER statements': 'drops 504/505, reset 547-587, creates 593/600',
      'F2.2 real COUNT assertions, not ROW_COUNT echoes': 'two, in $reset_at_rest$ and $verify$',
      'F2.3 reset SET clause names no protected column': true,
      'F2.3 addendum — sibling can still make it one': 'status_auto_transition; now refused loudly',
      'F3.1 authenticated as a distinct item 5': true,
      'F3.2 PRD TR-4 and FR-3 amended': true,
      'README three ordered steps documented': true,
    },
    prd_amended_by_exec: {
      script: 'scripts/one-off/amend-prd-sd-canonical-001-authenticated-non-coverage.mjs',
      fields: ['technical_requirements TR-4.description', 'functional_requirements FR-3.description'],
      style: 'additive append of one marked amendment; idempotent; TR/FR counts verified preserved',
      note: 'EXEC edited the PRD at the team lead\'s explicit direction — flagged because the team lead is also editing it concurrently.',
    },
  },
  execution_time_ms: 14_400_000,
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
