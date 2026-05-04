import { createDatabaseClient } from '../lib/supabase-connection.js';

const PRD_ID = 'PRD-SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';

const integration_operationalization = {
  consumers: [
    { who: 'Chairman (operator)', user_journey: 'Views Stage 20 venture detail page; sees verdict badge + findings list; attempts S20->S21 advance; if blocked, optionally provides override reason and resumes.' },
    { who: 'Stage20CodeQuality.tsx component (existing)', user_journey: 'Extended to render verdict-block UI surface using latestS20Verdict from useVentureArtifacts hook.' },
    { who: 'Audit reviewers (chairman dashboard)', user_journey: 'Reviews stage_advance_override audit_log entries via existing chairman dashboard surfacing.' }
  ],
  dependencies: {
    upstream: [
      { name: 'venture_quality_findings table', source: 'SD-LEO-FEAT-STAGE-CODE-QUALITY-001 (parent)', status: 'shipped', notes: 'Existing rows; verdict computed in code from latest rows per (venture_id, stage_number=20)' },
      { name: 'audit_log table + RLS', source: 'pre-existing infrastructure', status: 'shipped', notes: 'event_type/entity_type/entity_id/metadata schema; service_role-only RLS forces SECURITY DEFINER RPC pattern' },
      { name: 'advance_venture_stage RPC', source: 'pre-existing infrastructure', status: 'shipped', notes: 'No signature change; kill/promo arrays do NOT include stage 20 (UX-only enforcement, server allows any 20->21)' },
      { name: 'src/components/stages/Stage20CodeQuality.tsx', source: 'EHG repo', status: 'exists', notes: 'Extended (not replaced) with verdict-block UI surface' },
      { name: 'src/constants/featureFlags.ts', source: 'EHG repo', status: 'exists', notes: 'New s20VerdictBlock entry mirrors s17StallBanner pattern' },
      { name: 'src/hooks/useVentureArtifacts.ts + useStagePolicy.ts', source: 'EHG repo', status: 'exists', notes: 'Hooks extended with code_quality_findings awareness + latestS20Verdict selector' }
    ],
    downstream: [
      { name: 'Chairman dashboard (audit_log surfacing)', impact: 'New event_type=stage_advance_override rows visible; chairman can review override frequency + reasons' },
      { name: 'Stage 21 (Distribution) workflow', impact: 'May see ventures arriving with quality verdict=FAIL when override was used; Stage 21 should not assume S20 PASS' },
      { name: 'Future server-side enforcement SD', impact: 'Phase 2 follow-up SD will add stage 20 to advance_venture_stage RPC kill array; this SD ships UX-only block as Phase 1' }
    ]
  },
  data_contracts: {
    reads: [
      {
        source: 'venture_quality_findings (table)',
        query_pattern: 'SELECT * FROM venture_quality_findings WHERE venture_id=? AND stage_number=20 ORDER BY created_at DESC',
        fields_consumed: ['id', 'venture_id', 'stage_number', 'finding_category', 'severity', 'finding_message', 'remediation_sd_id', 'created_at'],
        verdict_derivation: 'Computed in code: BLOCKED if any finding finding_category=precondition; FAIL if any severity in (high,critical); WARN if any severity=medium; PASS otherwise (incl. zero rows)'
      }
    ],
    writes: [
      {
        target: 'audit_log (via SECURITY DEFINER RPC log_stage_advance_override)',
        rpc_signature: 'log_stage_advance_override(p_venture_id uuid, p_reason text, p_verdict_snapshot jsonb) RETURNS uuid',
        fields_written: {
          event_type: '"stage_advance_override" (literal)',
          entity_type: '"venture" (literal)',
          entity_id: 'p_venture_id::text',
          severity: '"warning" (literal)',
          created_by: 'auth.uid()::text',
          metadata: '{reason: p_reason, verdict_snapshot: p_verdict_snapshot, attempted_transition: "20->21", stage_number: 20, actor: auth.uid()::text}'
        }
      }
    ],
    rpc_invocations: [
      { name: 'advance_venture_stage', when: 'After verdict-read guard passes (or override path completes)', signature: 'unchanged from parent SD' }
    ]
  },
  runtime_config: {
    feature_flags: [
      {
        name: 'NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED',
        type: 'boolean (string "true" enables)',
        default: 'false (OFF)',
        consumed_by: 'src/constants/featureFlags.ts as s20VerdictBlock; advanceStage refusal logic',
        scope: 'Build-time (Vite NEXT_PUBLIC_* env var inlined into bundle)',
        rollout_phases: '1) ship UI flag OFF; 2) enable for canary venture 7d observation; 3) portfolio-wide enable'
      }
    ],
    environment_requirements: [
      { env: 'EHG production', requirement: 'No additional secrets; flag controlled via Vercel env var; SECURITY DEFINER RPC must be migrated before flag enable' },
      { env: 'EHG staging', requirement: 'Flag can be enabled for E2E testing; HAS_REAL_DB sentinel gates integration tests' }
    ],
    deployment_sequence: [
      '1. Apply migration: log_stage_advance_override RPC + GRANT EXECUTE TO authenticated',
      '2. Deploy EHG frontend with flag=false (verdict surfaces informationally)',
      '3. Verify panel renders + override modal works on canary',
      '4. Enable flag for canary venture; observe 7 days',
      '5. Portfolio-wide enable'
    ]
  },
  observability_rollout: {
    metrics: [
      { metric: 'audit_log rows per day with event_type=stage_advance_override', target: '<5/week (override should be rare)', alert: 'If >10/week, indicates analyzer false-positive rate is too high' },
      { metric: 'Stage 20 verdict distribution (PASS/WARN/FAIL/BLOCKED counts)', target: '>80% PASS', alert: 'If FAIL rate >25%, parent SD analyzer rules need review' },
      { metric: 'Advance refusal events (S20->S21 blocked)', target: 'Track for trend baseline', alert: 'Monitor first 30 days post-flag-enable for unexpected spikes' }
    ],
    logging: [
      'Client-side: console.warn on verdict refusal with structured fields (venture_id, verdict, findings_summary)',
      'Server-side: log_stage_advance_override RPC writes to audit_log (durable trail)',
      'No PII in logs (verdict_snapshot is venture-domain data, not user PII)'
    ],
    rollout_phases: [
      { phase: 'Phase 1: ship UI', flag_state: 'OFF', success_criteria: 'Panel renders for all S20 ventures; advance proceeds normally; no audit_log overrides' },
      { phase: 'Phase 2: canary enable', flag_state: 'ON for 1 venture', success_criteria: 'At least 5 advance attempts observed; refusal logic correct; override path works end-to-end' },
      { phase: 'Phase 3: portfolio enable', flag_state: 'ON for all ventures', success_criteria: 'Override rate <5/week; chairman dashboard shows override audit trail' }
    ],
    rollback_plan: {
      trigger: 'Flag-on causes >5 false-positive blocks within 24h, or audit_log write errors >1%',
      action: 'Set NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED=false in Vercel; redeploy. Verdict + findings continue to render (no UI rollback needed); only refusal logic disengages.',
      revert_pr_target: 'Same EHG repo PR; `git revert` reverses migration if needed (RPC drop)',
      max_blast_radius: 'EHG frontend + 1 RPC; no schema changes outside RPC; no data loss'
    }
  }
};

async function main() {
  if (!process.env.DISABLE_SSL_VERIFY) process.env.DISABLE_SSL_VERIFY = 'true';
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const r = await client.query(
      `UPDATE product_requirements_v2
       SET integration_operationalization = $1::jsonb
       WHERE id = $2
       RETURNING id, (SELECT jsonb_agg(k) FROM jsonb_object_keys(integration_operationalization) k) AS keys`,
      [JSON.stringify(integration_operationalization), PRD_ID]
    );
    console.log('[OK] integration_operationalization populated');
    console.log('Subsections:', r.rows.map(row => row.keys));
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(2);
  } finally {
    await client.end();
  }
}
main();
