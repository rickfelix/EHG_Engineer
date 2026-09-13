import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');
const ID='66da30b8-91df-41f0-b680-2002c0874265';
const ev = {
  post_implementation_verification: {
    phase:'PLAN-TO-LEAD / VERIFY', repo:'EHG_Engineer', branch:'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D', pr:8913,
    verified_by:'validation-agent (Opus 5), independent live re-check 2026-09-13T20:0xZ',
    FR1:{verdict:'PASS', table_exists:true, constraint_values:15, stage15_gates_exit_observe:['design fidelity reviewed'], metrics_preserved:true, stage_timeout_ms:600000, note:'3rd migration (20260828_venture_experience_review_runs.sql) is a pre-existing unapplied file applied live by this SD, not authored on this branch'},
    FR2:{verdict:'PASS', run_row:'ed63effe-2f20-4157-b6a1-40044b2271e5', venture_id:'50763b6a-1fad-4e1e-b2fc-296a1d66ebf9', run_mode:'out_of_band_annex', note:'summary counts 3 experience findings; live venture_quality_findings has 4 for AltifyAI (1 likely from a sibling SD)'},
    FR3:{verdict:'PASS', independently_rerun:true, status:'no_screens', honest:true},
    FR4:{verdict:'PASS', gate_verifiers_line:814, bind_criterion_line:36},
    FR5:{verdict:'PASS', gauge_rerun:{status:'alarmed', uncoveredCount:1, qualifyingCount:2}},
    unit_tests:{files:4, passed:85, failed:0},
    regression_findings:[
      {severity:'medium', id:'REG-1', summary:"DB CHECK (15 values) and lib/eva/quality-findings/finding-shape.js FINDING_CATEGORIES (15 values) are DIFFERENT sets. DB omits feedback_widget_present + error_capture_wired (actively emitted by lib/eva/quality-findings/vision-detectors.js); JS omits performance + responsive (5 and 4 live rows respectively). Two-way producer/reader split -- root-cause class B. Inherited from sibling -A's pre-state, NOT introduced by -D, but -D's migration is titled 'the UNION of every category two concurrent sibling SDs need' and is not the true union."},
      {severity:'low', id:'REG-2', summary:'database/schema-reference-snapshot.json line 18276 still records the ORIGINAL 10-value finding_category list. Stale reader, predates both -A and -D.'},
      {severity:'info', id:'REG-3', summary:"sibling -A's migration file (20260913_venture_quality_findings_capa_baseline_categories.sql) is absent from this worktree/main; performance+responsive reached the live constraint from an unmerged branch. -D's union migration reproduces them on merge, so self-healing."}
    ],
    no_stale_old_stage15_shape_references_found:true
  }
};
const {rows} = await c.query(`UPDATE sub_agent_execution_results SET metadata = COALESCE(metadata,'{}'::jsonb) || $1::jsonb WHERE id=$2 RETURNING id, verdict, confidence, phase`, [JSON.stringify(ev), ID]);
console.log(JSON.stringify(rows));
await c.end();
