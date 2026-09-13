import dotenv from 'dotenv'; dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_KEY = 'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001';
const SD_UUID = 'fbbf9a6d-e079-4c22-9189-88336aae9a16';

const DETAIL = [
  'DEDUP VERDICT: REFUTED (independent confirmation).',
  'Flagged duplicate SD-EVA-QA-AUDIT-DBSCHEMA-001: status=completed, created 2026-02-14T14:35Z, completed 2026-02-14T17:42Z. Title "EVA Audit: Database Schema Compliance". Scope verbatim: "Database tables and columns vs Architecture Section 8 target schemas" - comparing the live DB against docs/plans/eva-platform-architecture.md Section 8 stage specs, checking that (NEW)/(CHANGED) architecture fields were implemented. It does not touch summary-vs-detail derivation, generated columns, or write-path drift. This confirms the requester read, arrived at independently.',
  'Broader dedup sweep (9 terms x title+description ilike across strategic_directives_v2): "GENERATED ALWAYS" 1 hit (this SD only), "generated column" 0, "derived column" 0, "summary column" 1 (this SD only), "fence_status" 1 (this SD only), "denormal" 0. Nearest true neighbour is SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (completed), which BUILT the control pack - it is the origin of incident 2, not a competing remedy. No duplicate work found.',
  '',
  'INCIDENT ROWS - ALL THREE VERIFIED LIVE AT THE ROW:',
  '(1) SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E (status=deferred): metadata carries BOTH fence_status_2026_08_17 (state=CLEARED, cleared_at 2026-08-17T15:39Z, cleared_by 0d37100a) AND venture_gate_last_verdict. Drift pair confirmed present.',
  '(2) uat_test_runs c1f3fdd7-9a85-4dc5-a663-cc17fcab68d9: metadata.control_pack_evaluated = false WHILE metadata.control_pack_failures is a populated array (minimum_assertion_manifest failures referencing unmatched journeyIds). Drift confirmed exactly as described.',
  '(3) sms_outbound_obligations 6f1931a5-b8f7-45fa-8926-4ba79d93d70b: status=failed, last_error="ALERTED: sent_no_delivery_callback_provider_confirmed", provider_message_id=SM31b5b9df811e41d16eed6736c0eb9c30, delivered_at=NULL, attempts=3. Confirmed.',
  '',
  'READERS - REAL AND CURRENT, WITH TWO CORRECTIONS AND ONE MISSING:',
  '- lib/eva/uat-robustness-gate.js: REAL, live, 8866 bytes, last commit 4073a3b694e (2026-08-30) "fix(QF-20260830-666): control_pack_evaluated requires ALL controls, not any evidence". Reads run.metadata?.control_pack_failures (L121) and gates on !run.metadata?.control_pack_evaluated (L141). Exactly as the SD describes. CAUTION FOR PLAN: the inline comment at L137-140 records a DELIBERATE prior decision to key on the boolean rather than on absence-of-failures (the gate computes GREEN from pass_rate math alone, with control_pack_failures staying null either way). Scope item (3) reverses a conscious QF-20260830-666 fix; PLAN must reconcile with that intent rather than simply flipping the predicate, or it will re-open QF-666.',
  '- lib/chairman/sms-outbound-worker.js: REAL, live, 56428 bytes, last commit 88b8277bdb7 (2026-09-12) "fix(QF-20260912-394): stop resending an identical carrier-filtered SMS and notify the originator (#8807)" - the exact QF the SD cites. It writes the cited string at L670 (reason sent_no_delivery_callback_provider_confirmed). PARTIAL-OVERLAP CAUTION: the QF-394 remedy already merged on 2026-09-12, so PLAN must measure what it already fixed before re-scoping instance 3.',
  '- Held-send release sweep: the live implementation is lib/adam/chairman-held-send-release.js (last commit a50c77fabf4, 2026-09-12, QF-20260912-079); scripts/cron/chairman-held-sends-release-sweep.mjs is a thin wrapper with no last_error/receipt reads. NAMING CORRECTION: this module operates on chairman_held_sends, NOT sms_outbound_obligations, and uses last_error as a refusal STAMP (L260/342/426), not as a delivery-cause read. Its connection to the delivery-receipt drift is indirect; PLAN should confirm which reader actually needs changing.',
  '- Child-E fence readers: NOT FOUND. A grep for fence_status_2026_08_17 across lib/ and scripts/ returns ZERO code matches. No program reads that key - it appears to be read by agents and humans. Scope item (3) leg "the child-E fence readers read the verdict" currently has no reader to change and may be a no-op deliverable. PLAN must identify a real reader or drop the leg.',
  '',
  'F1 - GENERATED ALWAYS IS INFEASIBLE FOR ALL THREE INSTANCES:',
  'uat_test_runs has 25 columns and NONE is control_pack_evaluated or control_pack_failures; both are keys inside the metadata jsonb. information_schema shows zero columns anywhere named control_pack%. Likewise venture_gate_last_verdict and fence_status% return zero columns schema-wide - both are strategic_directives_v2.metadata jsonb keys. PostgreSQL GENERATED ALWAYS ... STORED cannot target a jsonb sub-key, so instances 1 and 2 cannot use it. Instance 3 (sms_outbound_obligations.status, type text and not boolean) derives from provider receipts in a DIFFERENT table, and generated columns must be same-row and immutable, so it cannot use it either. The BEFORE INSERT OR UPDATE trigger alternative the SD already names remains viable for all three and is the only surviving mechanism. PLAN should note that a BEFORE trigger on strategic_directives_v2, the hottest table in the harness, to derive a metadata key is a significant blast-radius decision deserving explicit treatment.',
  '',
  'F2 - THE PROPOSED LINT WOULD HAVE CAUGHT 0 OF 3, AND ITS BASELINE IS MISCOUNTED:',
  'Live schema walk: 15 boolean base-table columns match *_passed/*_verified (documentation_health_checks.check_passed, exec_authorizations.gates_passed, experiment_outcomes.gate_passed, leo_handoff_executions.validation_passed, llm_txt_version.content_lint_passed, proposal_debates.const_002_passed, quick_fixes.uat_verified, sd_checkpoint_history.validation_passed, sd_phase_handoffs.validation_passed, sdip_groups.all_gates_passed, sdip_submissions.all_gates_passed, subagent_validation_results.validation_passed, submission_steps.validation_passed, substage_transition_log.validation_passed, venture_provisioning_state.conformance_passed). So "at least fourteen" is right in MAGNITUDE (15) but wrong in composition:',
  '  (a) ZERO *_evaluated boolean columns exist in the live schema - the pattern the SD names first has no column instances at all.',
  '  (b) NONE of the 15 is one of the three incident fields. The guarded set is DISJOINT from the incidents that motivate it: two incidents are jsonb keys and the third is a text status column, so a lint on new BOOLEAN *_evaluated/*_passed/*_verified columns in database/ would have caught 0 of 3.',
  '  (c) The grep-bounded count is additionally inflated by non-columns: grepping database/ yields only 10 distinct names, of which p_gate_passed, p_passed and v_artifact_verified are PL/pgSQL function parameters and locals, leaving about 7 real columns. The grep over-counts and under-covers simultaneously.',
  'Scope item (4) already mandates a schema walk at PRD, so this is self-correcting by design - but PLAN must widen the lint predicate (jsonb summary keys; text status columns whose detail lives in another table) or explicitly record the gap, otherwise deliverable (2) generalizes away from the very class deliverables (1) and (3) address.',
  '',
  'F3 - INSTANCE 3 HAS NO DURABLE DETAIL TO DERIVE FROM:',
  'The receipt store is sms_status_staging (columns: id, provider_message_id, message_status, signature_valid, received_at, drained_at). It currently holds 0 rows total and 0 receipts for provider_message_id SM31b5b9df811e41d16eed6736c0eb9c30 - it is a transient drain buffer, not a durable receipt ledger. No table schema-wide carries carrier error codes for SMS (error_code columns exist only on leo_error_log, proposal_debates, eva_cascade_errors, chairman_notifications). The cited evidence of three provider receipts with carrier code 30007 is therefore not recoverable from the schema today. Scope (1) instance 3 (obligation status derived from the newest provider receipt) and scope (3) (read the provider receipt, not last_error text) cannot be implemented until a durable receipt store exists - unscoped additional work PLAN must size or explicitly defer.',
  '',
  'MINOR - PRIOR-ART CITATIONS ARE WRONG (non-blocking):',
  'The SD cites "agent_readiness_audit expected_sample_count" (the actual table is agent_readiness_audit_run) and "compliance_experiment total_score and rating" - no compliance_experiment table exists in the schema at all; the generated total_score lives on opportunity_scores. Better prior art exists and should be substituted at PRD: the schema already carries 24 generated columns including two generated BOOLEANS in exactly the summary-derived-from-detail shape this SD wants - srip_quality_checks.passed = (overall_score >= pass_threshold) and ai_gen_dwell_tracking.sufficient. The mechanism is proven in-repo; only the citations are off.',
  '',
  'GATE 1 BACKLOG CHECK - NOT A BLOCKER (measured, not assumed):',
  'sd_backlog_map holds 0 rows for this SD under both the UUID and the sd_key convention. Before reporting that as a blocker I measured the comparison set: 7 of the 8 most recent SD-LEO-INFRA-* SDs also carry 0 backlog rows, including completed ones (only SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 has 1). Harness SDs authored via leo-create-sd carry their requirements in metadata.plan_content, not in sd_backlog_map. The generic one-or-more-backlog-item gate does not bind this SD class, and this SD plan_content carries a full Scope/Risks/Success Criteria/Smoke Test body. Reporting as PASS, not blocker.',
].join('\n');

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  execution_time_ms: 0,
  summary: 'VALIDATION (LEAD): dedup REFUTED independently - SD-EVA-QA-AUDIT-DBSCHEMA-001 is a completed (2026-02-14) EVA Architecture-Section-8 target-schema audit with zero overlap on summary/detail derivation; a 9-term semantic sweep across all SDs found no other SD covering this class. All three cited incident rows verified live at the row. NO BLOCKER to LEAD approval. Three material scope-accuracy findings handed to PLAN: (F1) 2 of 3 instances are jsonb metadata keys rather than columns and the third derives cross-table, so GENERATED ALWAYS is infeasible for 3/3 and only the trigger alternative survives; (F2) the proposed lint predicate (new *_evaluated/*_passed/*_verified BOOLEAN columns in database/) would have caught 0 of the 3 motivating incidents and guards a set disjoint from them, and the live schema contains ZERO *_evaluated boolean columns; (F3) the SMS detail source sms_status_staging is an empty transient drain buffer with no durable receipt retained, so instance 3 has no persistent detail to derive from.',
  detailed_analysis: DETAIL,
  recommendations: [
    'APPROVE at LEAD. The defect class is real, all three incident rows verified live, no duplicate SD exists, and no finding rises to a blocker.',
    'PLAN F1: drop GENERATED ALWAYS as a mechanism - infeasible for all three instances (2 are jsonb sub-keys, 1 derives cross-table). Trigger-only. Treat a BEFORE trigger on strategic_directives_v2 as an explicit blast-radius decision.',
    'PLAN F2: widen the lint predicate beyond boolean columns (jsonb summary keys, text status columns) or record the gap explicitly - as scoped it would have caught 0 of the 3 motivating incidents. Assert the baseline from the schema walk (15 live boolean columns, zero *_evaluated), not from the grep (about 7 real columns, inflated by PL/pgSQL locals).',
    'PLAN F3: size or defer instance 3 - sms_status_staging is an empty transient buffer, so there is no durable provider receipt to derive status from. A durable receipt ledger is unscoped prerequisite work.',
    'PLAN reader corrections: the child-E fence reader does not exist in code (zero grep matches for fence_status_2026_08_17); the held-send sweep is lib/adam/chairman-held-send-release.js and operates on chairman_held_sends, not sms_outbound_obligations.',
    'PLAN conflict check: scope (3) reverses the deliberate QF-20260830-666 decision in uat-robustness-gate.js, and QF-20260912-394 already merged part of instance 3 on 2026-09-12 (PR #8807). Measure both before re-scoping.',
    'PLAN citation fix: replace the agent_readiness_audit / compliance_experiment prior-art with srip_quality_checks.passed and ai_gen_dwell_tracking.sufficient - both are live generated BOOLEANS in the exact shape intended.',
  ],
  warnings: [
    { severity: 'MEDIUM', issue: 'GENERATED ALWAYS infeasible for all 3 named instances (2 jsonb keys, 1 cross-table derivation)', recommendation: 'PLAN selects triggers as the sole mechanism and treats the strategic_directives_v2 trigger as a blast-radius decision' },
    { severity: 'MEDIUM', issue: 'Proposed CI lint guards a column set disjoint from the 3 motivating incidents; would have caught 0 of 3; zero *_evaluated boolean columns exist live', recommendation: 'Widen predicate to jsonb summary keys and text status columns, or record the gap explicitly at PRD' },
    { severity: 'MEDIUM', issue: 'sms_status_staging holds 0 rows and is a transient drain buffer - no durable provider receipt exists to derive obligation status from', recommendation: 'Size a durable receipt ledger as prerequisite, or defer instance 3' },
    { severity: 'LOW', issue: 'Child-E fence reader has zero code matches; scope leg may be a no-op', recommendation: 'Identify a real reader at PRD or drop the leg' },
    { severity: 'LOW', issue: 'Prior-art citations wrong: compliance_experiment table does not exist; agent_readiness_audit is agent_readiness_audit_run', recommendation: 'Substitute srip_quality_checks.passed and ai_gen_dwell_tracking.sufficient' },
  ],
  conditions: [
    { action: 'PLAN must replace GENERATED ALWAYS with triggers for all three instances (F1)', priority: 'high', blocking: false },
    { action: 'PLAN must widen or explicitly gap-record the lint predicate so it covers the motivating class (F2)', priority: 'high', blocking: false },
    { action: 'PLAN must size or defer instance 3 pending a durable receipt store (F3)', priority: 'medium', blocking: false },
    { action: 'PLAN must reconcile scope (3) with QF-20260830-666 and the already-merged QF-20260912-394', priority: 'medium', blocking: false },
  ],
  justification: 'CONDITIONAL_PASS at LEAD: dedup independently refuted, all three incident rows verified live at the row, all named readers confirmed real and current (with two naming corrections and one missing reader), and the zero-backlog condition measured against its comparison set and found normal for this SD class rather than a blocker. No finding rises to a LEAD blocker - the defect class is genuine and the SD is approvable. The three material findings (GENERATED ALWAYS infeasible 3/3, lint disjoint from motivating incidents, no durable SMS receipt) are scope-accuracy corrections owed to PLAN under the SD own scope item (4) schema walk, not grounds to withhold approval.',
  metadata: {
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    dedup_verdict: 'REFUTED',
    dedup_candidate: 'SD-EVA-QA-AUDIT-DBSCHEMA-001',
    dedup_candidate_status: 'completed',
    dedup_sweep_terms: 9,
    duplicate_sds_found: 0,
    incident_rows_verified: 3,
    incident_rows_verified_live: ['SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E', 'uat_test_runs c1f3fdd7-9a85-4dc5-a663-cc17fcab68d9', 'sms_outbound_obligations 6f1931a5-b8f7-45fa-8926-4ba79d93d70b'],
    readers_confirmed_real: ['lib/eva/uat-robustness-gate.js', 'lib/chairman/sms-outbound-worker.js', 'lib/adam/chairman-held-send-release.js'],
    readers_not_found: ['child-E fence reader (zero grep matches for fence_status_2026_08_17)'],
    baseline_claim_sd: 14,
    baseline_measured_live_boolean_columns: 15,
    baseline_measured_grep_database_dir: 7,
    evaluated_boolean_columns_live: 0,
    lint_would_have_caught_of_3: 0,
    generated_columns_live: 24,
    backlog_items: 0,
    backlog_blocker: false,
    backlog_comparison_note: '7 of 8 recent SD-LEO-INFRA-* SDs also carry 0 backlog rows; not binding for this SD class',
    blocker_found: false,
    lead_recommendation: 'APPROVE',
  },
};

const resolution = await resolveSubAgentRepo({ subAgentCode: 'VALIDATION', sdId: SD_UUID });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_UUID, { code: 'VALIDATION' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
console.log('STORED id:', stored?.id || JSON.stringify(stored).slice(0, 300));
console.log('verdict:', results.verdict, '| repo_path:', results.metadata.repo_path, '| resolved:', results.metadata.repo_resolved);
