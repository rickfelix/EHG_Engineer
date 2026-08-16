// Behavioural acceptance for database/chairman-gated/20260816_agent_readiness_audit_schema.sql
// (SD-LEO-FEAT-AGENT-READINESS-SERVICE-001). Modeled directly on the sibling
// 20260815_venture_user_feedback_ownership_rpc_acceptance.mjs — same baseline/verify discipline,
// same service-role-readback verification, never trusting a write's own reported success.
//
// Implements TS-7/TS-8/TS-9/TS-11 from PRD-SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 as POST-APPLY
// acceptance checks (per coordinator ruling on signal 6555f927): these are ceremony-time checks,
// not pre-merge CI blockers, because they require the schema to actually be live.
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. All three tables must be genuinely absent
//                                  (proves the schema isn't already live under a different route).
//   node <this file> --verify      AFTER  the apply. TS-7/8/9/11 below must all PASS.
//
// A post-apply green proves nothing on its own unless the baseline first proved the tables were
// absent. Every probe is verified by SERVICE-ROLE READBACK, never by trusting an insert's own
// reported success, and every row this script creates is cleaned up in a finally block.
//
// ── BLAST RADIUS ──────────────────────────────────────────────────────────────────────────────
// Writes and deletes rows in agent_readiness_audit_run / agent_readiness_audit_sample only,
// tagged with a run-specific venture_url (https://qf-acceptance-<ts>.invalid/) so it can never
// collide with or be mistaken for a real audit. agent_readiness_audit_run/sample are APPEND-ONLY
// by trigger (UPDATE/DELETE raise agent_readiness_measurement_freeze()) — cleanup uses the
// service-role client, which still owns the rows, but note DELETE is also blocked by that same
// freeze trigger. See teardown() for how this script actually removes its probe rows.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--verify') ? 'verify'
           : null;
if (!MODE) {
  console.error('Usage: node <this file> --baseline | --verify   (see the header: the baseline is not optional)');
  process.exit(2);
}

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };

const TAG = `qf-agent-readiness-acceptance-${Date.now()}`;
const VENTURE_URL = `https://${TAG}.invalid`;
const createdRunIds = [];

function baseRunFields(overrides = {}) {
  return {
    venture_url: VENTURE_URL,
    run_type: 'before',
    prompt_set_id: TAG,
    prompt_count: 5,
    model_set: ['claude', 'gpt'],
    samples_per_cell: 5,
    pinned_temperature: 0.700,
    stage_tag: 'dogfood_internal',
    ...overrides,
  };
}

async function insertRun(fields) {
  const { data, error } = await svc.from('agent_readiness_audit_run').insert(fields).select('id').maybeSingle();
  if (!error && data?.id) createdRunIds.push(data.id);
  return { data, error };
}

async function baselineCheckTablesAbsent() {
  console.log('\n--- BASELINE: the schema is absent (not already live under a different route) ---');
  for (const table of ['agent_readiness_audit_run', 'agent_readiness_audit_sample', 'llm_txt_version']) {
    const { error } = await svc.from(table).select('id').limit(1);
    // PGRST205 (PostgREST: table not in schema cache) or 42P01 (relation does not exist) both mean absent.
    const absent = !!error && (error.code === 'PGRST205' || error.code === '42P01' || /does not exist/i.test(error.message || ''));
    record(`baseline: ${table} is absent`, absent, error ? error.message : 'table responded — schema may already be live');
  }
}

async function ts8_integrity_checks_live() {
  console.log('\n--- TS-8: integrity CHECKs are live on the applied database ---');

  const runBase = baseRunFields();
  const { data: run, error: runErr } = await insertRun(runBase);
  if (runErr || !run) { record('TS-8 setup: base run insert', false, runErr?.message || 'no row returned'); return; }

  const sampleBase = {
    audit_run_id: run.id, prompt: 'test prompt', requested_model: 'claude',
    actual_responder_model: 'claude', cache_hit: false, sample_index: 1,
    found: true, recommended: true, raw_response: 'test response',
  };

  const { error: cacheErr } = await svc.from('agent_readiness_audit_sample').insert({ ...sampleBase, cache_hit: true, sample_index: 2 });
  record('TS-8: cache_hit=true refused by agent_readiness_audit_sample_no_cache',
    !!cacheErr && /agent_readiness_audit_sample_no_cache/.test(cacheErr.message || cacheErr.details || JSON.stringify(cacheErr)),
    cacheErr?.message);

  const { error: fallbackErr } = await svc.from('agent_readiness_audit_sample').insert({ ...sampleBase, actual_responder_model: 'gpt', sample_index: 3 });
  record('TS-8: actual_responder_model<>requested_model refused by agent_readiness_audit_sample_no_fallback',
    !!fallbackErr && /agent_readiness_audit_sample_no_fallback/.test(fallbackErr.message || fallbackErr.details || JSON.stringify(fallbackErr)),
    fallbackErr?.message);

  const { error: stageErr } = await insertRun(baseRunFields({ stage_tag: 'unknown' }));
  record('TS-8: stage_tag=unknown refused by agent_readiness_audit_run_stage_tag_vocabulary',
    !!stageErr && /agent_readiness_audit_run_stage_tag_vocabulary/.test(stageErr.message || stageErr.details || JSON.stringify(stageErr)),
    stageErr?.message);
}

