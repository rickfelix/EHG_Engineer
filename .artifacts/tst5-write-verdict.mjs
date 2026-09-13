#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_ID = 'fbbf9a6d-e079-4c22-9189-88336aae9a16';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'PASS',
  confidence: 92,
  critical_issues: [],
  metadata: {
    phase: 'PLAN',
    pass_number: 5,
    prd_id: 'PRD-SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001',
    prd_updated_at: '2026-09-13T02:26:56.585523',
    prior_evidence_rows: ['51dde124', '1d78482f', 'fc38d1fd', 'd12076b3'],
    review_type: 'adversarial_re_verification_with_live_execution',
    verification_method:
      'Executed the corrected trigger design live against Postgres 17.4 (BEGIN/ROLLBACK, TEMP tables only, never touched uat_test_runs). 16/16 checks passed, including 3 counterfactual CONTROL tests proving each corrective is load-bearing.',
    verification_scripts: [
      '.artifacts/tst5-verify-corrected-trigger.mjs',
      '.artifacts/tst5-verify-default-and-live-rows.mjs',
      '.artifacts/tst5-inspect-outlier-rows.mjs',
      '.artifacts/tst5-sweep-stale.mjs'
    ],
    prior_blockers_resolved: {
      'BLOCKER-1 (pass4, CRITICAL)':
        "CLOSED. Operative sections (FR-3.requirement, AC-1, system_architecture.data_flow, risks[0].risk) all now describe the silent-skip-on-NULL-metadata hazard, not a thrown error. The pass-3 error claim survives only as an explicitly-retracted clause in FR-3.description's chronological history, and the fabricated result-recorder.js:122 citation is explicitly labelled fabricated in the same field. INDEPENDENTLY RE-VERIFIED LIVE (CTRL-2): a guard with no TG_OP branch does NOT error on INSERT; it returns metadata NULL, i.e. silently skips.",
      'BLOCKER-2 (pass4, HIGH)':
        "CLOSED. Sub-key-scoped guard adopted. VERIFIED LIVE: TS-2j passes (unrelated-subkey UPDATE => trigger body ran +0 times, tampered control_pack_evaluated=false preserved). Counterfactual CTRL-3: the whole-blob guard on the identical fixture ran the body +1 time and flipped the value back to true, confirming pass-4's BLOCKER-2 was real and that sub-key scoping is the fix. AC-8 is now satisfiable as written.",
      'BLOCKER-3 (pass4, MEDIUM-HIGH)':
        'CLOSED. Full-field sweep of all 44 populated PRD fields: 0 fields retain inequality-only phrasing; 7 fields state the presence requirement, including system_architecture.components[0].responsibility and integration_operationalization.data_contracts[0].schema (the two that had drifted).',
      'BLOCKER-4 (pass4, MEDIUM)':
        'CLOSED. 0 fields match "mirrors allRequiredEvaluated exactly". FR-3.requirement now states the divergence explicitly ("DELIBERATELY MORE STRICT on a key\'s theoretical absence -- app fails open, trigger fails closed"); 7 fields carry the deliberate-divergence framing.',
      'Mediums (pass4)':
        'CLOSED. AC-7 -> TS-2h, AC-8 -> TS-2j, AC-9 -> TS-2g all now exist. Every TS id cited anywhere in the PRD resolves to a defined scenario (17 defined, 17 cited, 0 dangling) -- risks[0].mitigation\'s TS-1/TS-2/TS-2b/TS-2d/TS-2f/TS-2g/TS-2h all real. Single-required-key-absent now covered by TS-2g and verified live.'
    },
    live_verification: {
      pg_version: 'PostgreSQL 17.4 on aarch64-unknown-linux-gnu',
      isolation: 'BEGIN / TEMP TABLE ... ON COMMIT DROP / ROLLBACK -- no real table touched, nothing committed',
      checks_passed: '16/16',
      scenario_results: {
        'TS-1': 'PASS all 4 evaluated => true',
        'TS-2': 'PASS live row 84d310e1 shape (3 of 4 not_attempted) => false',
        'TS-2b': 'PASS clean pass w/ control_pack_failures = jsonb null => true',
        'TS-2c': 'PASS UPDATE completing controls flips false -> true',
        'TS-2d': 'PASS metadata lacks control_pack_status entirely => false, no error',
        'TS-2f': 'PASS 1 waived + 3 evaluated => true (equality-vs-evaluated impl would give false)',
        'TS-2g': 'PASS 1 of 4 required keys absent => false',
        'TS-2h': "PASS INSERT with metadata NULL => body ran (TG_OP='INSERT' branch), derived false, not skipped",
        'TS-2i': 'PASS INSERT path succeeds with no error and derives true',
        'TS-2j': 'PASS unrelated-subkey UPDATE => body runs +0, value unchanged'
      },
      counterfactual_controls: {
        'CTRL-1':
          'An inequality-ONLY predicate returns TRUE on the TS-2g fixture where the tightened presence-plus-inequality predicate returns FALSE => the presence requirement is load-bearing, not decorative.',
        'CTRL-2':
          'A guard with no TG_OP branch, on an INSERT with metadata NULL: NO error raised, row written with metadata still NULL => confirms both (a) the silent-skip gap the TG_OP branch closes and (b) that pass-3\'s "record old is not assigned yet" claim was false.',
        'CTRL-3':
          'A whole-blob guard on the identical TS-2j fixture: body ran +1 and control_pack_evaluated flipped back to true => confirms pass-4 BLOCKER-2 was real and sub-key scoping resolves it.'
      },
      extra_edge_cases: {
        'EXTRA-1': 'byte-identical UPDATE short-circuits (body runs +0)',
        'EXTRA-2': "control_pack_status as a scalar string => false, no error (jsonb_typeof guard)",
        'EXTRA-3': 'control_pack_status = jsonb null literal => false, no error'
      },
      live_schema_facts: {
        'uat_test_runs.metadata': "jsonb, is_nullable=YES, column_default='{}'::jsonb",
        'uat_test_runs triggers': '0 non-internal triggers today -- confirms FR-3.description\'s "ZERO existing triggers" claim',
        'uat_test_runs rows': '26 total; 24 with control_pack_evaluated=false, 0 true, 2 legacy rows with neither control_pack_status nor control_pack_evaluated',
        'status value shapes in live data': "only 'not_attempted' and 'evaluated' -- no waiver has ever been written, consistent with the PRD"
      }
    },
    findings_non_blocking: [
      {
        id: 'F-1',
        severity: 'MEDIUM',
        area: 'functional_requirements[2].description (+ content mirror)',
        finding:
          "Residual factual error, confined to narrative about a REJECTED design. FR-3.description states that under a bare whole-blob guard, an INSERT 'with metadata left NULL (either explicit NULL or the column omitted, relying on its default) silently SKIPS the body'. The 'column omitted' half is FALSE against the real schema: uat_test_runs.metadata has DEFAULT '{}'::jsonb, so omitting the column yields '{}', and NULL IS DISTINCT FROM '{}' is TRUE -- the body RUNS. Measured live on a TEMP table mirroring the real default: bare guard + omitted column => BODY RAN; bare guard + explicit NULL => SKIPPED. Pass 4's measurement was taken on a TEMP table with NO default and does not generalise to the real table.",
        why_non_blocking:
          "No operative section inherits the error: risks[0].risk and system_architecture.data_flow both say 'whenever an INSERT leaves metadata NULL at insert time' / 'whenever NEW.metadata is NULL at insert time', which is precise and correct. TS-2h remains satisfiable for BOTH sub-cases under the ADOPTED guard (verified live: TG_OP+sub-key guard runs the body for omitted-column AND explicit-NULL).",
        recommendation:
          "Drop or qualify the 'or the column omitted, relying on its default' parenthetical in FR-3.description. This is the same species of error (fixture that did not mirror the real schema, generalised to the real table) that produced 4 prior FAILs."
      },
      {
        id: 'F-2',
        severity: 'LOW',
        area: 'functional_requirements[2].acceptance_criteria[4] (AC-5)',
        finding:
          "AC-5 says 'the 23 existing evaluated=false rows are already correct under the corrected predicate'. Measured now: 24 rows have control_pack_evaluated=false and 0 have true. Two further legacy rows have NEITHER control_pack_status NOR control_pack_evaluated: bda551a1-061e-48b7-8bc9-c07432a47df1 (2026-02-20, pre-dates the control pack) and 8e54bfc7-edc9-4954-ade0-50729116ab2d (2026-08-30, an abandoned run). Under the adopted guard those 2 rows will never gain the key, since an UPDATE not touching control_pack_status short-circuits.",
        why_non_blocking:
          "Functionally safe: the sole named consumer, lib/eva/uat-robustness-gate.js:141, reads `if (!run.metadata?.control_pack_evaluated)` -- a falsy check, so absent is equivalent to false. The table is live (~6/day), so any fixed row count in an AC drifts by construction; 23 was accurate when first measured.",
        recommendation:
          "Either drop the hard count from AC-5 or add one clause noting the 2 legacy rows remain key-less by design and that the consumer's falsy check makes absent equivalent to false."
      },
      {
        id: 'F-3',
        severity: 'LOW',
        area: 'functional_requirements[2].description (readability, not correctness)',
        finding:
          "FR-3.description is ~7,400 characters of chronological correction history and contains two SUPERSEDED normative prescriptions in imperative voice -- notably \"The guard must be `IF TG_OP = 'INSERT' OR OLD.metadata IS DISTINCT FROM NEW.metadata THEN`\" (whole-blob) -- which are only retracted further down the same paragraph. A reader who stops mid-field extracts the wrong guard.",
        why_non_blocking:
          'AC-1 is the gating artifact and is unambiguous, and system_architecture.data_flow + risks[0].mitigation both carry only the final sub-key-scoped guard. The whole-blob string appears in exactly 2 fields (FR-3.description and its content mirror), never in an AC.',
        recommendation:
          'Move the pass-1..pass-4 history into metadata and leave FR-3.description with the final design only.'
      },
      {
        id: 'F-4',
        severity: 'INFO',
        area: 'metadata.grounding_validation',
        finding:
          'All 11 requirements (FR-1..FR-6, TR-1..TR-5) are flagged at 2-34% grounding confidence (validated 2026-09-13T02:25:59Z).',
        why_non_blocking:
          'This reads as a saturated lexical-overlap heuristic rather than genuine ungroundedness -- the requirements were rewritten into dense technical prose across 4 correction rounds, collapsing n-gram overlap with the original SD text. The requirements are in fact grounded in live measurements, which this pass re-verified by execution. Flagged so a downstream gate does not mistake it for a real signal.'
      }
    ],
    document_consistency_sweep: {
      method: 'Flattened all 44 populated PRD fields (including JSON-encoded string fields and the rendered content mirror) to path/string pairs and probed with 9 regexes.',
      'whole-blob guard prescribed': '2 fields -- FR-3.description historical narrative + content mirror only; 0 ACs',
      'sub-key guard prescribed': '5 fields -- FR-3.description, AC-1, data_flow, risks[0].mitigation, content mirror',
      'inequality-only phrasing (no presence requirement)': '0 fields',
      'claims bare guard errors on INSERT': '2 fields -- retracted-history clause + content mirror only',
      'claims mirrors allRequiredEvaluated exactly': '0 fields',
      'TS ids defined vs cited': '17 defined, 17 cited, 0 cited-but-undefined',
      'content mirror sync': 'IN SYNC -- all 17 TS present, FR-3 text byte-matches the JSON field'
    }
  }
};

