// Writes RISK sub-agent evidence row for SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 LEAD phase.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const detailed_analysis = {
  domain_scores: {
    technical_complexity: 6,
    security_risk: 3,
    performance_risk: 4,
    integration_risk: 7,
    data_migration_risk: 5,
    ui_ux_risk: 1
  },
  overall_risk: 'MEDIUM-HIGH',
  reviewed_plan_risks: [
    { id: 'Risk-1', label: 'Cron fires while chairman still iterating', drafted: 'MEDIUM', assessed: 'MEDIUM', mitigation: 'SUFFICIENT_BUT_NARROW',
      finding: 'archplan-upsert.js L102-103 auto-sets status=active + chairman_approved=true. Means upsert acts as auto-approver. Trigger should be vision chairman_approved transition only, not arch-plan presence.' },
    { id: 'Risk-2', label: 'F3/F5 regression vs CRONGENIUS-M1 manual record', drafted: 'HIGH', assessed: 'HIGH', mitigation: 'NEEDS_CONCRETE_SNAPSHOT',
      finding: 'DB confirms SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001.target_application=CronGenius but L316+L427 hardcode EHG_Engineer. Production sample only matches because chairman manually overrode. Plan must JSON-snapshot the manual record at FR-1 start and assert equality.' },
    { id: 'Risk-3', label: 'Silent cron failures', drafted: 'MEDIUM', assessed: 'HIGH', mitigation: 'INCOMPLETE',
      finding: 'errors-table catches known failures, but watcher itself crashing/env-fail writes nothing. Need supervisor heartbeat (last-tick timestamp) + alert >5min stale.' },
    { id: 'Risk-4', label: 'Concurrent cron race', drafted: 'MEDIUM', assessed: 'MEDIUM', mitigation: 'SUFFICIENT',
      finding: 'PG advisory lock + onConflict + key-collision pre-check is appropriate defense-in-depth given parent_sd_id + A/B/C suffix collisions. Keep all three.' },
    { id: 'Risk-5', label: 'Vision lacks Architectural Plan section', drafted: 'LOW', assessed: 'LOW', mitigation: 'SUFFICIENT',
      finding: 'Symmetric refusal-gate pattern at lifecycle-sd-bridge.js:181-235 is correct precedent.' },
    { id: 'Risk-6', label: 'LLM cost', drafted: 'LOW', assessed: 'LOW', mitigation: 'SUFFICIENT', finding: 'Net-zero; extraction already happens.' }
  ],
  new_risks: [
    { id: 'Risk-7', label: 'First-watcher-run race against in-flight CronGenius cascade', severity: 'HIGH',
      finding: 'DB inspection: VISION-CRONGENIUS-API-L2-001 (active+approved 01:49Z) already has ARCH-CRONGENIUS-001 + SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 in_progress at PLAN_VERIFICATION with child -A at PLAN_PRD. Naive watcher idempotency could re-cascade if metadata vision_key match fails. onConflict upsert may CLOBBER chairman manual edits (cancellations on prior sprint orchestrator).',
      mitigation: 'Watcher must skip if any SD with metadata->>vision_key matches in non-draft state. Per-child loop L451-454 uses bare INSERT (errors on duplicate sd_key AFTER orchestrator upsert) — add per-child existence skip before INSERT.' },
    { id: 'Risk-8', label: 'Migration ordering chicken-egg: eva_cascade_errors', severity: 'MEDIUM',
      finding: 'FR-C creates table, FR-B writes to it. If cron timer activates before FR-C migration runs, watcher errors throw on missing table — recursive silent failure (cannot log to a table that does not exist).',
      mitigation: 'Boot self-check: SELECT 1 FROM eva_cascade_errors LIMIT 0; if missing, stderr-log and exit non-zero. Stage rollout: FR-C ships first in its own PR.' },
    { id: 'Risk-9', label: 'Refused-cascade errors accumulate silently if dashboard not wired', severity: 'MEDIUM',
      finding: 'Stuck vision at 60s cadence = 1440 error rows/day per stuck key. No alerting threshold defined. Errors-table-as-mitigation is paper-thin without observability.',
      mitigation: 'FR-C must add (a) UNIQUE (vision_key, error_class, DATE) constraint OR error_count rollup column (one row/cause/day/key); (b) dashboard SLA alert if row >24h unresolved.' },
    { id: 'Risk-10', label: 'Auto-emitted sd_type=implementation may not match chairman expectations', severity: 'LOW',
      finding: 'DB confirms SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001-B and -C have sd_type=implementation (L373 fallback). Passes db_valid_sd_types CHECK; not correctness issue. Auto-path likely emits more implementation-type than manual path (no chairman picking feature/research).',
      mitigation: 'Document in plan; F9 cleanup remains separate SD. No blocking action.' },
    { id: 'Risk-11', label: 'venture_id NULL on ArchPlan vs set on Vision causes drift', severity: 'MEDIUM',
      finding: 'DB inspection: ARCH-CRONGENIUS-001.venture_id=NULL while VISION-CRONGENIUS-API-L2-001.venture_id=6e23ad2b-2f6c-45b2-8ee9-e9e69a32bb66. archplan-upsert.js L105 only sets venture_id if passed. Auto-cascade must thread venture_id from vision into ArchPlan upsert + Orchestrator metadata or auto-path will deviate from manual-baseline.',
      mitigation: 'FR-B watcher must read venture_id from vision-doc, pass explicitly to upsertArchPlan + createOrchestrator. Add regression test.' },
    { id: 'Risk-12', label: 'archplan-upsert auto-sets chairman_approved=true — no ArchPlan-layer human checkpoint', severity: 'MEDIUM',
      finding: 'archplan-upsert.js L102-103 hardcodes status=active + chairman_approved=true. Under auto-cascade removes manual checkpoint chairman uses to inspect generated ArchPlan before orchestrator creation. Chain becomes: chairman approves vision → ANY upsertArchPlan call → instant orchestrator+children.',
      mitigation: 'Chairman decision required: (a) keep current behavior, document that vision-approval IS chairman ArchPlan-approval (single approval gates full cascade) OR (b) split into two transitions for auto path. Plan currently assumes (a) — make this explicit in plan rationale.' }
  ],
  proceed_to_plan: true,
  proceed_rationale: 'No risk is severe enough to block LEAD-TO-PLAN. Risk-7 and Risk-2 are HIGH but are PLAN-phase concerns (how to implement, not whether). PLAN should expand into explicit FR-level acceptance criteria + regression tests.'
};

