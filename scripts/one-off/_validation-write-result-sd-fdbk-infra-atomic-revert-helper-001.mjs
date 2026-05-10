#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent verdict for SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001 LEAD phase
 *
 * Generated from validation-agent LEAD-phase prospective validation run on 2026-05-10.
 * Closes feedback 0a06a05a; closes PAT-GHOST-COMPLETION-PARTIAL-REVERT-001.
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

const SD_ID = '5de33889-820f-4758-a96f-363f17908e97';

const findings = [
  { id: 'F1-scope-alignment', severity: 'INFO', summary: '5-FR scope aligns with feedback claim and empirical witness reality. lib/sd/ contains only index.js + type-classifier.js; no existing revert.js. scripts/modules/sd-next/status-helpers.js has phase-aware logic but NO STATUS_INCONSISTENT badge. No CHECK or BEFORE UPDATE trigger on strategic_directives_v2 enforces handoff-before-completion invariant. No active scripts/one-off/audit-ghost-completed-sds.mjs. Witness SD b737c27f confirmed: status=completed, current_phase=COMPLETED, progress=0, metadata.reverted_at=2026-04-28; 12 handoffs (2 PLAN-TO-LEAD accepted, 2 LEAD-FINAL-APPROVAL rejected).' },
  { id: 'F2-CRITICAL-fr2-trigger-predicate-naming', severity: 'WARNING', summary: 'FR-2 trigger predicate MUST use handoff_type column (canonical hyphenated values), NOT from_phase/to_phase pair. Empirical: 17 distinct phase-pairs (polymorphic) but handoff_type has 6 canonical values: LEAD-TO-PLAN (2876), PLAN-TO-EXEC (2771), PLAN-TO-LEAD (2624), EXEC-TO-PLAN (1482), LEAD-FINAL-APPROVAL (220), BYPASS-COMPLETION (23). PRD must specify handoff_type filter literal.' },
  { id: 'F3-CRITICAL-fr2-bypass-completion-whitelist', severity: 'WARNING', summary: 'FR-2 trigger MUST whitelist accepted BYPASS-COMPLETION handoff_type (23 accepted records exist, e.g., SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001, SD-LEO-INFRA-ORCHESTRATOR-GATE-FIXES-ORCH-001-A through D). These ARE the canonical handoff-bypass path — bypass_reason metadata is NULL because the bypass is encoded in handoff_type itself. PRD FR-2 predicate: NOT EXISTS (h WHERE h.sd_id=NEW.id AND h.status=accepted AND h.handoff_type IN (LEAD-FINAL-APPROVAL, BYPASS-COMPLETION)). This is R6 phantom-non-compliance directly relevant.' },
  { id: 'F4-fr2-backward-compat', severity: 'INFO', summary: 'FR-2 BEFORE UPDATE trigger backward-compatible — existing 2434 completed SDs will not re-trigger (no UPDATE event on existing rows). Trigger must check NEW.status != OLD.status condition to avoid blocking metadata-only edits of already-completed rows.' },
  { id: 'F5-fr1-idempotency-state-machine', severity: 'INFO', summary: 'FR-1 idempotency implementable via SELECT-then-conditional-UPDATE with metadata.reverted_at preservation (first-write-wins CAS-style filter). PRD must specify the state machine: (1) SELECT current; (2) if reverted_at already set AND status != completed → return unchanged; (3) if status=completed AND not reverted → UPDATE with reverted_at=now(); (4) else no-op or warn.' },
  { id: 'F6-fr3-no-overlap', severity: 'INFO', summary: 'FR-3 status-helpers.js extension does NOT overlap existing logic. Confirmed file (6496 bytes) has STUCK, CADENCE-WAIT, DRAFT, READY, BLOCKED, EXEC N%, VERIFY, CLOSE-OUT, PLANNING, DEFERRED — no STATUS_INCONSISTENT. Cleanest insertion: follow getCadenceBadge pattern at end of file. Detection: (status=completed AND (metadata.reverted_at IS NOT NULL OR progress=0 OR current_phase != COMPLETED)).' },
  { id: 'F7-fr4-population', severity: 'INFO', summary: 'FR-4 audit-ghost-completed-sds.mjs currently finds 1 SD (the witness). Preventive value dominates retrospective. Default --execute=false safety correct. Predicate should focus on (reverted_at IS NOT NULL) by default with optional broader filter.' },
  { id: 'F8-fr5-test-coverage', severity: 'INFO', summary: 'FR-5 tests should include: (1) revertSD shape; (2) idempotency (2x calls produce identical reverted_at); (3) trigger violation (UPDATE status=completed w/o handoff → raise); (4) trigger BYPASS-COMPLETION whitelist positive; (5) STATUS_INCONSISTENT badge unit test; (6) static-pin regex on migration SQL for handoff_type whitelist literal.' },
  { id: 'F9-completion-survey', severity: 'INFO', summary: 'Ghost-completion under LEAD-FINAL-APPROVAL-only predicate: 2434 SDs (would block legitimate completions if used naively). Under (LEAD-FINAL-APPROVAL OR PLAN-TO-LEAD): 264. Most are orchestrator/test/legacy SDs. Recent PR-3683 sibling SDs have canonical (PLAN-TO-LEAD accepted + LEAD-FINAL-APPROVAL accepted) pattern — backward-compat test cases.' },
  { id: 'F10-tier-classification', severity: 'INFO', summary: 'Tier-3 classification correct. Schema (BEFORE UPDATE trigger migration) AND feature keywords force Tier-3 per CLAUDE.md routing rules. Expected: ~180-280 src LOC, ~250-400 test LOC. Pattern matches predecessor SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001 (~380 src + ~860 test).' }
];

