require('dotenv').config();

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sdKey = 'SD-LEO-FEAT-STAGE-REJECT-KILL-001';

  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('metadata, smoke_test_steps, key_changes, risks, key_principles')
    .eq('sd_key', sdKey)
    .single();

  const lead_amendments = {
    sources: [
      { agent: 'validation-agent', evidence_id: 'a63396a5-990a-40aa-a93f-a231e1281df2', verdict: 'PASS', confidence: 92 },
      { agent: 'database-agent', evidence_id: '2e71b53c-eacb-483d-8137-1a4ecf646494', verdict: 'WARNING', confidence: 88 }
    ],
    component_correction: {
      original_scope: 'LaunchGateRenderer.tsx',
      corrected_scope: 'Stage23Renderer.tsx',
      reason: 'LaunchGateRenderer.tsx is Stage 24 per its own header. Stage 23 = Post-Launch Operations Kill Gate, hosted in Stage23Renderer.tsx (171 LOC, C:/Users/rickf/Projects/_EHG/ehg/src/components/chairman-v3/gates/Stage23Renderer.tsx).'
    },
    database_amendments: [
      {
        id: 'A-1',
        amendment: 'Replace auth.jwt() role-check with public.fn_is_chairman() helper',
        rationale: 'No public RPC uses auth.jwt() today. fn_is_chairman() is the canonical SECURITY DEFINER role-check helper; accepts chairman|admin|owner. The only chairman user has meta_role=admin (rickfelix2000@gmail.com / 69c8aa7a-7661-48ed-9779-746fa6290873) which fn_is_chairman accepts but a literal jwt role=chairman check would reject. If lead role must also be admitted, extend fn_is_chairman or write fn_is_chairman_or_lead.',
        affects: 'kill_venture RPC body'
      },
      {
        id: 'A-2',
        amendment: 'Drop new event_type value; use event_type=status_change with event_data.type=venture.killed',
        rationale: 'eva_events_event_type_check rejects venture.killed. eva_events has NO event_subtype column. Cleaner path: emit with event_type=status_change (already accepted) and put discriminator inside event_data jsonb, set eva_venture_id=ventures.id for audit linkage.',
        affects: 'kill_venture RPC eva_events emit'
      },
      {
        id: 'A-3',
        amendment: 'kill_venture must update BOTH ventures.status=cancelled AND ventures.workflow_status=killed',
        rationale: 'trg_ventures_update_sync_eva only mirrors when status changes. Updating workflow_status alone leaves eva_ventures.status drifted. Dual-state update keeps eva_ventures in sync.',
        affects: 'kill_venture RPC body'
      },
      {
        id: 'A-4',
        amendment: 'Reconcile with existing reject_chairman_decision RPC',
        rationale: 'reject_chairman_decision already exists for kill-gate stages [3,5,13,23] and sets workflow_status=failed. Splitting kill paths creates two truths: failed (system) vs killed (chairman). Recommend amending reject_chairman_decision to also set workflow_status=killed for kill-gate rejections (converging both paths). Document semantics: failed = automated/system failure; killed = chairman kill decision.',
        affects: 'reject_chairman_decision RPC + kill_venture RPC'
      },
      {
        id: 'A-5',
        amendment: 'Write to operations_audit_log inside kill_venture',
        rationale: 'Canonical governance audit table is public.operations_audit_log (entity_type, entity_id, action, performed_by, severity, metadata). Add row entity_type=venture, action=kill, severity=warning, metadata={rationale} for governance trail consistency.',
        affects: 'kill_venture RPC body'
      }
    ],
    migration_sequencing: [
      'ALTER TYPE workflow_status_enum ADD VALUE IF NOT EXISTS killed must be standalone (Postgres restriction; no other DDL in same transaction)',
      'ventures_kill_log RLS: omit INSERT policy (rely on SECURITY DEFINER privilege escalation); SELECT policy USING (fn_is_chairman() OR killed_by_user_id = auth.uid())',
      'Backfill insert: PrivacyPatrol AI venture id 08d20036-03c9-4a26-bbc5-f37a18dfdf23, current kill_reason length 123 chars satisfies length>=20 CHECK',
      'Do NOT drop ventures.killed_at / ventures.kill_reason in this SD — defer to follow-up cleanup SD after backfill verified'
    ],
    risk_text_correction: {
      original_R1: 'workflow_status enum extension may not commute with existing UPDATE triggers (e.g., the tr_sd_completed_event family)',
      corrected_R1: 'workflow_status enum extension is safe across all 9 ventures-attached triggers per database-agent inventory (auto_populate_company_id_trigger, enforce_tier0_stage_cap, trg_enforce_stage0_origin, trg_sync_stage_work_on_advance, trg_validate_stage_column, trg_ventures_insert_sync_eva, trg_ventures_update_sync_eva, trigger_create_postmortem_on_failure, update_ventures_updated_at). The tr_sd_completed_event/fn_emit_sd_completed_event family is attached to strategic_directives_v2 (NOT ventures) and is orthogonal to venture status changes. R-1 retired.',
      reason: 'My initial R-1 conflated SD-completion trigger family with ventures triggers. Database-agent inventory shows zero conflict.'
    },
    plan_phase_followups: [
      'Populate sd_backlog_map (≥1 row required before status flip to active per validation-agent finding)',
      'PRD must specify target component as Stage23Renderer.tsx, not LaunchGateRenderer.tsx',
      'PRD must incorporate amendments A-1 through A-5 into FR-1, FR-2, FR-3 (decompose existing FRs against amendment surface)',
      'PRD must address PrivacyPatrol AI inconsistent state: status=active + workflow_status=pending despite killed_at set; backfill design must read (killed_at, kill_reason) not status',
      'PRD must decide target_application: cross-repo SD with UI majority share — recommend EHG (UI-dominant) per database-agent UI-majority rule, but DB-dominant amendments tilt this back to EHG_Engineer; DEFER to PLAN'
    ]
  };

  const newRisks = [
    {
      risk: 'R-1: workflow_status enum extension safety verified by database-agent (9 venture triggers, no conflicts, no partial indexes filtering on workflow_status). RETIRED post-LEAD-amendments.',
      severity: 'low',
      mitigation: 'No mitigation needed; risk eliminated by sub-agent inventory.'
    },
    {
      risk: 'R-2: Backfill of PrivacyPatrol AI requires resolvable killed_by_user_id. Database-agent confirmed chairman user 69c8aa7a-7661-48ed-9779-746fa6290873 (rickfelix2000@gmail.com, meta_role=admin); fn_is_chairman accepts admin role.',
      severity: 'low',
      mitigation: 'Resolved at LEAD by database-agent inventory; no fallback sentinel needed.'
    },
    {
      risk: 'R-3: Cross-repo coordination — DB migration in EHG_Engineer, UI in EHG. Mitigation: ship migration first (additive), then UI in second PR; gate UI rollout on migration applied.',
      severity: 'medium',
      mitigation: 'Two-PR sequence; document dependency in PRD; UI E2E asserts migration version pre-condition.'
    },
    {
      risk: 'R-4: Semantic divergence between killed (chairman) and failed (reject_chairman_decision RPC). Dual paths could drift over time.',
      severity: 'medium',
      mitigation: 'Amendment A-4: reconcile reject_chairman_decision in same migration; document semantics; add integration test asserting both paths converge on workflow_status=killed for kill-gate stages.'
    },
    {
      risk: 'R-5: PrivacyPatrol AI is in inconsistent state (killed_at set but status=active). Backfill must not assume status=cancelled.',
      severity: 'medium',
      mitigation: 'Backfill query reads (killed_at IS NOT NULL, kill_reason); does not filter on status. Documented in PRD migration script.'
    },
    {
      risk: 'R-6: 5-second cooldown timing tradeoff. Too short = misclick risk; too long = chairman friction.',
      severity: 'low',
      mitigation: '5s aligns with established destructive-UX patterns; document as tunable in component props for post-launch adjustment.'
    }
  ];

  const newKeyChanges = [
    { change: 'Extend ventures.workflow_status enum with killed value (additive migration; standalone ALTER TYPE step due to Postgres transaction restriction)', impact: 'Enables formal terminal state distinct from failed/cancelled' },
    { change: 'Create ventures_kill_log table (id PK, venture_id FK CASCADE, killed_by_user_id FK auth.users, rationale TEXT NOT NULL CHECK len>=20, killed_at TIMESTAMPTZ, metadata JSONB) + indexes (venture_id), (killed_at DESC) + RLS SELECT for fn_is_chairman OR killed_by_user_id=auth.uid()', impact: 'Append-only audit log; system of record' },
    { change: 'Create kill_venture(uuid, text) SECURITY DEFINER RPC: fn_is_chairman() role check, dual-state update (status=cancelled + workflow_status=killed), insert ventures_kill_log row, emit eva_events with event_type=status_change + event_data.type=venture.killed + eva_venture_id=ventures.id, write operations_audit_log row (entity_type=venture, action=kill, severity=warning), return kill_log id', impact: 'Single transactional entry point; prevents direct UPDATE bypassing audit log; reuses canonical helpers' },
    { change: 'Reconcile reject_chairman_decision RPC: amend kill-gate branches [3,5,13,23] to set workflow_status=killed alongside status=cancelled (converging both paths to same terminal state)', impact: 'Eliminates semantic divergence between failed (system) and killed (chairman) for kill-gate decisions' },
    { change: 'Stage23Renderer.tsx (NOT LaunchGateRenderer.tsx) Reject dialog: typed REJECT match (case-sensitive) + ≥20-char rationale + 5s cooldown after last keystroke + destructive button styling + 403 inline error on role-check fail; on submit calls kill_venture RPC then navigates to /ventures with toast', impact: 'User-visible terminal-state control; prevents misclick; cross-repo EHG side' },
    { change: 'Vitest unit test for dialog (cooldown timing, exact match validation, error states) + e2e smoke test for full Stage 23 reject path (sign in, navigate, fill, cooldown, confirm, verify ventures_kill_log row + eva_events row)', impact: 'Regression coverage; PLAN gate evidence' },
    { change: 'Backfill PrivacyPatrol AI (venture 08d20036-03c9-4a26-bbc5-f37a18dfdf23) into ventures_kill_log: killed_by_user_id=69c8aa7a-7661-48ed-9779-746fa6290873 (chairman uid), rationale=current kill_reason (length 123), killed_at=current killed_at, metadata.backfill_source=SD-LEO-FIX-REVERT-CROSS-VENTURE-001. Read from (killed_at IS NOT NULL, kill_reason); do NOT filter on ventures.status (PrivacyPatrol AI is in inconsistent state status=active + workflow_status=pending despite killed_at set).', impact: 'Existing terminal venture promoted from interim columns to formal audit log; tolerant of pre-existing status drift' }
  ];

  const newKeyPrinciples = [
    'Additive migrations only (workflow_status enum extension; new ventures_kill_log table; new RPC; non-destructive backfill)',
    'Reuse canonical helpers (fn_is_chairman not auth.jwt; operations_audit_log not custom audit table; eva_events status_change not new event_type)',
    'RLS-defended (RLS on ventures_kill_log + SECURITY DEFINER RPC + fn_is_chairman role check)',
    'Two-gate confirm UX (typed match + ≥20-char rationale + 5s cooldown + destructive styling)',
    'Dual-state mirror (kill_venture updates BOTH ventures.status=cancelled AND ventures.workflow_status=killed to keep eva_ventures in sync via trg_ventures_update_sync_eva)',
    'Forward-compatible (interim ventures.killed_at / ventures.kill_reason columns left in place; no drop in this SD)',
    'Cross-repo coordinated (DB migration ships first as additive; UI gated on migration applied)',
    'Audit log as system of record (ventures_kill_log append-only via RPC; operations_audit_log governance trail)'
  ];

  const newSmokeTestSteps = [
    { step_number: 1, instruction: 'Sign in to EHG as chairman (rickfelix2000@gmail.com), navigate to a Stage 23 venture (Post-Launch Operations Kill Gate)', expected_outcome: 'Stage23Renderer.tsx (not LaunchGateRenderer) renders with Approve, Hold, and the new Reject button visible' },
    { step_number: 2, instruction: 'Click Reject; type REJ (incomplete) in the confirmation field, type Insufficient market signal sustained (≥20 chars) in rationale', expected_outcome: 'Confirm Reject button stays disabled (typed match incomplete; cooldown also active)' },
    { step_number: 3, instruction: 'Complete the typed match to REJECT; wait 5 seconds without further keystrokes', expected_outcome: 'Confirm Reject button becomes enabled with destructive (red) styling after the cooldown' },
    { step_number: 4, instruction: 'Click Confirm Reject', expected_outcome: 'kill_venture RPC invoked; toast Venture rejected shown; navigation to /ventures; venture row shows workflow_status=killed AND status=cancelled in DB; eva_ventures.status mirrors via trg_ventures_update_sync_eva' },
    { step_number: 5, instruction: 'Query ventures_kill_log for the venture; query eva_events for matching event_type=status_change + event_data.type=venture.killed; query operations_audit_log for entity_type=venture + action=kill', expected_outcome: 'All three rows exist with consistent killed_by_user_id, rationale, killed_at within last minute' },
    { step_number: 6, instruction: 'Sign out, sign in as a non-chairman/non-lead user (any user with meta_role NOT IN (chairman, admin, owner)), attempt the same flow', expected_outcome: 'RPC returns 403/role-denied; inline UI error Only chairman or lead can reject a venture; ventures_kill_log row count unchanged; no eva_events or operations_audit_log row written' }
  ];

  const mergedMetadata = {
    ...(existing?.metadata || {}),
    lead_amendments
  };

  const updatePayload = {
    metadata: mergedMetadata,
    risks: newRisks,
    key_changes: newKeyChanges,
    key_principles: newKeyPrinciples,
    smoke_test_steps: newSmokeTestSteps
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update(updatePayload)
    .eq('sd_key', sdKey)
    .select('sd_key')
    .single();

  if (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
  console.log('LEAD amendments applied:', JSON.stringify(data, null, 2));
})();
