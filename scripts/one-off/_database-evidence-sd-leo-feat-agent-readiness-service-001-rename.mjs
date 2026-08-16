/**
 * Applies the coordinator's naming ruling to the DATABASE evidence already recorded for
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001, and corrects a miscount in that evidence.
 *
 * Ruling: audit_run -> agent_readiness_audit_run, audit_sample -> agent_readiness_audit_sample,
 * v_audit_run_integrity -> v_agent_readiness_audit_run_integrity (70+ existing %audit% tables in
 * this schema all mean governance/security audit).
 *
 * CORRECTION recorded here, not quietly overwritten: the original row claimed 13 negative guard
 * refusals. The re-run added a PROGRAMMATIC tally and it reports 12 — the original 13 was a hand
 * count of the output, not a measurement. Both runs actually exercised 12 negative cases. The
 * number was the only thing wrong; every guard fired in both runs and zero blind guards were found.
 */
const ROOT = 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FEAT-AGENT-READINESS-SERVICE-001';
const { createDatabaseClient } = await import(`${ROOT}/scripts/lib/supabase-connection.js`);
const { updateAndVerify } = await import(`${ROOT}/lib/db/writeback-verify.mjs`);
const { createClient } = await import('@supabase/supabase-js');

const ROW_ID = '7f9340e1-12d2-4802-a2ab-75d717eb6961';
const PRD_ID = 'PRD-SD-LEO-FEAT-AGENT-READINESS-SERVICE-001';

function renameText(s) {
  return s
    .replace(/\bv_audit_run_integrity\b/g, 'v_agent_readiness_audit_run_integrity')
    .replace(/\baudit_measurement_freeze\b/g, 'agent_readiness_measurement_freeze')
    .replace(/\baudit_run_(?!id\b)/g, 'agent_readiness_audit_run_')
    .replace(/\baudit_sample_/g, 'agent_readiness_audit_sample_')
    .replace(/\baudit_run\b/g, 'agent_readiness_audit_run')
    .replace(/\baudit_sample\b/g, 'agent_readiness_audit_sample')
    .replace(/13 negative/g, '12 negative')
    .replace(/negative cases refused/g, 'negative cases refused')
    .replace(/and 13 negative refusals/g, 'and 12 negative refusals');
}

const c = await createDatabaseClient('engineer', { verify: false });

const cur = await c.query(
  `SELECT summary, detailed_analysis, warnings, metadata FROM sub_agent_execution_results WHERE id=$1`,
  [ROW_ID]
);
if (cur.rows.length === 0) throw new Error(`evidence row ${ROW_ID} not found`);
const r = cur.rows[0];

const newSummary = renameText(r.summary);
const newDetailed =
  renameText(r.detailed_analysis) +
  '\n\nCOORDINATOR NAMING RULING APPLIED. audit_run -> agent_readiness_audit_run, audit_sample -> agent_readiness_audit_sample, v_audit_run_integrity -> v_agent_readiness_audit_run_integrity, audit_measurement_freeze() -> agent_readiness_measurement_freeze(). llm_txt_version is unchanged (already unambiguous). The FK column audit_run_id is deliberately NOT renamed: it lives inside an already-namespaced table, so agent_readiness_audit_run_id would add 15 characters to every query for no disambiguation gain. All 27 new identifiers were length-audited against the 63-byte limit (longest: agent_readiness_audit_sample_requested_model_nonempty at 53) because Postgres TRUNCATES over-long identifiers SILENTLY, which would have split a constraint name away from the name the DO $verify$ block asserts on. Migration re-applied in a fresh BEGIN/ROLLBACK: DDL + landing assertions passed, 3 positive accepts, 12 negative refusals each by the correctly-renamed constraint, 0 blind guards, and an in-transaction catalog check confirmed 0 objects under the old names and 3 under the new.' +
  '\n\nCOUNT CORRECTION. The original version of this row said 13 negative refusals. The re-run added a PROGRAMMATIC tally, which reports 12; the 13 was a hand count of console output, not a measurement. Both runs exercised the same 12 negative cases and every one was refused. Recording the correction rather than silently overwriting it, because a guard-count is exactly the kind of number that gets cited later as evidence.';

const warnings = r.warnings.map((w) => {
  if (w.area !== 'naming') return w;
  return {
    ...w,
    severity: 'RESOLVED',
    issue: renameText(w.issue),
    recommendation:
      'RESOLVED by coordinator ruling: renamed to agent_readiness_audit_run / agent_readiness_audit_sample / v_agent_readiness_audit_run_integrity. PRD data_contract names (TR-4) now differ from the shipped schema names by explicit ruling rather than by drift — EXEC should read the migration file, not TR-4, for table names.',
  };
});

