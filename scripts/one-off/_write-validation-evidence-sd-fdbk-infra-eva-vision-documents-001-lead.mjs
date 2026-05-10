// VALIDATION evidence for SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001 / LEAD phase
import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer');

const findings = {
  q1_premise_validity: {
    verdict: 'PARTIAL_TRUE',
    triggers_found_total: 5,
    quality_setter_triggers: ['trg_auto_validate_vision_quality', 'trg_eva_vision_quality_check'],
    quality_consumer_trigger_NOT_in_SD: 'trg_enforce_vision_quality_advancement (RAISES EXCEPTION on transitions)',
    threshold_divergence_confirmed: { auto_validate: 5000, trg_eva: 500, ratio: '10x' },
    standard_keys_divergence_confirmed: {
      auto_validate_last_4: ['information_architecture', 'key_decision_points', 'integration_patterns', 'ui_ux_wireframes'],
      trg_eva_last_4: ['ui_ux_wireframes', 'technical_approach', 'success_metrics', 'competitive_landscape']
    },
    last_fired_wins_alphabetical: 'trg_eva_vision_quality_check (500-char) overwrites trg_auto_validate (5000-char)'
  },
  q4_zero_incidents_check: {
    verdict: 'ZERO',
    audit_log_vision_quality_events: 0,
    audit_log_database_agent_warning_events: 0
  },
  q7_existing_path_state: {
    verdict: 'ENFORCEMENT_LEAKY',
    consumers_in_lib_eva: [
      'lib/eva/vision-repair-loop.js (332-LOC purpose-built)',
      'lib/eva/stage-templates/analysis-steps/stage-17-doc-generation.js:155,250',
      'lib/eva/archplan-upsert.js:113',
      'lib/eva/vision-upsert.js:54'
    ],
    state_distribution: { qc_false: 66, qc_true: 179 },
    enforcement_violations: 5,
    matrix_active_qc_false: 52,
    bypass_lineage: 'SD-VISION-QUALITY-GATE-BYPASS-ORCH-001 + SD-MAN-FIX-FIX-ARCHIVED-VISION-001'
  },
  duplicate_overlap_check: {
    verdict: 'HEAVY_PRIOR_SURFACE',
    prior_sd_count: 15,
    high_collision_risk_sds: [
      'SD-LEO-INFRA-EVA-STAGE-WORKER-001',
      'SD-VISION-QUALITY-GATE-BYPASS-ORCH-001',
      'SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001',
      'SD-MAN-FIX-FIX-ARCHIVED-VISION-001'
    ]
  },
  scope_lock: {
    primary: 'OPTION_A_NARROWED',
    reasoning: 'lib/eva consumers exist; gap is scripts/eva/vision-scorer.js narrowly. Read+warn on qc/qc_issues, ~30 LOC, no migrations.'
  }
};

const summary = '[VALIDATION] LEAD pre-approval: SD premise PARTIALLY TRUE. Triggers + 10x threshold divergence (5000 vs 500 char) CONFIRMED. SD missed enforcement trigger trg_enforce_vision_quality_advancement. lib/eva consumers EXIST. 52 active rows with qc=false. 15 prior SDs touch surface. Scope-lock: Option A NARROWED (read-only wire of scripts/eva/vision-scorer.js, ~30 LOC, no migrations). REJECT B/C.';

const critical_issues = [
  { code: 'PREMISE_NARROWNESS', desc: 'SD claim "structurally incapable" only applies to scripts/eva/vision-scorer.js narrowly. lib/eva pipeline DOES consume quality_checked. PRD must scope explicitly.' },
  { code: 'PRODUCTION_STATE_RISK', desc: '52 currently-active rows have qc=false. Options B/C introduce migration risking break of bypass-intent rows from SD-VISION-QUALITY-GATE-BYPASS-ORCH-001.' }
];

const warnings = [
  { code: 'TRIGGER_ENUMERATION_INCOMPLETE', desc: 'SD lists 2 quality triggers, 5 exist + 3 quality functions. Missing trg_enforce_vision_quality_advancement is the actual consumer.' },
  { code: 'AUDIT_PATH_ZERO', desc: 'Q4 zero-incidents — no audit_log for vision_quality_check_* / database_agent_warning all-time. Warning-surface claim is theoretical.' },
  { code: 'PRIOR_SD_COLLISION', desc: '15 prior SDs touch surface; SD-LEO-INFRA-EVA-STAGE-WORKER-001 shipped lib/eva consumer wiring already.' }
];

const recommendations = [
  { code: 'SCOPE_LOCK_OPTION_A', desc: 'Lock to read-only wire of scripts/eva/vision-scorer.js. Add quality_checked + quality_issues to SELECT + warn (not block) on qc=false. ~30 LOC + tests. Tier 1 / no migrations.' },
  { code: 'DEFER_OPTION_B', desc: 'Drop one trigger requires migration on 52 production rows; current leakiness may be intentional. File separate SD post-Option-A if needed.' },
  { code: 'REQUIRE_DATABASE_SUBAGENT', desc: 'DATABASE pre-LEAD-TO-PLAN: confirm scorer SELECT does not interact with trigger-recalc paths.' },
  { code: 'REQUIRED_PRELEAD_SUBAGENTS', desc: 'Per type=infrastructure: RISK + GITHUB + REGRESSION + DATABASE before LEAD-TO-PLAN.' }
];

const sql = `
  INSERT INTO sub_agent_execution_results
    (sd_id, sub_agent_code, sub_agent_name, phase, verdict, confidence, summary, detailed_analysis, critical_issues, warnings, recommendations, raw_output, source, metadata)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb)
  RETURNING id, created_at
`;

try {
  const { rows } = await c.query(sql, [
    'be5d6fbf-571a-47a6-86e6-acc3dba9e044',
    'VALIDATION',
    'Principal Systems Analyst',
    'LEAD',
    'WARNING',
    88,
    summary,
    JSON.stringify(findings, null, 2),
    JSON.stringify(critical_issues),
    JSON.stringify(warnings),
    JSON.stringify(recommendations),
    JSON.stringify(findings),
    'agent-task-tool',
    JSON.stringify({
      claude_session_id: '706af506-1ffb-4b03-b871-efce2f4afd33',
      worktree: '.worktrees/SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001',
      validation_date: '2026-05-09',
      gate: 'LEAD_PRE_APPROVAL',
      mode: 'product',
      premise_corrections: [
        'SD listed 2 setter triggers; 5 exist incl. enforcement consumer trg_enforce_vision_quality_advancement',
        'lib/eva consumers DO exist — premise narrowness limited to scripts/eva/vision-scorer.js'
      ]
    })
  ]);
  console.log('INSERTED:', rows[0].id, 'at', rows[0].created_at);
  console.log('Verdict: WARN | Confidence: 88');
} catch (err) {
  console.error('FAIL:', err.message, err.code);
}
await c.end();
