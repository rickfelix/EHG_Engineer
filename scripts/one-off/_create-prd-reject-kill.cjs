require('dotenv').config();

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sdKey = 'SD-LEO-FEAT-STAGE-REJECT-KILL-001';
  const { data: sdData } = await supabase.from('strategic_directives_v2').select('*').eq('sd_key', sdKey).single();
  const sdUuid = sdData.id;
  const { createPRDWithValidatedContent } = await import('../prd/prd-creator.js');

  const llmContent = {
    executive_summary:
      "PLAN-phase deliverable for SD-LEO-FEAT-STAGE-REJECT-KILL-001 — Stage 23 Reject UX. Cross-repo formal terminal-state SD: extends ventures.workflow_status enum with 'killed' (additive); creates ventures_kill_log audit table with RLS; adds kill_venture(uuid, text) SECURITY DEFINER RPC using fn_is_chairman() (per database-agent amendment A-1); reconciles with existing reject_chairman_decision RPC for kill-gate stages [3,5,13,23] (A-4, semantic convergence); writes to operations_audit_log governance trail (A-5); emits eva_events with event_type='status_change' + event_data.type='venture.killed' (A-2; eva_events lacks event_subtype column); dual-state updates ventures.status='cancelled' AND workflow_status='killed' to keep eva_ventures mirrored via trg_ventures_update_sync_eva (A-3). EHG-side: Stage23Renderer.tsx (NOT LaunchGateRenderer which is Stage 24 per its own header — validation-agent correction) hosts Reject dialog with typed REJECT match + ≥20-char rationale + 5s cooldown + destructive button styling. Backfills PrivacyPatrol AI (venture 08d20036-03c9-4a26-bbc5-f37a18dfdf23, chairman uid 69c8aa7a-7661-48ed-9779-746fa6290873, kill_reason length 123 satisfies CHECK len>=20). Closes deferred FR-5 of SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 (PRD EA07B573120C scope_amendment). Cross-repo sequencing: ship EHG_Engineer migration PR first (additive), then EHG UI PR (gate UI rollout on migration applied). LEAD-FINAL ≥85% (feature SD threshold).",

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: "Extend ventures.workflow_status enum with 'killed' value via standalone ALTER TYPE migration step (Postgres restriction: ALTER TYPE ADD VALUE cannot run inside a transaction with other DDL).",
        acceptance_criteria: [
          "ALTER TYPE workflow_status_enum ADD VALUE IF NOT EXISTS 'killed' applies clean against EHG_Engineer Supabase project",
          "Re-running migration is idempotent (IF NOT EXISTS)",
          "Existing rows are not touched; SELECT count(*) WHERE workflow_status != 'killed' before vs after = no change",
          "v_active_ventures and v_archived_ventures views continue to function (database-agent confirmed: not value-filtered on workflow_status)"
        ]
      },
      {
        id: 'FR-2',
        requirement: "Create ventures_kill_log audit table with FK constraints, CHECK constraint, indexes, and RLS policies.",
        acceptance_criteria: [
          "Table created with: id UUID PK DEFAULT gen_random_uuid(); venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE; killed_by_user_id UUID NOT NULL REFERENCES auth.users(id); rationale TEXT NOT NULL CHECK (length(rationale) >= 20); killed_at TIMESTAMPTZ NOT NULL DEFAULT now(); metadata JSONB DEFAULT '{}'::jsonb",
          "Indexes: idx_ventures_kill_log_venture (venture_id) and idx_ventures_kill_log_killed_at (killed_at DESC)",
          "RLS enabled on table; SELECT policy: USING (fn_is_chairman() OR killed_by_user_id = auth.uid()); no direct INSERT policy (writes only via SECURITY DEFINER RPC privilege escalation)",
          "Migration is idempotent (CREATE TABLE IF NOT EXISTS; CREATE INDEX IF NOT EXISTS; CREATE POLICY IF NOT EXISTS or DROP POLICY IF EXISTS / CREATE POLICY pattern)"
        ]
      },
      {
        id: 'FR-3',
        requirement: "Create kill_venture(p_venture_id UUID, p_rationale TEXT) RETURNS UUID SECURITY DEFINER RPC implementing all 5 database-agent amendments (A-1 through A-5).",
        acceptance_criteria: [
          "A-1: Role check via public.fn_is_chairman() (NOT auth.jwt() — no public RPC uses auth.jwt() today; fn_is_chairman accepts chairman/admin/owner; meta_role='admin' chairman user passes)",
          "A-3: Dual-state UPDATE: ventures.status='cancelled' AND ventures.workflow_status='killed' AND killed_at=now() AND kill_reason=p_rationale (status update is required to fire trg_ventures_update_sync_eva; without it eva_ventures.status drifts)",
          "Insert ventures_kill_log row: venture_id=p_venture_id, killed_by_user_id=auth.uid(), rationale=p_rationale, metadata={}",
          "A-2: Emit eva_events row with event_type='status_change' (already CHECK-accepted), event_source='kill_venture_rpc', event_data jsonb_build_object('type','venture.killed','venture_id',p_venture_id,'killed_by_user_id',auth.uid(),'rationale',p_rationale,'killed_at',now()), eva_venture_id=p_venture_id (eva_events does NOT have event_subtype column — discriminator goes inside event_data)",
          "A-5: Insert operations_audit_log row: entity_type='venture', entity_id=p_venture_id::text, action='kill', performed_by=auth.uid(), severity='warning', metadata=jsonb_build_object('rationale', p_rationale, 'sd_id', '5474573f-3fd9-43e5-8c9e-4584a0cedfdc')",
          "Returns ventures_kill_log.id (the kill_log row UUID)",
          "On role-check fail: RAISE EXCEPTION 'Only chairman or lead can reject a venture' (caught client-side as 403-equivalent error)"
        ]
      },
      {
        id: 'FR-4',
        requirement: "A-4 reconciliation: amend reject_chairman_decision RPC to also set ventures.workflow_status='killed' for kill-gate stages [3, 5, 13, 23], converging both kill paths to the same terminal state. Document semantic distinction in code comment.",
        acceptance_criteria: [
          "reject_chairman_decision body for kill_gate=true branches now sets BOTH status='cancelled' AND workflow_status='killed' (currently sets workflow_status='failed')",
          "Comment in function body: 'failed' = automated/system failure; 'killed' = chairman kill decision (both via reject_chairman_decision and direct kill_venture RPC)",
          "Migration includes regression test: insert chairman_decision for stage 23 venture, run reject_chairman_decision, assert workflow_status='killed' on the venture",
          "Existing callers of reject_chairman_decision continue to work without changes (return shape unchanged)"
        ]
      },
      {
        id: 'FR-5',
        requirement: "Stage23Renderer.tsx (NOT LaunchGateRenderer.tsx — that file is Stage 24 per its own header) hosts the Reject dialog with two-gate confirm UX.",
        acceptance_criteria: [
          "Reject button visible on Stage 23 (Post-Launch Operations Kill Gate) for chairman/lead role only (UI role hint; final enforcement in RPC)",
          "Click Reject opens shadcn/ui AlertDialog (or equivalent) with: (a) text input requiring exact 'REJECT' match (case-sensitive), (b) textarea requiring rationale length >= 20 chars, (c) 5-second cooldown timer that resets on each keystroke (disables Confirm button until 5s of inactivity)",
          "Confirm button styled with destructive variant (red) + AlertTriangle/AlertOctagon icon",
          "On Confirm: invokes Supabase RPC kill_venture(venture_id, rationale); on success shows toast 'Venture rejected'; navigates to /ventures",
          "On 403/role-fail: inline error 'Only chairman or lead can reject a venture'; ventures_kill_log row count unchanged",
          "ARIA labels: dialog has role='alertdialog' aria-labelledby; focus trap; Escape key closes (without confirming)"
        ]
      },
      {
        id: 'FR-6',
        requirement: "Backfill existing PrivacyPatrol AI kill row (currently in interim ventures.killed_at + ventures.kill_reason columns) into ventures_kill_log.",
        acceptance_criteria: [
          "Backfill query reads (killed_at IS NOT NULL, kill_reason) — does NOT filter on ventures.status (PrivacyPatrol AI is in inconsistent state status='active' workflow_status='pending' despite killed_at set; tolerance required)",
          "For PrivacyPatrol AI specifically: venture_id=08d20036-03c9-4a26-bbc5-f37a18dfdf23, killed_by_user_id=69c8aa7a-7661-48ed-9779-746fa6290873 (rickfelix2000@gmail.com), rationale=current kill_reason (length 123 chars satisfies CHECK len>=20), killed_at=current killed_at (2026-05-05T15:22:04.335Z), metadata={backfill_source:'SD-LEO-FIX-REVERT-CROSS-VENTURE-001'}",
          "After backfill: ventures.workflow_status='killed' AND ventures.status='cancelled' AND ventures_kill_log row count for that venture = 1",
          "Migration is idempotent: re-running does NOT duplicate the kill_log row (UNIQUE (venture_id) WHERE backfill_source IS NOT NULL OR explicit ON CONFLICT DO NOTHING based on killed_at match)"
        ]
      },
      {
        id: 'FR-7',
        requirement: "Vitest unit + integration test coverage for dialog UX, RPC contract, and backfill correctness.",
        acceptance_criteria: [
          "Vitest unit test for Stage23Renderer Reject dialog: cooldown timer (5s reset on keystroke); typed match validation (REJECT exact case-sensitive); rationale length check (>=20); error states (role-fail inline error)",
          "Integration test for kill_venture RPC: chairman role → success path with all 4 side-effects (ventures dual-state UPDATE, kill_log INSERT, eva_events INSERT, operations_audit_log INSERT); non-chairman → role-fail; rationale length=19 → CHECK violation rejected",
          "Integration test for reject_chairman_decision A-4 amendment: stage 23 venture + chairman_decision=reject → workflow_status='killed' (not 'failed')",
          "All tests pass in CI (Run Tests & Verify Stories check green)"
        ]
      }
    ],

    technical_requirements: [
      { id: 'TR-1', requirement: 'Migration uses defensive guards: ALTER TYPE ... ADD VALUE IF NOT EXISTS; CREATE TABLE IF NOT EXISTS; CREATE INDEX IF NOT EXISTS; DROP POLICY IF EXISTS / CREATE POLICY pattern.' },
      { id: 'TR-2', requirement: 'ALTER TYPE step is in a SEPARATE migration file from CREATE TABLE/RPC steps (Postgres restriction: ALTER TYPE ADD VALUE cannot run inside a transaction with other DDL).' },
      { id: 'TR-3', requirement: 'EHG migration applied via canonical Windows path: npx supabase db query --linked --file <path>. Avoid raw psql.' },
      { id: 'TR-4', requirement: 'kill_venture RPC uses SECURITY DEFINER + SET search_path = public; explicit grant: GRANT EXECUTE ON FUNCTION kill_venture(uuid, text) TO authenticated.' },
      { id: 'TR-5', requirement: 'EHG UI: use existing shadcn/ui AlertDialog primitives; no new dialog component. Cooldown via useState + useEffect; do not introduce a new state-management library.' },
      { id: 'TR-6', requirement: 'Cross-repo PR sequencing: PR-1 (EHG_Engineer migration + RPC + reject_chairman_decision amendment + backfill) MERGES FIRST; PR-2 (EHG UI) opens after PR-1 merged with explicit RPC dependency note in PR description.' },
      { id: 'TR-7', requirement: 'Both PRs include the SD-LEO-FEAT-STAGE-REJECT-KILL-001 scope key in branch name (feat/ prefix).' }
    ],

    system_architecture: {
      components: [
        { name: 'database/migrations/<timestamp>_extend_workflow_status_killed.sql', role: 'Standalone ALTER TYPE migration (Postgres transaction restriction)' },
        { name: 'database/migrations/<timestamp>_ventures_kill_log_and_rpc.sql', role: 'CREATE TABLE ventures_kill_log + RLS + kill_venture RPC + reject_chairman_decision A-4 amendment + PrivacyPatrol backfill (single transaction OK)' },
        { name: 'EHG: src/components/chairman-v3/gates/Stage23Renderer.tsx', role: 'Host Reject button + AlertDialog with typed match + rationale + cooldown' },
        { name: 'EHG: src/components/chairman-v3/gates/__tests__/Stage23Renderer.test.tsx', role: 'Vitest unit tests for dialog UX' },
        { name: 'EHG_Engineer: tests/integration/kill_venture_rpc.test.cjs', role: 'Integration tests for RPC contract + reject_chairman_decision A-4 reconciliation' }
      ],
      data_flow: 'Chairman opens Stage 23 → clicks Reject → AlertDialog enforces typed REJECT + ≥20-char rationale + 5s cooldown → Confirm calls supabase.rpc("kill_venture", { p_venture_id, p_rationale }) → RPC fn_is_chairman() check → dual-state UPDATE on ventures (status=cancelled, workflow_status=killed) → trg_ventures_update_sync_eva fires → eva_ventures.status mirrored → INSERT ventures_kill_log → INSERT eva_events (status_change + event_data.type=venture.killed) → INSERT operations_audit_log (action=kill, severity=warning) → return kill_log.id → toast "Venture rejected" → navigate /ventures.'
    },

    implementation_approach:
      'EXEC plan: (1) PR-1 (EHG_Engineer): create timestamped migration files in database/migrations/ — first file ALTER TYPE standalone, second file table+RPC+amendment+backfill. Apply via supabase db query --linked --file. Write integration test. Commit + PR. (2) Wait for PR-1 merge. (3) PR-2 (EHG): edit Stage23Renderer.tsx with Reject button + AlertDialog. Add useCooldown hook or inline. Wire onConfirm to supabase.rpc("kill_venture"). Add vitest. Commit + PR with note "depends on EHG_Engineer#XXXX". (4) Smoke test 6-step plan from SD smoke_test_steps. (5) EXEC-TO-PLAN handoff.',

    test_scenarios: [
      { id: 'TS-1', scenario: 'Migration idempotency', given: 'Clean DB; migration not yet applied', when: 'npx supabase db query --linked --file <migration1>; <migration2>; re-run both', then: 'No errors; second run reports zero changes; ventures.workflow_status enum still has killed; ventures_kill_log table still exists with RLS' },
      { id: 'TS-2', scenario: 'Chairman reject success path', given: 'Chairman signed in as rickfelix2000@gmail.com; venture in stage 23', when: 'Open Reject dialog, type REJECT, type "Insufficient market signal sustained" (≥20 chars), wait 5s, click Confirm', then: 'kill_venture invoked; toast shown; redirect to /ventures; venture.workflow_status=killed AND status=cancelled; ventures_kill_log has 1 new row; eva_events has 1 new row event_type=status_change with event_data.type=venture.killed; operations_audit_log has 1 new row action=kill' },
      { id: 'TS-3', scenario: 'Non-chairman blocked', given: 'Test user with meta_role NOT IN (chairman, admin, owner) signed in', when: 'Same flow as TS-2', then: 'RPC raises exception; UI shows inline error "Only chairman or lead can reject a venture"; no rows added to ventures_kill_log/eva_events/operations_audit_log; venture.workflow_status unchanged' },
      { id: 'TS-4', scenario: 'Two-gate UX enforcement', given: 'Chairman opens dialog', when: 'Type "REJ" (incomplete) + rationale 19 chars + wait 5s', then: 'Confirm button stays disabled; cannot submit; visible validation hints' },
      { id: 'TS-5', scenario: 'Cooldown timer', given: 'Chairman opens dialog with valid REJECT + ≥20-char rationale typed', when: 'Continuously type characters in rationale (resetting cooldown)', then: 'Confirm button stays disabled; only after 5s of no keystrokes does Confirm enable' },
      { id: 'TS-6', scenario: 'reject_chairman_decision A-4 reconciliation', given: 'Chairman_decision row created for stage 23 venture; venture.workflow_status=in_progress', when: 'Call reject_chairman_decision(decision_id, rationale, decided_by)', then: 'Venture.workflow_status=killed (NOT failed); venture.status=cancelled; chairman_decisions row updated' },
      { id: 'TS-7', scenario: 'PrivacyPatrol AI backfill', given: 'Migration with backfill block runs against current DB state where PrivacyPatrol AI has killed_at set + workflow_status=pending', when: 'Migration executes', then: 'ventures_kill_log has 1 row for PrivacyPatrol AI with metadata.backfill_source=SD-LEO-FIX-REVERT-CROSS-VENTURE-001, killed_at matches original; ventures.workflow_status=killed; status=cancelled; re-running migration does not duplicate the row' }
    ],

    risks: [
      { risk: 'R-1: workflow_status enum extension safety verified by database-agent (9 venture triggers, no conflicts, no partial indexes filtering on workflow_status). RETIRED at LEAD.', mitigation: 'No mitigation needed; risk eliminated by sub-agent inventory.' },
      { risk: 'R-3: Cross-repo coordination — DB migration in EHG_Engineer, UI in EHG. UI calling kill_venture RPC before migration applied = silent failure or hang.', mitigation: 'Two-PR sequence with explicit dependency note. PR-1 (EHG_Engineer migration) MUST merge first; PR-2 (EHG UI) opens after PR-1 merged. Add migration version assertion in UI E2E smoke test (kill_venture RPC must exist before UI ships).' },
      { risk: 'R-4: Semantic divergence between killed (chairman) and failed (reject_chairman_decision pre-amendment). Without A-4 amendment, two paths produce different terminal states for kill-gate decisions.', mitigation: 'A-4 amendment converges both paths to workflow_status=killed for kill-gate stages [3,5,13,23]. Code comment documents semantics: failed = automated/system failure; killed = chairman kill decision. Integration test TS-6 asserts convergence.' },
      { risk: 'R-5: PrivacyPatrol AI is in inconsistent state (killed_at set but status=active). Backfill must not assume status=cancelled.', mitigation: 'Backfill query reads (killed_at IS NOT NULL, kill_reason) only; does not filter on status. After backfill, dual-state UPDATE corrects the inconsistency. Documented in TS-7.' },
      { risk: 'R-6: 5-second cooldown timing tradeoff — too short = misclick risk; too long = chairman friction.', mitigation: '5s aligns with established destructive-UX patterns. Document as tunable in component props (REJECT_COOLDOWN_MS = 5000) for post-launch adjustment without code change. P3 priority — no blocking concern.' },
      { risk: 'R-7: SECURITY DEFINER RPC privilege escalation requires careful search_path. Function could be hijacked by malicious schema-search-path manipulation.', mitigation: 'SET search_path = public in function definition. database-agent confirmed fn_is_chairman uses this canonical pattern.' }
    ],

    acceptance_criteria: [
      'FR-1 through FR-7 all satisfied per their per-FR acceptance criteria',
      'Vitest unit + integration tests all pass (CI green)',
      'TS-1 through TS-7 smoke-tested manually before EXEC-TO-PLAN',
      'DESIGN sub-agent passes (destructive button, ARIA, focus trap, escape-to-close)',
      'SECURITY sub-agent passes (RLS, SECURITY DEFINER + search_path, fn_is_chairman role check)',
      'A05 enum drift sentinel green (event_type=status_change reused; no new enum value added)',
      'Cross-repo PR sequencing maintained: EHG_Engineer migration PR merged before EHG UI PR opens',
      'PrivacyPatrol AI backfill verified: ventures_kill_log row count=1 with metadata.backfill_source set',
      'LEAD-FINAL ≥85% (feature SD threshold)'
    ],

    stakeholder_personas: [
      { persona: 'Chairman (Solo Entrepreneur)', concerns: 'Need formal terminal state for venture rejection with audit log. Two-gate confirm prevents misclicks. Existing PrivacyPatrol AI kill (interim columns) is preserved and elevated to formal audit log.' },
      { persona: 'EHG Frontend Developers', concerns: 'Stage23Renderer.tsx is the correct host (NOT LaunchGateRenderer which is Stage 24). Reject button styling, cooldown timer, and role-based hints are clear from PRD.' },
      { persona: 'LEO Worker Sessions / Future RCAs', concerns: 'reject_chairman_decision and kill_venture both produce workflow_status=killed for kill-gate stages — no semantic split for downstream consumers to reason about. Audit log present in operations_audit_log AND ventures_kill_log AND eva_events.' }
    ]
  };

  try {
    const created = await createPRDWithValidatedContent(supabase, sdKey, sdKey, sdUuid, 'Stage 23 Reject UX (cross-repo, kill_venture RPC + ventures_kill_log + Stage23Renderer Reject dialog)', sdData, llmContent, llmContent.stakeholder_personas);
    console.log('PRD result:', JSON.stringify({ id: created?.id, status: created?.status }, null, 2));
  } catch (e) {
    console.error('PRD creation failed:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }
})();