const recommendations = [
  'PRD FR-2 SQL: filter on handoff_type column (NOT from_phase/to_phase). Whitelist BOTH LEAD-FINAL-APPROVAL AND BYPASS-COMPLETION. Predicate: NOT EXISTS (h WHERE h.sd_id=NEW.id AND h.status=accepted AND h.handoff_type IN (LEAD-FINAL-APPROVAL, BYPASS-COMPLETION)).',
  'PRD FR-2 trigger fires only when NEW.status=completed AND (TG_OP=INSERT OR OLD.status IS DISTINCT FROM completed). Raises SD_COMPLETION_INVARIANT_VIOLATED with sd_key + handoff list in detail.',
  'PRD FR-1 idempotency: document SELECT-then-conditional-UPDATE state machine. Unit test asserts 2 consecutive revertSD calls produce IDENTICAL metadata.reverted_at timestamp (no overwrite).',
  'PRD FR-3 insertion: follow getCadenceBadge pattern at end of status-helpers.js. Color recommendation: red (matches STUCK). Advisory not gating. Surface partial-revert cases the trigger missed (defense-in-depth).',
  'PRD FR-4: default --execute=false (read-only); --filter flag for predicate selection; preserve metadata.reverted_at if already set (idempotent re-run); tight default predicate (reverted_at IS NOT NULL).',
  'PRD FR-5: add static-pin regex test on migration SQL file enforcing LEAD-FINAL-APPROVAL,BYPASS-COMPLETION whitelist literal in trigger body. Prevents future drift back to too-narrow predicate.',
  'PLAN must explicitly handle MODIFIED_WORKFLOW_SD_TYPES from scripts/lib/handoff-preflight.js: infrastructure, documentation, orchestrator, parent_orchestrator. Consider sd_type/is_parent whitelist in trigger predicate so orchestrator SDs that legitimately skip parts of the handoff chain are not blocked.',
  'After EXEC: run FR-4 dry-run against last 30 days of completed SDs to validate no spurious-fire (<5 false positives expected). If higher, broaden whitelist before merge.',
  'After SD ships: separately close out the partial-revert witness SD (SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A b737c27f) — either re-complete with BYPASS-COMPLETION handoff (if legitimate) OR roll status fully back to in_progress. Witness should not remain as a live test fixture.'
];

