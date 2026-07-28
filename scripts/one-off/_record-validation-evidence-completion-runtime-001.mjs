/**
 * Record VALIDATION sub-agent evidence for SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001
 * at LEAD phase, via the canonical writer (resolve-repo.js + results-storage.js).
 * One-off script; not part of a durable pipeline.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SD_ID = '4c45e3e7-e642-4972-a9ef-f9ed35190104';
const SD_KEY = 'SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

const results = {
  verdict: 'PASS',
  confidence_score: 82,
  summary: 'LEAD-phase VALIDATION for SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001. Independently re-measured LEAD\'s (a)/(b) quick_fixes counts (both confirmed exact), independently verified instances 1-3 against the running server and current code, read the completion path (scripts/complete-quick-fix.js + modules) to answer the FR-1/FR-2 enforcement-point question, and checked for duplicate/overlapping SDs/QFs. No blocking issues found. One factual correction to LEAD\'s framing of Instance 1 is recorded below (does not change the PASS verdict; if anything it strengthens the case for FR-1).',
  critical_issues: [],
  warnings: [
    {
      severity: 'MEDIUM',
      issue: 'LEAD claim (c) "Instance 1 (QF-20260725-096) is now RESOLVED... SD still asserts it as live-broken" is MISLEADING, not accurate. Independently probed the running server (2026-07-28): the exact path /fleet-ui/session-view.html DOES return 410 (narrow claim technically true), BUT the QF row is currently status=open (reopened by the coordinator 2026-07-28, NOT completed) because the 410 guard has confirmed, currently-reproducible bypasses: /fleet-ui/Session-View.html -> 200, /fleet-ui/SESSION-VIEW.HTML -> 200, /fleet-ui//session-view.html (double-slash) -> 200, /FLEET-UI/session-view.html (dir casing) -> 200 -- all verified live by this agent just now, not relayed. The QF row itself documents that the evidence mechanism (410-hit logging) ALSO failed silently on the bypass paths, and Ruling 5 in the row explicitly discards the accumulated 7-day soak as uninterpretable. This is a live, ongoing, textbook illustration of exactly what FR-1 targets (a single happy-path probe cannot prove a blocklist is not evaded) -- it should be read as reinforcing evidence for FR-1, not as grounds to treat Instance 1 as closed/stale.',
      recommendation: 'PLAN should not descope or weaken FR-1 on the assumption Instance 1 is resolved. Cite the live bypass finding (not just the original soak story) as the concrete acceptance-test case for FR-1 in the PRD.'
    },
    {
      severity: 'LOW',
      issue: 'LEAD\'s "oldest orphan since 2026-07-13" (claim a) is imprecise: the actual oldest escalated-orphan (escalated_to_sd_id=NULL) row is QF-20260705-182, created 2026-07-05 (3 weeks old, not 2). 2026-07-13 is correct only as the oldest CRITICAL-severity orphan (QF-20260713-202/422). Total count (55 escalated / 16 orphans) and severity split (critical:3, high:4, medium:7, low:2) are both exact matches to LEAD\'s numbers.',
      recommendation: 'Non-blocking; use 2026-07-05 as the oldest-orphan figure if PLAN cites an age in the PRD.'
    }
  ],
  recommendations: [
    'FR-1 and FR-2 require ZERO schema changes -- confirmed by reading quick_fixes columns and the completion-path code. This SD should NOT be treated as chairman-gated DDL and its Tier-3 routing is already correctly driven by the security keyword, not by a migration need.',
    'FR-2 enforcement point: scripts/modules/complete-quick-fix/orchestrator.js buildMergedReconcileUpdate() (lines ~87-104) currently sets force_completed:true on the terminal "completed" path but OMITS verified_by entirely, leaving the existing verified_by column null even though scopeAcceptedBy (the "<who/why>" string from the already-mandatory --scope-accepted flag) is available in scope at that exact point. The fix is to add verified_by: scopeAcceptedBy to that returned object -- a ~1-line change, reusing data already collected, no new flag needed. The separate non-reconcile force-complete path (orchestrator.js line ~693) already writes verified_by, but only as a generic sentinel ("FORCE_COMPLETE"/"UAT_AGENT") rather than a name; consider writing options.reason there instead/also.',
    'FR-1 enforcement point: no existing flag or column captures a runtime observation today. Recommend a new --runtime-observation "<probe output>" CLI flag in scripts/modules/complete-quick-fix/cli.js, parsed the same way --scope-accepted already is, with the value (plus an auto-appended ISO timestamp) appended into the existing verification_notes text field (already used to hold ad hoc structured JSON audit blocks, e.g. the force_completed JSON at orchestrator.js line ~656). No new column required.',
    'Q4 view: do NOT gate FR-2 behind FR-1\'s runtime-behaviour trigger. The demonstrated near-miss motivating FR-2 (QF-20260726-423, verified below) was a scope/security-carve-out case, not a runtime-observation case -- gating FR-2 on FR-1 would have missed exactly the instance that motivated it. The 62%-prevalence "noise" concern is better addressed by defaulting the witness value to the already-captured scopeAcceptedBy / operator session id (zero new prompts) rather than by narrowing FR-2\'s trigger.',
    'FR-3 enforcement point: scripts/classify-quick-fix.js (~line 303) sets status=escalated on Tier-3 keyword detection WITHOUT setting escalated_to_sd_id -- that linkage only happens later, in lib/sd-creation/source-adapters/qf.js, when/if someone runs leo-create-sd.js --from-qf. The orphan gap is the unbounded window between those two steps. escalated_to_sd_id column already exists; no schema change needed here either.',
    'Confirmed no duplicate/overlapping SD or QF covers this scope. QF-20260725-691 (merged-PR-reconcile witness -> non-terminal + --scope-accepted) and SD-LEO-INFRA-QF-FALSE-COMPLETION-WITNESS-GAP-001 (PR-merge witness) are prior, COMPLETED, adjacent work this SD correctly extends (merge-witness -> scope-witness -> now runtime-witness + named-witness + escalation-linkage), not something it duplicates.'
  ],
  detailed_analysis: {
    independent_measurements: {
      a_escalated_orphans: { total_escalated: 55, orphans_null_escalated_to_sd_id: 16, severity_split: { critical: 3, high: 4, medium: 7, low: 2 }, matches_lead: true, correction: 'oldest orphan overall is 2026-07-05 (QF-20260705-182), not 2026-07-13; 07-13 is the oldest CRITICAL-severity orphan only' },
      b_force_completed_thin: { total_force_completed_true: 629, thin_uat_false_verifiedby_null: 392, pct: '62.3%', matches_lead: true }
    },
    instance_verification: {
      instance_1_QF_20260725_096: {
        db_status: 'open (reopened 2026-07-28 by coordinator)',
        live_probe_exact_path: '410 (confirmed)',
        live_probe_bypasses_confirmed_now: {
          'Session-View.html (mixed case)': 200,
          'SESSION-VIEW.HTML (upper case)': 200,
          '//session-view.html (double slash)': 200,
          '/FLEET-UI/session-view.html (dir case)': 200,
          './session-view.html (dot-slash)': 410,
          'fleet-panel.html / vision.html (neighbours)': 200
        },
        verdict: 'LEAD\'s "now RESOLVED" framing is inaccurate; row is live-reopened with confirmed active bypasses. See warnings.'
      },
      instance_2_QF_20260725_614: {
        db_status: 'escalated, escalated_to_sd_id=NULL (confirmed orphan, part of the 16 in (a))',
        deployment_verification: 'CONFIRMED LIVE on running server: GET /api/ventures (no auth) -> 401; POST /api/ventures/master-reset (no auth, no body) -> 401. server/index.js:237 shows the whole /api/ventures mount guarded by requireAuth with no optionalAuth special-case remaining. Verified via safe non-destructive probes only (did not fire the actual master-reset handler).',
        additional_finding: 'The "genuinely still open" confirmation-gate item from QF-614\'s own verification_notes appears already shipped separately: server/routes/ventures.js:325-343 now has an evaluateConfirmation() gate + withDestructiveAudit() wrapper attributed to SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-1/FR-3. Reduces but does not eliminate QF-614\'s remaining open items (false comment deletion, sibling-route audit not checked).'
      },
      instance_3_QF_20260726_423: {
        db_status: 'open (reopened by coordinator)',
        confirmed: true,
        detail: 'verification_notes shows the row was force-completed via --scope-accepted having verified only merge + merge-base ancestry, then explicitly REOPENED by the coordinator on discovering the SCOPED CREDENTIAL half (a live security carve-out on fleet-panel.js add-session 401) was never delivered while the tree-currency half (b) was. Matches the SD narrative exactly.'
      }
    },
    feasibility: {
      schema_change_required: false,
      quick_fixes_columns_available: ['verified_by', 'verification_notes', 'uat_verified', 'force_completed', 'escalated_to_sd_id'],
      fr2_enforcement_point: 'scripts/modules/complete-quick-fix/orchestrator.js buildMergedReconcileUpdate() ~L87-104 (add verified_by: scopeAcceptedBy); also L693 non-reconcile path (generic sentinel today)',
      fr1_enforcement_point: 'new --runtime-observation flag in scripts/modules/complete-quick-fix/cli.js, persisted into existing verification_notes field',
      fr3_enforcement_point: 'scripts/classify-quick-fix.js ~L303 (sets status=escalated without escalated_to_sd_id) vs lib/sd-creation/source-adapters/qf.js (sets escalated_to_sd_id, only when --from-qf is actually run)'
    },
    duplicate_check: {
      qf_691_scope_accepted_reconcile: 'completed, prior art this SD extends, not a duplicate',
      qf_444_escalated_from: 'correctly links escalated_to_sd_id to this SD already (4c45e3e7-e642-4972-a9ef-f9ed35190104)',
      sd_qf_false_completion_witness_gap_001: 'completed, covers PR-merge witness only (different, earlier link in the same chain)',
      sd_destructive_action_safety_001: 'completed, overlaps QF-614 remediation but not this SD\'s FR-1/2/3 scope',
      no_direct_duplicate_found: true
    }
  },
  metrics: {
    escalated_total: 55,
    escalated_orphans: 16,
    force_completed_total: 629,
    force_completed_thin: 392,
    thin_pct: 62.3
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_ID, null, results, { sdKey: SD_KEY, phase: 'LEAD' });
console.log('STORED_ID:', stored?.id);
console.log('metadata.repo_path:', stored?.metadata?.repo_path);
console.log('metadata.executed_from_cwd:', stored?.metadata?.executed_from_cwd);
console.log('phase:', stored?.phase);
console.log('verdict:', stored?.verdict);
process.exit(0);
