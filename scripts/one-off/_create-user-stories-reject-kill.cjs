require('dotenv').config();

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sdKey = 'SD-LEO-FEAT-STAGE-REJECT-KILL-001';
  const sdUuid = '5474573f-3fd9-43e5-8c9e-4584a0cedfdc';

  const stories = [
    {
      story_key: `${sdKey}:US-001`,
      sd_id: sdUuid,
      title: 'Extend ventures.workflow_status enum with killed terminal state',
      user_role: 'system administrator',
      user_want: 'ventures.workflow_status to accept the value killed',
      user_benefit: 'kill decisions can be formally typed in the data model rather than expressed via ad-hoc text fields',
      acceptance_criteria: [
        'ALTER TYPE workflow_status_enum ADD VALUE IF NOT EXISTS killed applies clean',
        'Re-running migration is idempotent',
        'Existing rows untouched; existing views (v_active_ventures, v_archived_ventures) keep functioning',
        'Migration is in standalone file (Postgres restriction on ALTER TYPE inside transactions)'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: ['database/migrations/<ts>_extend_workflow_status_killed.sql'],
        files_to_modify: [],
        apis_to_use: ['npx supabase db query --linked --file'],
        test_strategy: 'Idempotency check: apply twice, expect zero changes on second run',
        technical_notes: 'Standalone migration file (Postgres ALTER TYPE ADD VALUE cannot run in a transaction with other DDL).'
      })
    },
    {
      story_key: `${sdKey}:US-002`,
      sd_id: sdUuid,
      title: 'Create ventures_kill_log audit table with RLS',
      user_role: 'system administrator',
      user_want: 'an append-only audit table for venture kills with RLS-controlled SELECT and RPC-only INSERT',
      user_benefit: 'kill decisions are auditable, write-protected, and queryable by chairman + the killer',
      acceptance_criteria: [
        'Table created with id UUID PK, venture_id FK CASCADE, killed_by_user_id FK auth.users, rationale TEXT NOT NULL CHECK length>=20, killed_at TIMESTAMPTZ DEFAULT now(), metadata JSONB',
        'Indexes on (venture_id) and (killed_at DESC)',
        'RLS enabled; SELECT policy USING fn_is_chairman() OR killed_by_user_id=auth.uid()',
        'No INSERT policy (writes only via SECURITY DEFINER kill_venture RPC privilege escalation)'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: ['database/migrations/<ts>_ventures_kill_log_and_rpc.sql'],
        files_to_modify: [],
        apis_to_use: [],
        test_strategy: 'Direct INSERT as authenticated user → fail (no INSERT policy); SELECT as chairman → all rows; SELECT as kill_log row owner → that row only',
        technical_notes: 'Defensive guards: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS / CREATE POLICY pattern.'
      })
    },
    {
      story_key: `${sdKey}:US-003`,
      sd_id: sdUuid,
      title: 'kill_venture RPC with all 5 LEAD-amendments (fn_is_chairman, dual-state, eva_events, audit_log)',
      user_role: 'chairman or lead',
      user_want: 'a single transactional kill_venture RPC that updates venture state, audit log, eva_events, and operations_audit_log atomically',
      user_benefit: 'kill decisions are atomic, auditable, and prevent direct UPDATE bypassing the audit log',
      acceptance_criteria: [
        'A-1: Role check via fn_is_chairman() (NOT auth.jwt())',
        'A-3: Dual-state UPDATE ventures.status=cancelled AND workflow_status=killed (status update fires trg_ventures_update_sync_eva to mirror eva_ventures)',
        'INSERT ventures_kill_log row with killed_by_user_id=auth.uid()',
        'A-2: Emit eva_events with event_type=status_change + event_data.type=venture.killed + eva_venture_id (no event_subtype column exists)',
        'A-5: INSERT operations_audit_log with entity_type=venture, action=kill, severity=warning',
        'Returns ventures_kill_log.id (UUID)',
        'On role-fail: RAISE EXCEPTION caught client-side as 403-equivalent'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: [],
        files_to_modify: ['database/migrations/<ts>_ventures_kill_log_and_rpc.sql'],
        apis_to_use: ['public.fn_is_chairman()', 'auth.uid()', 'jsonb_build_object'],
        test_strategy: 'Integration test in tests/integration/kill_venture_rpc.test.cjs: chairman role → success path with all 4 side-effects; non-chairman → role-fail; rationale length=19 → CHECK violation',
        technical_notes: 'SECURITY DEFINER + SET search_path = public. Single transaction wraps all 4 side-effect INSERTs (kill_log, ventures UPDATE triggers cascade).'
      })
    },
    {
      story_key: `${sdKey}:US-004`,
      sd_id: sdUuid,
      title: 'A-4 reconcile reject_chairman_decision RPC for kill-gate stages [3,5,13,23]',
      user_role: 'developer maintaining downstream consumers',
      user_want: 'reject_chairman_decision and kill_venture to converge on workflow_status=killed for kill-gate stages',
      user_benefit: 'one canonical terminal state to reason about; no semantic split between failed and killed for chairman kill decisions',
      acceptance_criteria: [
        'reject_chairman_decision body for kill_gate=true branches sets BOTH status=cancelled AND workflow_status=killed (currently sets workflow_status=failed)',
        'Code comment documents semantics: failed = automated/system failure; killed = chairman kill decision',
        'Integration test asserts convergence: chairman_decision for stage 23 venture → reject_chairman_decision → workflow_status=killed (not failed)',
        'Existing callers continue to work without changes (return shape unchanged)'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: [],
        files_to_modify: ['database/migrations/<ts>_ventures_kill_log_and_rpc.sql'],
        apis_to_use: [],
        test_strategy: 'TS-6 integration test in tests/integration/kill_venture_rpc.test.cjs',
        technical_notes: 'Add CREATE OR REPLACE FUNCTION reject_chairman_decision(...) statement in same migration; one-line body change for kill_gate branches.'
      })
    },
    {
      story_key: `${sdKey}:US-005`,
      sd_id: sdUuid,
      title: 'Stage23Renderer.tsx Reject dialog with typed match + rationale + 5s cooldown',
      user_role: 'chairman',
      user_want: 'a Reject button on Stage 23 with a two-gate confirm dialog (typed REJECT + ≥20-char rationale + 5s cooldown + destructive styling)',
      user_benefit: 'I cannot accidentally kill a venture via misclick; rationale is captured for audit trail',
      acceptance_criteria: [
        'Reject button visible on Stage 23 (Post-Launch Operations Kill Gate) for chairman/lead',
        'AlertDialog with text input for typed REJECT match (case-sensitive) + textarea for rationale (length>=20) + 5s cooldown that resets on each keystroke',
        'Confirm button styled destructive (red) + AlertOctagon icon',
        'On confirm: invokes supabase.rpc kill_venture; success toast + redirect to /ventures',
        'On 403/role-fail: inline error Only chairman or lead can reject a venture',
        'ARIA: alertdialog role + focus trap + Escape closes (without confirming)'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: ['ehg/src/components/chairman-v3/gates/__tests__/Stage23Renderer.test.tsx'],
        files_to_modify: ['ehg/src/components/chairman-v3/gates/Stage23Renderer.tsx'],
        apis_to_use: ['shadcn/ui AlertDialog', 'supabase.rpc(kill_venture, ...)', 'useState', 'useEffect', 'useToast'],
        test_strategy: 'Vitest unit test: cooldown timer, typed match, rationale length, error states',
        technical_notes: 'NOT LaunchGateRenderer.tsx — that is Stage 24 per its own header. Stage23Renderer.tsx is the correct host (validation-agent confirmed).'
      })
    },
    {
      story_key: `${sdKey}:US-006`,
      sd_id: sdUuid,
      title: 'Backfill PrivacyPatrol AI from interim columns into ventures_kill_log',
      user_role: 'system administrator',
      user_want: 'the existing PrivacyPatrol AI kill row (interim columns) backfilled into ventures_kill_log',
      user_benefit: 'the historical kill is recorded in the formal audit log alongside future kills',
      acceptance_criteria: [
        'Backfill query reads (killed_at IS NOT NULL, kill_reason); does NOT filter on ventures.status (PrivacyPatrol AI is in inconsistent state)',
        'PrivacyPatrol AI: venture_id=08d20036-03c9-4a26-bbc5-f37a18dfdf23, killed_by_user_id=69c8aa7a-7661-48ed-9779-746fa6290873, rationale=current kill_reason (length 123 satisfies CHECK)',
        'After backfill: ventures.workflow_status=killed AND ventures.status=cancelled',
        'metadata.backfill_source=SD-LEO-FIX-REVERT-CROSS-VENTURE-001',
        'Re-running migration does NOT duplicate (ON CONFLICT DO NOTHING based on metadata.backfill_source)'
      ],
      priority: 'medium',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: [],
        files_to_modify: ['database/migrations/<ts>_ventures_kill_log_and_rpc.sql'],
        apis_to_use: [],
        test_strategy: 'TS-7 smoke test: run migration, query ventures_kill_log for PrivacyPatrol AI, assert row count=1 with backfill_source metadata',
        technical_notes: 'Idempotency via WHERE NOT EXISTS subquery filtering on metadata->>backfill_source.'
      })
    },
    {
      story_key: `${sdKey}:US-007`,
      sd_id: sdUuid,
      title: 'Vitest unit + integration test coverage for Reject UX and RPC contract',
      user_role: 'developer',
      user_want: 'vitest unit tests for the dialog and integration tests for the RPC contract + A-4 reconciliation',
      user_benefit: 'regressions are caught in CI before merging',
      acceptance_criteria: [
        'Vitest unit test for Stage23Renderer Reject dialog (cooldown, typed match, rationale length, error states)',
        'Integration test for kill_venture RPC: 4 side-effects on success path; role-fail path; CHECK violation path',
        'Integration test for reject_chairman_decision A-4: stage 23 venture → workflow_status=killed (not failed)',
        'All tests pass in CI (Run Tests & Verify Stories check green)'
      ],
      priority: 'high',
      status: 'ready',
      implementation_context: JSON.stringify({
        files_to_create: ['ehg/src/components/chairman-v3/gates/__tests__/Stage23Renderer.test.tsx', 'tests/integration/kill_venture_rpc.test.cjs'],
        files_to_modify: [],
        apis_to_use: ['vitest', '@testing-library/react'],
        test_strategy: 'Run npx vitest run on each test file; verify 100% pass; verify in CI logs',
        technical_notes: 'Tests should mock supabase.rpc for unit tests but use real Supabase client for integration tests (test schema or production with rollback).'
      })
    }
  ];

  let inserted = 0;
  for (const story of stories) {
    const { error } = await supabase.from('user_stories').insert(story);
    if (error) {
      console.error(`Insert ${story.story_key} failed:`, error.message);
      process.exit(1);
    }
    inserted++;
  }
  console.log(`Inserted ${inserted}/${stories.length} user stories.`);
})();