const critical_issues = [
  'Risk-7 (HIGH): First-watcher-run race against in-flight CronGenius cascade (already at PLAN_VERIFICATION). Bare INSERT at create-orchestrator-from-plan.js:451-454 errors on duplicate child sd_key AFTER orchestrator upsert succeeds.',
  'Risk-2 (HIGH): F3 hardcode (L316+L427 target_application=EHG_Engineer) regression. Production CronGenius sample only matches manual baseline because chairman manually overrode post-creation — must JSON-snapshot before FR-1.',
  'Risk-3 (raised HIGH): Watcher process crashing writes nothing anywhere — silent failure mode not covered by eva_cascade_errors mitigation.'
];

const warnings = [
  'Risk-8: Migration ordering chicken-egg — FR-C (errors table) must ship before FR-B (watcher).',
  'Risk-9: eva_cascade_errors needs rate-limit constraint + dashboard SLA alert, else table becomes write-only firehose.',
  'Risk-11: venture_id threading from vision-doc through ArchPlan and Orchestrator metadata must be explicit; production CronGenius sample shows ArchPlan venture_id=NULL drift.',
  'Risk-12: archplan-upsert auto-sets chairman_approved=true — chairman must decide whether single vision-approval gates the full cascade or whether ArchPlan layer needs separate checkpoint.',
  'Risk-1 mitigation narrowing: trigger should be vision chairman_approved transition only, NOT arch-plan presence.'
];

const recommendations = [
  'PLAN must capture JSON snapshot of CRONGENIUS-M1 manual cascade BEFORE FR-1 starts (Risk-2/Risk-7 regression baseline).',
  'PLAN must add Risk-7 first-run guard: skip cascade when metadata->>vision_key match exists in any non-draft SD; add per-child existence skip before bare INSERT at create-orchestrator-from-plan.js:451-454.',
  'PLAN must split FR-C migration into its own PR shipped FIRST (Risk-8 chicken-egg).',
  'PLAN must thread venture_id from vision-doc through ArchPlan + Orchestrator paths with regression test (Risk-11).',
  'PLAN must document chairman_approved=true single-approval rationale OR split ArchPlan approval into separate transition (Risk-12 — chairman decision).',
  'PLAN must add watcher heartbeat + dashboard SLA + UNIQUE (vision_key, error_class, DATE) on eva_cascade_errors (Risk-3 + Risk-9).'
];