results.detailed_analysis = [
  'TESTING pass 5 -- adversarial re-verification of PRD-SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 after 4 consecutive FAILs.',
  '',
  'VERDICT: PASS (confidence 92).',
  '',
  'All 4 pass-4 blockers and all pass-4 mediums are closed. The corrected trigger design was verified by EXECUTION, not by reading: 16/16 checks passed against live Postgres 17.4 in an always-ROLLBACK transaction on TEMP tables. Critically, each corrective was proved load-bearing by a counterfactual control: an inequality-only predicate disagrees with the tightened one on the TS-2g fixture (CTRL-1); a guard without the TG_OP branch silently skips on a NULL-metadata INSERT without erroring (CTRL-2, which also re-confirms pass-3\'s error claim was false); and a whole-blob guard recomputes on the exact TS-2j fixture where the sub-key guard does not (CTRL-3, confirming pass-4 BLOCKER-2 was real).',
  '',
  'No acceptance criterion is unsatisfiable, no cited test scenario is missing, and the rendered content mirror is in sync with the JSON fields.',
  '',
  'Four non-blocking findings remain, the most notable being F-1: FR-3.description still claims a bare whole-blob guard silently skips when the metadata column is "omitted, relying on its default". That is false against the real schema (metadata DEFAULTs to \'{}\'::jsonb, so NULL IS DISTINCT FROM \'{}\' is TRUE and the body runs). It is confined to narrative about a design that was rejected -- every operative section states the hazard precisely as "metadata is NULL at insert time" -- so it cannot mislead EXEC into a wrong implementation. It is worth correcting because it is the same species of error (a fixture that did not mirror the real schema, generalised to the real table) that produced the 4 prior FAILs.'
].join('\n');

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  supabase: sb
});
console.log('repo resolution:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .insert({
    sd_id: SD_ID,
    sub_agent_code: 'TESTING',
    sub_agent_name: 'QA Engineering Director',
    phase: 'PLAN',
    executed_from_cwd: process.cwd(),
    verdict: results.verdict,
    confidence: results.confidence,
    critical_issues: results.critical_issues,
    detailed_analysis: results.detailed_analysis,
    metadata: results.metadata
  })
  .select('id, verdict, confidence, created_at')
  .single();

if (error) { console.error('INSERT FAILED:', error); process.exit(1); }
console.log('Evidence row written:', data.id);
console.log('  verdict:', data.verdict, '| confidence:', data.confidence, '| created_at:', data.created_at);
console.log('  metadata.repo_path:', results.metadata.repo_path);
console.log('  metadata.executed_from_cwd:', results.metadata.executed_from_cwd);
