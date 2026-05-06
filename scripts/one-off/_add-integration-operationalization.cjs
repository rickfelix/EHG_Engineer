require('dotenv').config();

(async () => {
  const { createClient } = require('@supabase/supabase-js');
  const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const integration_operationalization = {
    consumers: [
      { name: 'EHG Stage23Renderer Reject button', interaction: 'Calls supabase.rpc kill_venture(p_venture_id, p_rationale) on confirm; receives kill_log.id UUID on success or PG exception on role-fail' },
      { name: 'reject_chairman_decision RPC (existing)', interaction: 'A-4 amendment: kill-gate stages [3,5,13,23] now write workflow_status=killed (was failed); chairman_decisions table flow continues unchanged externally' },
      { name: 'eva_events stream consumers (chairman_dashboard, OKR scorecards)', interaction: 'New rows with event_type=status_change + event_data.type=venture.killed; downstream filters on event_data.type for kill-specific reactions' },
      { name: 'eva_ventures.status mirror via trg_ventures_update_sync_eva', interaction: 'A-3 dual-state UPDATE on ventures.status fires the existing trigger; eva_ventures.status mirrored automatically' },
      { name: 'operations_audit_log governance dashboard', interaction: 'New rows with entity_type=venture, action=kill, severity=warning' }
    ],
    dependencies: [
      { name: 'public.fn_is_chairman()', type: 'SECURITY DEFINER helper', usage: 'Role check in kill_venture RPC body (A-1 amendment uses this instead of auth.jwt)' },
      { name: 'auth.users(id)', type: 'FK target', usage: 'ventures_kill_log.killed_by_user_id REFERENCES auth.users(id); A-9: ON DELETE = NO ACTION (Postgres default)' },
      { name: 'public.ventures', type: 'FK target', usage: 'ventures_kill_log.venture_id REFERENCES ventures(id) ON DELETE CASCADE' },
      { name: 'public.workflow_status_enum', type: 'enum', usage: 'Extended with killed value (additive, irreversible per Postgres ALTER TYPE limitation)' },
      { name: 'trg_ventures_update_sync_eva', type: 'AFTER UPDATE trigger on ventures', usage: 'A-3 dual-state UPDATE fires this; A-8 ordering ensures eva_ventures synced before kill_venture emits eva_events' },
      { name: 'public.operations_audit_log', type: 'governance audit table', usage: 'A-5 amendment: kill_venture writes one row per kill (entity_type=venture, action=kill, severity=warning); A-10: performed_at is TIMESTAMP WITHOUT TIME ZONE legacy schism' },
      { name: 'shadcn/ui AlertDialog primitive (EHG)', type: 'Radix-backed component', usage: 'Hosts Reject dialog with built-in role=alertdialog, focus trap, aria-labelledby, Escape semantics' }
    ],
    data_contracts: {
      kill_venture_rpc: {
        input: { p_venture_id: 'UUID NOT NULL', p_rationale: 'TEXT length>=20 CHECK enforced at DB' },
        output: 'UUID (the new ventures_kill_log.id row)',
        side_effects_a8_ordered: [
          '(1) UPDATE ventures SET status=cancelled, workflow_status=killed, killed_at=now(), kill_reason=p_rationale',
          '(2) INSERT ventures_kill_log row',
          '(3) INSERT eva_events row (event_type=status_change, event_data jsonb with type=venture.killed, eva_venture_id)',
          '(4) INSERT operations_audit_log row',
          'On role-fail: RAISE EXCEPTION caught client-side as 403-equivalent; no rows written'
        ]
      },
      ventures_kill_log_table: {
        columns: 'id UUID PK, venture_id UUID FK CASCADE, killed_by_user_id UUID FK auth.users NULLABLE (A-6 for legacy backfill), rationale TEXT NOT NULL CHECK length>=20, killed_at TIMESTAMPTZ DEFAULT now(), metadata JSONB',
        rls: 'SELECT USING (fn_is_chairman() OR killed_by_user_id = auth.uid()); no INSERT policy (writes only via SECURITY DEFINER RPC privilege escalation)'
      },
      eva_events_emit: {
        event_type: 'status_change (existing CHECK-accepted; A-2 reuses this rather than adding new enum value)',
        event_source: 'kill_venture_rpc',
        event_data: '{ type: venture.killed, venture_id, killed_by_user_id, rationale, killed_at }',
        eva_venture_id: 'venture_id (audit linkage)'
      },
      reject_chairman_decision_amendment: {
        input_unchanged: '{ p_decision_id, p_rationale, p_decided_by }',
        output_unchanged: 'jsonb { success, decision_id, venture_id, lifecycle_stage, new_status, is_kill_gate, source }',
        body_change: 'For kill_gate stages [3,5,13,23]: workflow_status now set to killed (was failed). status remains cancelled.'
      }
    },
    runtime_config: {
      feature_flags: 'NONE — UI Reject button gated client-side by role check (defense-in-depth UX hint); RPC fn_is_chairman is the security boundary',
      environment_variables: 'NONE',
      tunable_props: {
        REJECT_COOLDOWN_MS: { default: 5000, location: 'ehg/src/components/chairman-v3/gates/RejectVentureDialog.tsx component prop', purpose: 'Adjustable cooldown duration; per R-6 risk mitigation' }
      },
      grant_required: 'GRANT EXECUTE ON FUNCTION public.kill_venture(uuid, text) TO authenticated'
    },
    observability_rollout: {
      monitoring: {
        primary_metric: 'ventures_kill_log row count over 30 days — chairman dashboard widget',
        reconciliation: 'eva_events with event_data.type=venture.killed count must equal ventures_kill_log row count (cron-able query)',
        error_rate_target: 'kill_venture RPC error rate < 5 percent (legitimate role-fails expected and not errors); Supabase logs'
      },
      common_issues: [
        '403 inline error: user meta_role not in (chairman,admin,owner); fix via raw_user_meta_data update',
        'Cooldown never enables: continuous keystrokes reset 5s timer; visible countdown signals time remaining',
        'CHECK violation on rationale: length<20; UI client-side prevents this (DB log indicates direct API bypass)',
        'eva_ventures.status not updated: kill_venture missed A-3 dual-state UPDATE; verify migration body'
      ],
      rollout_strategy: {
        sequencing: 'Two-PR cross-repo: PR-1 (EHG_Engineer) ships migrations + RPC + amendment + backfill; PR-2 (EHG) ships UI + tests. PR-1 MUST merge and migration apply BEFORE PR-2 opens. PR-2 description references PR-1 commit SHA + migration applied date.',
        rollout: 'Migration is additive only. Zero downtime; no maintenance window.',
        verification: 'Playwright E2E (per TESTING GAP-7 BLOCKING) asserts kill_venture RPC exists; if missing the E2E fails fast and PR-2 not mergeable until migration applied'
      },
      rollback_plan: 'DROP TABLE ventures_kill_log CASCADE; DROP FUNCTION kill_venture(uuid,text); CREATE OR REPLACE FUNCTION reject_chairman_decision with prior body. ALTER TYPE ADD VALUE killed cannot be removed (Postgres limitation) — orphan enum value harmless. Backfill rollback: UPDATE ventures SET workflow_status=pending, status=active WHERE id=08d20036-...; DELETE FROM ventures_kill_log WHERE venture_id=08d20036-...'
    }
  };

  const { data, error } = await s.from('product_requirements_v2').update({ integration_operationalization }).eq('sd_id','5474573f-3fd9-43e5-8c9e-4584a0cedfdc').select('id').single();
  if (error) {
    console.error('Update failed:', error);
    process.exit(1);
  }
  console.log('integration_operationalization added:', data?.id);
})();