const warnings = [
  'FR-2 trigger predicate as currently scoped uses generic phrase accepted LEAD-FINAL-APPROVAL handoff — PLAN must concretize to handoff_type column filter with BYPASS-COMPLETION whitelist per F2/F3.',
  'FR-2 must include sd_type/is_parent whitelist for orchestrator/parent_orchestrator/documentation/infrastructure types that legitimately skip parts of the handoff chain (handoff-preflight.js MODIFIED_WORKFLOW_SD_TYPES is canonical list).',
  'FR-4 audit script will currently find only 1 SD — correct for preventive design but means LEAD/PLAN expectations of cleaning up a backlog would be miscalibrated. Value is preventive, not retrospective.',
  'Witness SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A (b737c27f) is also a test fixture — must not be modified by EXEC implementation until FR-5 trigger-violation test uses a fresh fixture row OR separate read-only assertion.'
];

const fullRaw = {
  verdict: 'PASS',
  confidence: 88,
  findings,
  recommendations,
  warnings,
  scope_assessment: '5-FR scope correctly targeted, empirically grounded, proportionate to witnessed gap. No scope creep. No under-scoping. Two predicate-design refinements (F2, F3) are LEAD-PLAN handoff inputs, not scope changes.',
  empirical_basis: {
    witness_sd_id: 'b737c27f-3e83-4887-999e-3c1ae158faf4',
    witness_sd_key: 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A',
    witness_state: 'status=completed, current_phase=COMPLETED, progress=0, metadata.reverted_at=2026-04-28; 12 handoffs (2 PLAN-TO-LEAD accepted, 2 LEAD-FINAL-APPROVAL rejected)',
    existing_revert_helper: 'NONE in lib/sd/',
    existing_trigger_or_check: 'NONE on strategic_directives_v2',
    existing_status_inconsistent_badge: 'NONE in status-helpers.js',
    existing_audit_script: 'NONE active (archive/one-time/force-complete-sd-final.js different purpose)',
    handoff_type_canonical_values_accepted: { 'LEAD-TO-PLAN': 2876, 'PLAN-TO-EXEC': 2771, 'PLAN-TO-LEAD': 2624, 'EXEC-TO-PLAN': 1482, 'LEAD-FINAL-APPROVAL': 220, 'BYPASS-COMPLETION': 23 },
    bypass_completion_handoff_exists: true,
    bypass_completion_count_accepted: 23,
    current_partial_revert_population: 1,
    target_pattern: 'PAT-GHOST-COMPLETION-PARTIAL-REVERT-001 (20th-witness candidate via PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001)'
  }
};

const SQL = 'INSERT INTO sub_agent_execution_results (sd_id, sub_agent_code, sub_agent_name, verdict, confidence, warnings, recommendations, raw_output, summary, phase, source, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, created_at';

async function main() {
  const client = await createDatabaseClient('engineer');
  try {
    const params = [
      SD_ID,
      'VALIDATION',
      'Principal Systems Analyst (validation-agent)',
      'PASS',
      88,
      JSON.stringify(warnings),
      JSON.stringify(recommendations),
      JSON.stringify(fullRaw),
      'LEAD prospective validation PASS conf=88. Scope (5 FRs) empirically grounded — no existing revert helper, trigger, audit script, or STATUS_INCONSISTENT badge. Two PLAN-phase predicate-design refinements required (F2: use handoff_type column not phase pairs; F3: whitelist BYPASS-COMPLETION handoffs alongside LEAD-FINAL-APPROVAL). Tier-3 classification correct.',
      'LEAD',
      'validation-agent',
      JSON.stringify({ run_ts: new Date().toISOString(), feedback_id: '0a06a05a-3c52-41ba-9c5e-d62582d5395a', pattern: 'PAT-GHOST-COMPLETION-PARTIAL-REVERT-001', tier: 3 })
    ];
    const r = await client.query(SQL, params);
    console.log('VERDICT WRITTEN:');
    console.log('  ID:', r.rows[0].id);
    console.log('  created_at:', r.rows[0].created_at);
    console.log('  verdict:', 'PASS @ 88 confidence');
    console.log('  findings:', findings.length);
    console.log('  recommendations:', recommendations.length);
    console.log('  warnings:', warnings.length);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