const conditions = [
  {
    id: 'COND-1',
    title: 'Snapshot CronGenius manual cascade as regression baseline',
    blocks_exec: true,
    risk_refs: ['Risk-2', 'Risk-7'],
    requirement: 'PLAN must capture JSON snapshot of SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 + ARCH-CRONGENIUS-001 manual records at FR-1 start. Encode equality assertion in regression test so the auto-cascade output matches the manual baseline byte-for-byte (allowing only id/timestamp differences).'
  },
  {
    id: 'COND-2',
    title: 'Watcher first-run + per-child INSERT guards',
    blocks_exec: true,
    risk_refs: ['Risk-7'],
    requirement: 'Watcher must skip cascade for any vision_key already present in metadata->>vision_key on a non-draft SD. Add per-child existence skip BEFORE the bare INSERT at create-orchestrator-from-plan.js:451-454 so duplicate sd_keys do not error AFTER the orchestrator upsert succeeds.'
  },
  {
    id: 'COND-3',
    title: 'Stage migrations: FR-C ships before FR-B',
    blocks_exec: true,
    risk_refs: ['Risk-8'],
    requirement: 'FR-C eva_cascade_errors migration ships in its own PR FIRST. FR-B watcher includes boot self-check (SELECT 1 FROM eva_cascade_errors LIMIT 0) that stderr-logs and exits non-zero on missing table — never starts polling loop without the errors-table available.'
  },
  {
    id: 'COND-4',
    title: 'Thread venture_id from vision through ArchPlan + Orchestrator',
    blocks_exec: true,
    risk_refs: ['Risk-11'],
    requirement: 'FR-B watcher reads venture_id from the approved vision-doc and passes it explicitly to upsertArchPlan({ ventureId }) and to orchestrator metadata. Regression test asserts venture_id propagation parity with CronGenius sample (which currently has venture_id=NULL on ArchPlan but set on Vision — a drift the auto-path must close).'
  },
  {
    id: 'COND-5',
    title: 'Chairman decision: ArchPlan approval coupling',
    blocks_exec: false,
    risk_refs: ['Risk-1', 'Risk-12'],
    requirement: 'Plan must document chairman choice between (a) single vision-approval gates full cascade including ArchPlan (current behavior; archplan-upsert.js auto-sets chairman_approved=true) OR (b) split ArchPlan approval into a separate transition for auto path. Surface to chairman before PLAN completion; record decision in PRD rationale.'
  },
  {
    id: 'COND-6',
    title: 'Watcher heartbeat + errors-table rate-limit + SLA alert',
    blocks_exec: true,
    risk_refs: ['Risk-3', 'Risk-9'],
    requirement: 'FR-C adds UNIQUE (vision_key, error_class, DATE) constraint OR error_count rollup column (one row per cause per day per key). FR-B watcher emits heartbeat (last-tick timestamp). Dashboard alerts if heartbeat >5min stale OR any errors-row >24h unresolved.'
  }
];

const justification = [
  'LEAD risk assessment for SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 (Option C cron-watcher).',
  'Validated 6 chairman-drafted risks against actual code (archplan-upsert.js, create-orchestrator-from-plan.js:316/427/451-454, lifecycle-sd-bridge.js:181-235) and live DB state.',
  'Risk-2 stays HIGH (mitigation needs concrete snapshot). Risk-3 raised from MEDIUM to HIGH (watcher self-failure not covered).',
  'Surfaced 6 NEW risks (Risk-7..Risk-12). Risk-7 first-run race vs in-flight CronGenius cascade is most severe — DB shows orchestrator at PLAN_VERIFICATION, child -A at PLAN_PRD, vision approved 01:49Z today.',
  'Risk-11 venture_id NULL on ARCH-CRONGENIUS-001 vs set on vision is concrete drift the auto-path must fix.',
  'Verdict CONDITIONAL_PASS: proceed to PLAN; 6 conditions COND-1..COND-6 must be encoded as PLAN acceptance criteria (5 block EXEC). No HIGH risk blocks LEAD approval; all resolvable at PLAN/EXEC.'
].join(' ');

const row = {
  sd_id: '74108dbf-766e-4f4c-958f-786ff1bc16fb',
  phase: 'LEAD',
  sub_agent_code: 'RISK',
  sub_agent_name: 'Risk Assessment Sub-Agent',
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  critical_issues,
  warnings,
  recommendations,
  detailed_analysis,
  conditions,
  justification,
  source: 'risk-agent',
  executed_from_cwd: process.cwd()
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id,sd_id,phase,sub_agent_code,verdict,confidence,created_at')
  .single();

if (error) { console.error('INSERT_ERR', error); process.exit(1); }
console.log('EVIDENCE_ROW:', JSON.stringify(data, null, 2));
