// SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001 LEAD-prospective validation evidence
// Session: 2f6fc904-7ef4-4260-b4e2-2f5017b223a9
// Run from worktree: node scripts/one-off/_validation-agent-lead-prospective-sd-fdbk-eva-vision-001.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SD_ID = 'be5d6fbf-571a-47a6-86e6-acc3dba9e044';
const SESSION_ID = '2f6fc904-7ef4-4260-b4e2-2f5017b223a9';

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'VALIDATION',
  sub_agent_name: 'Principal Systems Analyst',
  verdict: 'PASS',
  confidence: 88,
  phase: 'LEAD',
  validation_mode: 'prospective',
  source: 'lead_prospective',
  summary: [
    'LEAD-prospective validation PASS for SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001 (Option A NARROWED).',
    'Read-side wiring of quality_checked/quality_issues into scripts/eva/vision-scorer.js + warn-once helper closes proven scripts/eva consumer gap.',
    'lib/eva already consumes qc correctly (no duplicate).',
    'Q8 deletion audit clean: Option B/C trigger work cut, ZERO vision_quality_check_* audit events all-time supports deferral.',
  ].join(' '),
  critical_issues: [],
  warnings: [
    'Scope-deviation: total delta is 58 src + 99 test = 157 LOC vs scope-locked ~80 LOC budget. Material implementation logic is ~30 src LOC; overage dominated by JSDoc, comment headers, and a non-breaking return-shape extension on loadVisionDimensions/loadArchDimensions (qualityChecked + qualityIssues). Test overage covers 2 regression-pin tests + 6 helper behavior tests for FR-1..FR-4. Acceptable as Tier-2 (≤150 src ceiling) given material logic is ≤30 LOC; PLAN should confirm budget interpretation in PRD acceptance criteria.',
    'TR-4 deviation: loadVisionDimensions and loadArchDimensions return objects extended from {id, dimensions} to {id, dimensions, qualityChecked, qualityIssues}. Additive, non-breaking — only caller (scoreSD) consumes the new fields. Existing test fakeSupabase rows do not need to add the new columns (?? null fallback). PLAN should pin this contract in PRD acceptance criteria so a future refactor does not silently revert.',
    'Premise verified clean (Q8): zero vision_quality_check_* audit_log events all-time + lib/eva already consumes qc correctly + 52 production qc=false rows including 5 chairman_approved=true (bypass-lineage from SD-VISION-QUALITY-GATE-BYPASS-ORCH-001). This means trigger reconciliation (Option B) and trigger drops (Option C) remain THEORETICAL until witnessed. EXEC must NOT expand scope back into B/C without a fresh witnessed-incident SD.',
  ],
  recommendations: [
    'PLAN PRD must enumerate FR-1..FR-4 mapping to scoped LOC budget so EXEC has a measurable acceptance criterion (e.g. material-logic LOC ≤40 source).',
    'PLAN must pin the loadVisionDimensions/loadArchDimensions return contract (id + dimensions + qualityChecked + qualityIssues) as an explicit AC; static-guard tests on SELECT projection are good but the JS return shape needs equal protection against silent revert.',
    'PLAN should map FR-3/FR-4 (warn helper + scoreSD call site) to the existing _emitQualityCheckWarningIfNeeded helper export and pin its export signature in regression-pin test.',
    'EXEC must not expand into trigger reconciliation (Option B) or trigger drops (Option C) — those remain deferred per Q8 audit. Any drift requires a fresh witnessed-incident SD.',
    'PLAN must verify scoreSD() call-site only emits ONE warn per invocation (FR-3 dedup) — current helper returns boolean; confirm scoreSD does not call helper twice.',
    'No DB migration required — all 52 qc=false rows are observed read-side, no production data modification in scope.',
  ],
  detailed_analysis: {
    gate_1_lead_pre_approval: {
      duplicate_check:
        'PASS — lib/eva/stage-17-doc-generation.js + lib/eva/vision-repair-loop.js + lib/eva/archplan-upsert.js already consume quality_checked. scripts/eva/vision-scorer.js is the proven non-consumer gap. NO duplicate work.',
      infrastructure_check:
        'PASS — Read-side SELECT extension + console.warn. Zero new tables, zero DDL, zero new migrations. Reuses existing Supabase client + console logger.',
      backlog_validation:
        'PASS — SD scope-locked to Option A NARROWED with FR-1..FR-4 enumerated in LEAD scope.',
      claims_verification:
        'PASS — Q8 deletion audit confirmed clean. Premise that B/C are theoretical is supported by zero vision_quality_check_* audit_log events all-time.',
    },
    eight_question_strategic_gate: {
      Q1_real_problem:
        'PASS — database-agent surfaces qc=false warnings, scripts/eva/ scorer pipeline structurally non-consumer.',
      Q2_solution_feasible:
        'PASS — read-side wiring + console.warn, no DDL, no enforcement change. Implementation already drafted.',
      Q3_existing_tools:
        'PASS — Reuses Supabase client, console.warn, existing scoreSD() call site.',
      Q4_resources: 'PASS — Tier-2 infra PR, single canonical worktree.',
      Q5_risk: 'PASS — Additive read-side change. Single-commit revertable.',
      Q6_value:
        'PASS — Closes observability gap. Enables future trigger-reconciliation SD if witnessed.',
      Q7_simpler_alternative: 'PASS — Could log nothing, but that defeats SD intent.',
      Q8_deletion_audit:
        'PASS — Option B and Option C correctly cut from scope; zero audit events all-time supports deferral until witnessed.',
    },
    scope_lock_assertion: {
      in_scope_confirmed:
        'FR-1: loadVisionDimensions SELECT adds quality_checked + quality_issues. FR-2: loadArchDimensions symmetric. FR-3: _emitQualityCheckWarningIfNeeded helper warns once when either qc=false. FR-4: dedup + null/undefined unactionable.',
      out_of_scope_confirmed:
        'NO trigger reconciliation (Option B). NO trigger drops (Option C). NO production data migration on 52 qc=false rows. NO lib/eva consumer changes (already correct). NO audit_log INSERT. NO event-bus emit.',
    },
    uncommitted_source_review: {
      files: ['scripts/eva/vision-scorer.js', 'scripts/eva/vision-scorer.test.js'],
      src_loc_delta: 58,
      test_loc_delta: 99,
      material_logic_src_loc: 30,
      return_shape_extension:
        'Additive: id + dimensions + qualityChecked + qualityIssues. ?? null fallback handles legacy fakeSupabase rows.',
      helper_export:
        '_emitQualityCheckWarningIfNeeded(sdKey, visionQc, archQc, logger=console) → boolean',
      warn_format:
        '[VisionScorer][QC-WARN] sd_key=<sd> vision_qc=<bool> arch_qc=<bool>',
      test_coverage:
        'FR-1/FR-2 static-guard regression-pin (SELECT projection). FR-3/FR-4 helper behavior (6 cases incl true/true no-warn, false/true warn, true/false warn, false/false dedup, null/undefined unactionable, empty sdKey fallback).',
    },
    session_provenance: {
      session_id_passed_in: SESSION_ID,
      prior_evidence_check:
        'ZERO existing rows in sub_agent_execution_results for sd_id=be5d6fbf-571a-47a6-86e6-acc3dba9e044. Compacted-session UUIDs (b74ae6e3, d8f2c253, 4daeaa87) NOT present in DB. Fresh row required.',
      canonical_writer:
        'direct supabase.insert into sub_agent_execution_results (no canonical insert-sub-agent-evidence script exists in this repo).',
    },
  },
  metadata: {
    sd_key: 'SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001',
    sd_type: 'infrastructure',
    sd_status: 'draft',
    sd_current_phase: 'LEAD',
    session_id: SESSION_ID,
    validation_phase: 'LEAD',
    validation_kind: 'prospective',
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    scope_option: 'A_NARROWED',
    scope_locked_in_scope: [
      'FR-1: vision SELECT extends qc',
      'FR-2: arch SELECT extends qc',
      'FR-3: _emitQualityCheckWarningIfNeeded helper',
      'FR-4: dedup + warn-once',
    ],
    scope_locked_out_of_scope: [
      'Option B (trigger reconciliation)',
      'Option C (trigger drops)',
      'production data migration on 52 qc=false rows',
      'lib/eva consumer changes',
    ],
    uncommitted_files: [
      'scripts/eva/vision-scorer.js',
      'scripts/eva/vision-scorer.test.js',
    ],
    src_loc_delta: 58,
    test_loc_delta: 99,
    total_loc_delta: 157,
    tier: 2,
    duplicate_check_result: 'PASS_NO_DUPLICATES',
    duplicate_check_evidence:
      'lib/eva/stage-17-doc-generation.js + lib/eva/vision-repair-loop.js + lib/eva/archplan-upsert.js already consume qc; scripts/eva/vision-scorer.js is proven non-consumer gap',
    q8_deletion_audit_result: 'CLEAN',
    q8_deletion_audit_evidence:
      'ZERO vision_quality_check_* events in audit_log all-time; Option B and C correctly deferred',
    production_data_evidence:
      '52 qc=false rows including 5 chairman_approved=true (bypass-lineage from SD-VISION-QUALITY-GATE-BYPASS-ORCH-001)',
  },
  justification:
    'LEAD-prospective validation PASS with 3 advisory warnings on (1) total LOC delta vs scope-locked budget — material logic ≤30 src LOC, overage in JSDoc/return-shape, (2) loadVisionDimensions/loadArchDimensions return-shape extension contract pin recommended, (3) Option B/C scope-creep prevention reminder. Premise of SD is supported by direct evidence (lib/eva consumes qc; scripts/eva does not). Solution is feasible, additive, single-commit revertable, no DDL/migration. PLAN may proceed.',
  execution_time: 0,
};

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .insert(row)
  .select(
    'id, sd_id, sub_agent_code, verdict, confidence, phase, validation_mode, source, created_at'
  )
  .single();

if (error) {
  console.error('INSERT FAILED:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('INSERT OK:');
console.log(JSON.stringify(data, null, 2));
