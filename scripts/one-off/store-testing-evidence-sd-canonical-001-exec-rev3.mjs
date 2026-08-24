// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — TESTING evidence REV 3 (EXEC phase).
// Delta over rev2 (bb573c18-d0cc-429f-95a8-a3bb1c854c09): applies the EXEC-phase SECURITY review's
// F1/F2/F3, each re-measured here before being acted on rather than accepted as stated.
// Rebuilds from the stored rev2 row so the revisions cannot drift.
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'EXEC';
const REV2_ID = 'bb573c18-d0cc-429f-95a8-a3bb1c854c09';

const client = await createDatabaseClient('engineer', { verify: false });
const { rows } = await client.query(
  'SELECT summary, confidence, verdict, metadata FROM sub_agent_execution_results WHERE id = $1',
  [REV2_ID],
);
await client.end();
if (!rows.length) throw new Error('rev2 row not found: ' + REV2_ID);
const prev = rows[0];
const prevMeta = prev.metadata || {};
const prevFindings = Array.isArray(prevMeta.findings) ? prevMeta.findings : [];
if (!prevFindings.length) throw new Error('rev2 findings missing — refusing to store a rev3 that would lose them');

const NEW_FINDINGS = [
  {
    id: 'f1-fixed-stamp-column-split-into-its-own-migration',
    severity: 'critical',
    note:
      'FIXED, after re-measuring the claim myself rather than restating it. SECURITY found a FALSE ' +
      'claim I had written in canonical-writer-stamp.js: "sending this column is harmless before the ' +
      'migration applies... No feature flag is needed in either direction." Re-measured live with a ' +
      'ZERO-WRITE probe (predicate matched no row; a post-probe count confirms no row was created; ' +
      'evidence at database/evidence/canonical-writer-choke/deploy-order-and-role-surface.json): a ' +
      'PostgREST UPDATE whose payload names a column absent from the schema cache returns ' +
      'PGRST204 ("Could not find the \'lifecycle_write_token\' column ... in the schema cache") ' +
      'BEFORE matching any row, while the identical call carrying only pre-existing columns returns ' +
      '{data: [], error: null}. So merging the branch before the column exists takes EVERY handoff ' +
      'transition down, not a subset. Worse, and confirmed: PGRST204 !== SDCW1, so ' +
      'isCanonicalWriteRejection() returns FALSE and the two compensation paths fall straight back ' +
      'to log-and-swallow — the exact silent-rollback outcome FR-4\'s F8 amendment exists to prevent, ' +
      'reached through a different door. FIX (the preferred one): the ADD COLUMN is now its own ' +
      'migration, database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql ' +
      '— additive, catalog-only, independently reviewable — so "this branch is safe to merge" is ' +
      'decoupled from "the full ceremony is approved". The guard migration no longer contains any ' +
      'ALTER TABLE and opens with a $precondition$ block that ABORTS, naming the prerequisite file, ' +
      'if the column is absent; a DDL test proves that abort happens before any object is created, ' +
      'with a mirror proving the same file applies cleanly once step 1 has run. The false comment is ' +
      'replaced by the measurement and the 3-step deploy order, and a unit test now pins the ' +
      'correction (asserts the old wording is gone, PGRST204 is named, and isCanonicalWriteRejection ' +
      'returns false for it). NOT machine-enforceable, so it is called out in the header and README: ' +
      'step 3 before step 2 (guard live, writers unstamped) breaks the fleet the other way.',
  },
  {
    id: 'f2-fixed-at-rest-reset-before-arming-the-guard',
    severity: 'high',
    note:
      'FIXED, and the bug it closes is now proven two-sided rather than argued. MODE 1 rollback drops ' +
      'zzz_ — the ONLY at-rest NULLer — while deliberately retaining the column and every stamping ' +
      'writer, so registry-valid stamps accumulate at rest for the whole rollback window on exactly ' +
      'the rows the pipeline touches most. Re-arming aaa_ over that state lets the next UNSTAMPED ' +
      'protected-column write inherit NEW.lifecycle_write_token = OLD = \'handoff.js\', which ' +
      'validates: the guard re-arms BLIND, resurrecting F1b. FIX: a $reset_at_rest$ block that clears ' +
      'inherited stamps and hard-fails if any survive, placed AFTER both DROP TRIGGER statements (so ' +
      'no live guard evaluates it) and BEFORE both CREATE TRIGGER statements (so the guard is never ' +
      'armed over stale state, and there is no window where aaa_ exists without zzz_). The ' +
      'IS NOT NULL predicate makes it a genuine zero-row no-op on a first apply. TWO-SIDED PROOF in ' +
      'the DDL tier: one test reproduces the rollback window, asserts the stamp really does survive ' +
      'at rest (so the fixture observes its own subject), re-applies, and asserts the stamp is ' +
      'cleared AND the unstamped write is rejected; the MIRROR arms the guard by hand skipping only ' +
      'the reset and asserts the identical write is WRONGLY ACCEPTED — i.e. the bug is real and the ' +
      'reset is what closes it, not something else in the migration. A third test pins the reset\'s ' +
      'position between the drops and the creates. SIDE EFFECT STATED IN THE FILE: this is a real ' +
      'UPDATE, so it fires the table\'s full trigger estate per matching row; the predicate bounds ' +
      'that to rows written during a rollback window. Deliberately NOT done via DISABLE TRIGGER (the ' +
      'exact bypass TR-4 discloses as this guard\'s boundary) or DROP-and-re-ADD COLUMN (breaks the ' +
      'column migration\'s independence and invalidates PostgREST\'s schema cache mid-flight). ' +
      'INCIDENTAL, found while wiring this: my first draft of the COLUMN migration hard-failed on ' +
      'any non-NULL stamp "immediately after creation", which is wrong — that file is re-runnable ' +
      'and a rollback window legitimately violates that data condition. It now asserts only the ' +
      'SCHEMA property (nullable, no DEFAULT — which is what makes a backfill impossible) and RAISEs ' +
      'a NOTICE about data state, leaving enforcement to the guard migration that is actually ' +
      'responsible for fixing it.',
  },
  {
    id: 'f3-fixed-non-coverage-disclosure-now-names-authenticated',
    severity: 'medium',
    note:
      'FIXED (wording), claim verified live first. TR-4\'s non-coverage item 4 framed the "a forger ' +
      'already has DISABLE TRIGGER access" argument around service_role alone. Measured: ' +
      '`authenticated` holds BOTH a table-level UPDATE grant AND a PERMISSIVE UPDATE policy — ' +
      'venture_update_strategic_directives_v2, qual ((venture_id IS NULL) OR ' +
      'fn_user_has_venture_access(venture_id)) — and nearly every SD has venture_id IS NULL, so it ' +
      'can UPDATE nearly every row, and can enumerate valid identities through the new EXECUTE grant ' +
      'on sd_canonical_writer_policy(). The disclosure now states that the guard adds NO protection ' +
      'against EITHER role, with the measured policy quoted inline. Two things kept explicit so the ' +
      'correction is not over-read: (a) this is NOT a privilege expansion introduced here — pre-guard, ' +
      '`authenticated` already wrote lifecycle columns freely with no stamp required, so its ' +
      'capability is unchanged, and the registry EXECUTE grant is a PREREQUISITE for its writes to be ' +
      'evaluated at all rather than failing on permission-denied; (b) `anon` is genuinely different ' +
      'and IS blocked — it holds the table grant but no anon UPDATE policy, so RLS filters every row. ' +
      'The PRD\'s own TR-4/FR-3 text still carries the narrower service_role-only claim; that is the ' +
      'team lead\'s to amend, and is the only part of F3 not addressed here.',
  },
  {
    id: 'f4-search-path-gap-deliberately-not-fixed',
    severity: 'low',
    note:
      'NOT FIXED, by explicit direction, and recorded so the silence is not mistaken for an oversight. ' +
      'SECURITY flagged a PRE-EXISTING missing/loose search_path on 3 SECURITY DEFINER functions this ' +
      'SD amends. Fixing it here would change the captured function bodies beyond the enumerated ' +
      'stamp lines, which would break the verbatim-capture invariant the DDL test enforces (each ' +
      '.after.sql must equal its live .before.sql plus stamp edits only) — that invariant is what ' +
      'makes "we amended the LIVE body, not a stale copy" checkable, and it is worth more than an ' +
      'opportunistic hardening of a gap that predates this SD. Worth a separate QF.',
  },
];

