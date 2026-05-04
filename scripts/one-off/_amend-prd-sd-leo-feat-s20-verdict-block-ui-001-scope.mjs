#!/usr/bin/env node
/**
 * Amend PRD metadata.scope_amendment based on DESIGN + DATABASE sub-agent findings.
 *
 * DESIGN: Stage20CodeQuality.tsx already exists at src/components/stages/ — extend instead of new file at src/components/ventures/.
 *         Audit table is venture_audit_log not audit_log. Use centralized featureFlags.ts (s20VerdictBlock).
 *
 * DATABASE: code_quality_report table doesn't exist — compute verdict in code from venture_quality_findings rows.
 *           audit_log RLS forbids authenticated INSERT — must add SECURITY DEFINER RPC log_stage_advance_override(...).
 *           audit_log columns map: event_type='stage_advance_override', entity_type='venture', entity_id=venture_id::text,
 *           metadata={reason, verdict_snapshot, attempted_transition, stage_number, actor}.
 *           advance_venture_stage RPC kill/promo arrays do NOT include 20 — UX-only block (server doesn't enforce).
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

const PRD_ID = 'PRD-SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';

const scope_amendment = {
  reason: 'DESIGN + DATABASE sub-agent findings during PLAN phase revealed factual mismatches in the original SD scope. Pivoting to a buildable interpretation that preserves SD intent.',
  amended_at: new Date().toISOString(),
  resolutions: {
    'COND-1_verdict_source': {
      original: 'Read latest code_quality_report row for (venture_id, stage_number=20)',
      amended: 'Compute verdict in code from latest venture_quality_findings rows for the venture (no aggregated row exists). Verdict derivation: BLOCKED if any finding has finding_category=precondition; FAIL if any finding severity in (high,critical); WARN if any finding severity=medium; PASS if no FAIL/BLOCKED findings (or zero findings).',
      rationale: 'Parent SD-LEO-FEAT-STAGE-CODE-QUALITY-001 shipped venture_quality_findings + aggregator code but no aggregated code_quality_report row/table. Index coverage on venture_quality_findings supports this read pattern fully (no new index needed).'
    },
    'COND-2_audit_write_path': {
      original: 'Direct INSERT into audit_log from browser',
      amended: 'New SECURITY DEFINER public RPC log_stage_advance_override(p_venture_id uuid, p_reason text, p_verdict_snapshot jsonb) returning audit_log row id. Migration scoped to: CREATE FUNCTION + GRANT EXECUTE TO authenticated. RPC writes audit_log row with event_type=stage_advance_override, entity_type=venture, entity_id=venture_id::text, severity=warning, created_by=auth.uid(), metadata={reason, verdict_snapshot, attempted_transition:"20->21", stage_number:20, actor:auth.uid()}.',
      rationale: 'audit_log RLS only allows service_role INSERT. SECURITY DEFINER RPC is the canonical pattern for browser-initiated audit writes (per database-agent finding). Single-chokepoint design is easier to audit + constrains payload shape.'
    },
    'COND-3_tier_reclassification': {
      original: 'Tier 2 UI-only',
      amended: 'Tier 3 Full SD (already classified as feature with full LEAD-PLAN-EXEC). Migration is small (single CREATE FUNCTION + GRANT) but qualifies as schema change per CLAUDE.md risk keywords (migration). No reclassification action needed — SD is already Tier 3.',
      rationale: 'database-agent recommended reclassification per CLAUDE.md routing. SD is already Tier 3 (feature type, full workflow); only the documentation needs to acknowledge the migration scope.'
    },
    'COND-4_audit_column_mapping': {
      original: 'audit_log columns: action, actor, reason, verdict_snapshot, venture_id, stage_number, attempted_transition',
      amended: 'audit_log columns: event_type=stage_advance_override (replaces action), entity_type=venture (NEW), entity_id=venture_id::text (NEW), severity=warning, created_by=auth.uid() (replaces actor), metadata jsonb={reason, verdict_snapshot, attempted_transition:"20->21", stage_number:20, actor:auth.uid()::text}.',
      rationale: 'Actual audit_log schema differs from SD-context schema (verified by database-agent introspection). Using metadata jsonb to carry SD-domain fields preserves intent without schema change beyond the SECURITY DEFINER RPC.'
    },
    'DESIGN-1_component_path': {
      original: 'NEW Stage20VerdictPanel.tsx at src/components/ventures/',
      amended: 'EXTEND existing Stage20CodeQuality.tsx at src/components/stages/ with verdict-block UI surface (override CTA + Return-to-S19 CTA + advance-refusal hook). Existing component already renders advisoryData — wire latestS20Verdict from useVentureArtifacts into it.',
      rationale: 'design-agent flagged duplication risk: Stage20CodeQuality.tsx already renders verdict + severity-grouped findings from stageData.advisoryData. Extending preserves established mount-path convention (src/components/stages/) and avoids parallel implementations.'
    },
    'DESIGN-2_audit_table_correction': {
      original: 'audit_log table',
      amended: 'audit_log table (canonical name per database-agent introspection). Note: design-agent found 5 callsites in src/pages/api/v2/ using venture_audit_log; that is a different table. The override write target is audit_log (with the event_type=stage_advance_override mapping per COND-4).',
      rationale: 'Two tables exist. database-agent introspection of information_schema confirms audit_log is the canonical audit sink with event_type/entity_type/entity_id/metadata shape. venture_audit_log appears to be a domain-specific sibling.'
    },
    'DESIGN-3_feature_flag_centralization': {
      original: 'Direct env read of NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED',
      amended: 'Add s20VerdictBlock to src/constants/featureFlags.ts mirroring s17StallBanner pattern: { s20VerdictBlock: process.env.NEXT_PUBLIC_LEO_S20_VERDICT_BLOCK_ENABLED === "true" }. Consumers import from centralized helper.',
      rationale: 'Existing centralized typed-flag convention; s17StallBanner is the most recent precedent for default-OFF rollout flag.'
    },
    'KNOWN_LIMITATION_server_enforcement': {
      finding: 'advance_venture_stage RPC kill/promo arrays do NOT include stage 20 (kill=[3,5,13,24], promo=[17,18,23]). Server accepts any 20->21 transition unconditionally.',
      decision: 'Phase 1 (this SD): UX-only block via client-side advanceStage guard + override audit trail. Server-side enforcement deferred to follow-up SD against parent SD-LEO-FEAT-STAGE-CODE-QUALITY-001.',
      rationale: 'Adding stage 20 to RPC kill/promo arrays is parent-SD scope (the analyzer wired the verdict logic; server enforcement is the analyzers contract). UX-only block + audited override is sufficient for the chairman-as-only-operator model. Manual override audit trail is the primary integrity surface.'
    }
  },
  net_scope_impact: {
    files_modified_added: [
      'src/components/stages/Stage20CodeQuality.tsx (EXTEND — verdict-block UI surface)',
      'src/lib/ventures/advanceStage.ts (MODIFY — pre-RPC verdict-read + refusal logic)',
      'src/hooks/useVentureArtifacts.ts (MODIFY — latestS20Verdict selector)',
      'src/hooks/useStagePolicy.ts (MODIFY — code_quality_findings awareness)',
      'src/constants/featureFlags.ts (MODIFY — add s20VerdictBlock)',
      'src/components/stages/Stage20OverrideModal.tsx (NEW — modal UI)',
      'database/migrations/<date>_log_stage_advance_override_rpc.sql (NEW — SECURITY DEFINER RPC)'
    ],
    estimated_loc: '300-400 LOC src + 250-300 LOC tests (slightly above original 200-300 estimate due to migration + RPC client wiring)',
    test_additions: [
      'Vitest unit: advanceStage all 5 branches',
      'Vitest unit: useVentureArtifacts latestS20Verdict computation from venture_quality_findings',
      'Component test: Stage20CodeQuality extended verdict surface (4 states)',
      'Integration (HAS_REAL_DB): log_stage_advance_override RPC writes audit_log row',
      'Playwright E2E: panel render + override flow + flag toggle behavior'
    ]
  }
};

async function main() {
  if (!process.env.DISABLE_SSL_VERIFY) process.env.DISABLE_SSL_VERIFY = 'true';
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const r = await client.query(
      `UPDATE product_requirements_v2
       SET metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{scope_amendment}', $1::jsonb)
       WHERE id = $2
       RETURNING id, metadata->'scope_amendment' AS scope_amendment`,
      [JSON.stringify(scope_amendment), PRD_ID]
    );
    if (r.rows.length === 0) {
      console.error('[ERROR] PRD not found:', PRD_ID);
      process.exit(1);
    }
    console.log('[OK] PRD scope_amendment merged:');
    console.log(JSON.stringify(r.rows[0].scope_amendment.resolutions ? Object.keys(r.rows[0].scope_amendment.resolutions) : r.rows[0].scope_amendment, null, 2));
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(2);
  } finally {
    await client.end();
  }
}
main();