const dbAnalysis = {
  ...r.metadata.database_analysis,
  naming_ruling:
    'Coordinator ruled 2026-08-16: rename to agent_readiness_audit_run / agent_readiness_audit_sample / v_agent_readiness_audit_run_integrity to avoid the 70+ %audit% governance-table collision. Applied to the migration file and re-verified.',
  tables_created: ['agent_readiness_audit_run', 'agent_readiness_audit_sample', 'llm_txt_version'],
  views_created: ['v_agent_readiness_audit_run_integrity'],
  functions_created: [
    'canonical_model_set(TEXT[])',
    'agent_readiness_measurement_freeze()',
    'llm_txt_version_publish_only()',
  ],
  fk_column_not_renamed:
    'audit_run_id kept as-is — inside an already-namespaced table, the prefix would add length without disambiguation',
  identifier_length_audit:
    '27 new identifiers, longest 53 bytes, none over the 63-byte limit at which Postgres silently truncates',
  name_collision_check:
    'RESOLVED by ruling — no object now shares the generic %audit% naming of the 70+ governance audit tables; catalog check inside the dry-run txn confirmed 0 old-name objects, 3 new-name objects',
  db_enforced_invariants: [
    'agent_readiness_audit_sample_no_cache (cache_hit=false)',
    'agent_readiness_audit_sample_no_fallback (actual_responder_model=requested_model)',
    'llm_txt_version_publish_requires_lint',
    'agent_readiness_audit_run_stage_tag_vocabulary (no unknown member)',
    'agent_readiness_audit_run_model_set_canonical (order-sensitive array equality)',
  ],
  guards_two_sided_tested: {
    positive_accepted: 3,
    negative_refused: 12,
    blind_guards: 0,
    tally_method: 'programmatic counter (supersedes the hand count of 13 in the original row)',
  },
  count_correction:
    'Original row claimed 13 negative refusals; programmatic tally on re-run measured 12. Same 12 cases in both runs, all refused.',
  dry_run_reverified_after_rename: true,
  migration_applied: false,
};

const upd = await c.query(
  `UPDATE sub_agent_execution_results
     SET summary=$2, detailed_analysis=$3, warnings=$4::jsonb,
         metadata = jsonb_set(metadata, '{database_analysis}', $5::jsonb, true),
         updated_at = now()
   WHERE id=$1
   RETURNING id::text`,
  [ROW_ID, newSummary, newDetailed, JSON.stringify(warnings), JSON.stringify(dbAnalysis)]
);
if (upd.rowCount !== 1) throw new Error(`expected 1 row updated, got ${upd.rowCount}`);

// READ-AFTER-WRITE on the row (an UPDATE matching zero rows is indistinguishable from success).
const ver = await c.query(
  `SELECT metadata->'database_analysis'->'tables_created'  AS tables,
          metadata->'database_analysis'->'views_created'   AS views,
          metadata->'database_analysis'->'guards_two_sided_tested'->>'negative_refused' AS neg,
          metadata->>'repo_path' AS repo_path,
          (metadata ? 'database_analysis') AS has_key,
          summary LIKE '%agent_readiness_audit_run%' AS summary_renamed,
          detailed_analysis LIKE '%COORDINATOR NAMING RULING APPLIED%' AS ruling_recorded
     FROM sub_agent_execution_results WHERE id=$1`,
  [ROW_ID]
);
console.log('ROWVERIFY ' + JSON.stringify(ver.rows[0]));
await c.end();

// PRD metadata is what GATE 1 reads. Same patch, verified read-after-write.
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
try {
  await updateAndVerify({
    client: sb,
    table: 'product_requirements_v2',
    match: { id: PRD_ID },
    column: 'metadata',
    patch: { database_analysis: dbAnalysis },
    verifyKeys: ['database_analysis'],
  });
  console.log('PRDVERIFY helper-ok');
} catch (e) {
  // lib/db/writeback-verify.mjs:33 selects governance_metadata, which does not exist on
  // product_requirements_v2 — the UPDATE lands but verification throws. Verify independently
  // rather than trusting either the throw or the absence of one.
  console.log('PRDVERIFY helper-threw: ' + e.message.slice(0, 90));
}
const chk = await sb
  .from('product_requirements_v2')
  .select('metadata')
  .eq('id', PRD_ID)
  .single();
if (chk.error) throw new Error(`independent PRD verify failed: ${chk.error.message}`);
const da = chk.data.metadata?.database_analysis;
console.log(
  'PRDVERIFY independent has_key=' +
    !!da +
    ' design_informed=' +
    da?.design_informed +
    ' tables=' +
    JSON.stringify(da?.tables_created) +
    ' view=' +
    JSON.stringify(da?.views_created) +
    ' negative_refused=' +
    da?.guards_two_sided_tested?.negative_refused
);