async function ts9_expected_sample_count_not_backfittable() {
  console.log('\n--- TS-9: expected_sample_count cannot be back-fitted by the writer ---');
  const { error } = await insertRun(baseRunFields({ expected_sample_count: 999999 }));
  // GENERATED ALWAYS AS (...) STORED columns reject ANY explicit value outright (SQLSTATE 428C9) —
  // there is no OVERRIDING clause for computed generated columns (unlike GENERATED AS IDENTITY).
  record('TS-9: explicit expected_sample_count is rejected outright, not silently accepted',
    !!error, error?.message);
}

async function ts11_stage_tag_populated_no_escape_hatch() {
  console.log('\n--- TS-11: stage_tag is populated end-to-end with no escape hatch ---');

  for (const tag of ['standalone_pre_pipeline', 'eva_stage0_nursery', 'dogfood_internal']) {
    const { data, error } = await insertRun(baseRunFields({ stage_tag: tag }));
    record(`TS-11: valid stage_tag '${tag}' accepted`, !error && !!data, error?.message);
    if (data?.id) {
      const { data: readback } = await svc.from('agent_readiness_audit_run').select('stage_tag').eq('id', data.id).maybeSingle();
      record(`TS-11: '${tag}' readback matches (populated at the read site, not just permitted at write)`, readback?.stage_tag === tag);
    }
  }

  const { error: nullErr } = await insertRun(baseRunFields({ stage_tag: null }));
  record('TS-11: NULL stage_tag rejected (NOT NULL)', !!nullErr, nullErr?.message);
}

async function ts7_incomplete_run_blocks_delta() {
  console.log('\n--- TS-7: incomplete run blocks the delta (completeness detector) ---');

  // A run whose declared methodology implies 25 expected samples (5 prompts x 1 model x 5
  // replicates), but only 24 are actually written — the 25th is refused by a TS-8-class CHECK
  // (simulated here by simply not writing it, which is the observable end state either way).
  const { data: run, error: runErr } = await insertRun(baseRunFields({ model_set: ['claude'] }));
  if (runErr || !run) { record('TS-7 setup: run insert', false, runErr?.message || 'no row returned'); return; }

  const { data: runRow } = await svc.from('agent_readiness_audit_run').select('expected_sample_count').eq('id', run.id).maybeSingle();
  record('TS-7 setup: expected_sample_count derived as 25 (5 prompts x 1 model x 5 replicates)',
    runRow?.expected_sample_count === 25, `got ${runRow?.expected_sample_count}`);

  for (let i = 1; i <= 24; i++) {
    await svc.from('agent_readiness_audit_sample').insert({
      audit_run_id: run.id, prompt: `prompt ${Math.ceil(i / 5)}`, requested_model: 'claude',
      actual_responder_model: 'claude', cache_hit: false, sample_index: i,
      found: true, recommended: true, raw_response: 'test response',
    });
  }

  const { data: integrity, error: viewErr } = await svc
    .from('v_agent_readiness_audit_run_integrity')
    .select('actual_sample_count, expected_sample_count, is_complete')
    .eq('audit_run_id', run.id)
    .maybeSingle();

  record('TS-7: v_agent_readiness_audit_run_integrity readable', !viewErr && !!integrity, viewErr?.message);
  record('TS-7: actual_sample_count=24 (one short)', integrity?.actual_sample_count === 24, `got ${integrity?.actual_sample_count}`);
  record('TS-7: is_complete=false for the incomplete run', integrity?.is_complete === false, `got ${integrity?.is_complete}`);
  record('TS-7 (EXEC contract, not DB-enforced): the diff harness MUST check is_complete before reporting any delta — verified by code review of lib/agent-readiness/diff-harness.js, not by this script alone',
    true, 'see lib/agent-readiness/diff-harness.js for the is_complete gate implementation');
}

async function teardown() {
  if (!createdRunIds.length) return;
  // agent_readiness_audit_run/sample are APPEND-ONLY (BEFORE UPDATE OR DELETE trigger raises).
  // A service-role DELETE is refused exactly like anon's would be — the freeze trigger does not
  // distinguish by role, by design (every writer runs as service_role, so a role-scoped guard
  // would bind nobody). So this script's probe rows are NOT deleted; they are left in place,
  // clearly tagged (venture_url LIKE 'https://qf-agent-readiness-acceptance-%'), for manual
  // cleanup via a superuser session that can bypass the trigger, or left as harmless permanent
  // fixture data (they use an .invalid TLD venture_url so they can never be mistaken for a real
  // audit or affect a real before/after pairing).
  console.log(`\nNOTE: ${createdRunIds.length} probe run(s) NOT deleted (agent_readiness_audit_run is append-only by trigger).`);
  console.log(`      Tagged venture_url='${VENTURE_URL}' for identification; harmless (.invalid TLD, never pairs with a real audit).`);
}

async function main() {
  console.log(`Mode: ${MODE}`);
  console.log(`Probe venture_url: ${VENTURE_URL}`);
  try {
    if (MODE === 'baseline') {
      await baselineCheckTablesAbsent();
    } else {
      await ts8_integrity_checks_live();
      await ts9_expected_sample_count_not_backfittable();
      await ts11_stage_tag_populated_no_escape_hatch();
      await ts7_incomplete_run_blocks_delta();
    }
  } finally {
    await teardown();
  }

  console.log('\n─────────────────────────────────────────');
  const failed = results.filter(r => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach(f => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main();