const results = {
  verdict: prev.verdict,
  confidence: 94,
  summary:
    prev.summary +
    ' REV 3 DELTA: applied the EXEC SECURITY review\'s F1/F2/F3, each re-measured before being acted ' +
    'on. F1 (CRITICAL) — a comment I wrote claiming the stamp payload was harmless pre-migration was ' +
    'FALSE; re-measured PGRST204 with a zero-write probe, split the ADD COLUMN into its own ' +
    'independently-appliable migration, and made the guard migration abort on a $precondition$ block ' +
    'if the column is absent. F2 (HIGH) — added a $reset_at_rest$ block between the DROPs and the ' +
    'CREATEs so a re-apply after a MODE 1 rollback cannot re-arm the guard blind, with a two-sided ' +
    'DDL test showing the write is wrongly accepted without it. F3 (MEDIUM) — the non-coverage ' +
    'disclosure now names `authenticated` alongside service_role, with the measured policy quoted. ' +
    'F4 deliberately left alone. DDL suite 67 -> 73 scenarios, unit 31 -> 33; all green. Verdict ' +
    'stays CONDITIONAL_PASS for the two unchanged reasons (the unwired writers are now step 2 of a ' +
    'documented 3-step deploy order; FR-8 still half-delivered). Confidence 92 -> 94.',
  findings: [...NEW_FINDINGS, ...prevFindings],
  metadata: {
    ...prevMeta,
    revision: 3,
    supersedes_row_id: REV2_ID,
    supersedes_chain: [...(prevMeta.supersedes_chain || []), REV2_ID],
    tests_executed: {
      'tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js': '73/73 pass (+6 for F1/F2)',
      'tests/unit/handoff/canonical-writer-stamp.test.js': '21/21 pass (+2 for F1)',
      'tests/unit/governance/canonical-helper-scanner-recall.test.js': '12/12 pass',
      'tests/unit/lib/lead-precheck-helpers.test.js': '20/20 pass (pre-existing suite, no regression)',
    },
    migration_files: {
      step1_column: 'database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql',
      step3_guard: 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql',
      step3_rollback: 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke_DOWN.sql',
    },
    deploy_order_evidence: 'database/evidence/canonical-writer-choke/deploy-order-and-role-surface.json',
    deploy_order_enforced_in_sql: 'step 3 aborts via $precondition$ when the column is absent',
    deploy_order_NOT_enforceable: 'step 3 before step 2 (guard live, writers unstamped) — header + README only',
  },
  execution_time_ms: 12_600_000,
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
