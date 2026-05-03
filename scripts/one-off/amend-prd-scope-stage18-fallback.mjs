#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PRD_ID = 'PRD-SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const scope_amendment = {
  recorded_at: new Date().toISOString(),
  source: 'PLAN-phase sub-agent evidence (DESIGN e5773b9c-b74d-48b5-a164-ce1f63cb6159, DATABASE c77d3635-e873-4f25-878f-b8ca1ea7dd0c)',
  amendments: [
    {
      fr: 'FR-1',
      action: 'simplify',
      from: 'analyzer exposes per-section _isFallback marker on each of 9 sections',
      to: 'analyzer continues using existing batch-level result.metadata.llmFallbackCount; no per-section marker needed',
      reason: 'DATABASE C1: llmFallbackCount is batch-scoped (0|1 for all 9 sections). Current analyzer is all-or-nothing — buildFallbackCopy returns ALL 9 sections as fallback in the catch/invalid-JSON branch; LLM success returns ALL 9 from real LLM. There is no partial-fallback case. Per-section marker is over-engineering for a non-existent state. Keep batch flag.',
      impact: 'Reduces backend code change to 1-3 LOC in stage-18-marketing-copy.js (no buildFallbackCopy modification needed)'
    },
    {
      fr: 'FR-3',
      action: 'reframe',
      from: 'Frontend reads metadata.is_fallback from each venture_artifacts row',
      to: 'Frontend reads advisory.metadata.llmFallbackCount from the existing /api/stage18/:ventureId/generate-copy response; renders amber Fallback Badge on ALL 9 sections when llmFallbackCount > 0',
      reason: 'DATABASE C2: Stage18MarketingCopy.tsx does NOT query venture_artifacts directly. It receives advisory data from the API response (which already includes result.metadata.llmFallbackCount). No new query path required.',
      impact: 'Smaller frontend change. No need to extend Supabase query types. Read existing advisory.metadata.llmFallbackCount.'
    },
    {
      fr: 'FR-4',
      action: 'drop_and_replace',
      from: 'Disable venture-level Promote control when any section is_fallback=true; tooltip explains',
      to: 'Render warning Alert above the section grid (matching existing isLlmUnavailable Alert pattern at lines 421-450) when advisory.metadata.llmFallbackCount > 0. Alert text reuses the amber-token pattern. No control disabled because no Promote button exists in current UI.',
      reason: 'DESIGN finding #3 CONCERN: grep confirmed no Promote button in Stage18 or any sibling stage. Only surfaces are informational GateBanner (decision-driven label only), Generate Copy, and per-section Regenerate. FR-4 cannot disable a button that does not exist. Visual warning Alert achieves the same silent-failure prevention without requiring a new Promote button (out of scope) or backend gate-decision change (out of scope).',
      impact: 'Reduces scope. Adds ~10 LOC for warning Alert. Removes complexity around tooltip/disabled state on a non-existent control.'
    },
    {
      fr: 'FR-5',
      action: 'clarify',
      from: 'Backfill migration in scripts/migrations/',
      to: 'Backfill at scripts/one-off/backfill-stage18-marketing-fallback-flag.mjs',
      reason: 'DATABASE C3: data-only fix on a single test-fixture venture; will not exist in fresh deployments; matches PRD Node-for-re-runnability guidance.',
      impact: 'Path correction; no scope change'
    },
    {
      fr: 'FR-6',
      action: 'keep',
      reason: 'Still valid: runtime detection uses canonical metadata.is_fallback (from FR-2 backend write), NOT text-substring at render time. Backfill (FR-5) is the only place text-substring matching is used (one-time cleanup of pre-fix rows).'
    }
  ],
  net_scope_change: '~30% reduction in EXEC scope. Removes per-section analyzer changes, removes Promote-button gating UX, simplifies frontend to read existing advisory.metadata field.',
  followup_sds_to_consider: [
    'Add explicit Promote button surface to Stage 18 with fallback-gating (currently no such button exists; informational GateBanner only). Tier 2 enhancement.',
    'Per-section partial fallback support if buildFallbackCopy ever evolves to mix real-LLM and fallback sections. Currently all-or-nothing.'
  ],
  audit_log_insert_template: {
    event_type: 'stage18_marketing_fallback_backfill',
    entity_type: 'venture_artifact_batch',
    entity_id: '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
    new_value: { row_count: 9, is_fallback_set_to: true },
    metadata: {
      sd_key: 'SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001',
      prd_id: 'PRD-SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001',
      fr: 'FR-5',
      ac: 'AC-3',
      venture_id: '08d20036-03c9-4a26-bbc5-f37a18dfdf23',
      artifact_type_filter: 'marketing_%',
      is_current_filter: true,
      executed_via: 'scripts/one-off/backfill-stage18-marketing-fallback-flag.mjs'
    },
    severity: 'info',
    created_by: 'database-agent:SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001'
  }
};

const sel = await supabase.from('product_requirements_v2').select('metadata').eq('id', PRD_ID).single();
const merged = { ...(sel.data?.metadata || {}), scope_amendment };
const upd = await supabase.from('product_requirements_v2').update({ metadata: merged }).eq('id', PRD_ID).select('id').single();
if (upd.error) {
  console.error('amend failed:', upd.error.message);
  process.exit(1);
}
console.log('PRD', upd.data.id, 'scope_amendment recorded with', scope_amendment.amendments.length, 'amendments');
console.log('Net scope change:', scope_amendment.net_scope_change);
