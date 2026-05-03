#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '42c60c0c-4156-428f-ab19-9f8bad01d271';
const SD_KEY = 'SD-LEO-FIX-STAGE18-SILENT-FALLBACK-001';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    sd_id: SD_UUID,
    title: 'Surface LLM fallback origin in Stage 18 marketing copy badges',
    user_role: 'Solo entrepreneur (chairman) reviewing Stage 18 marketing copy',
    user_want: 'each section card to clearly indicate when its content came from the LLM-fallback path versus a successful LLM generation',
    user_benefit: 'I can immediately spot placeholder copy and avoid promoting a venture with fake marketing content to production',
    acceptance_criteria: [
      'When advisory.metadata.llmFallbackCount > 0 (LLM was unavailable), every section card shows an amber Fallback badge instead of the default Generated badge',
      'When advisory.metadata.llmFallbackCount === 0 (real LLM succeeded), section cards show the existing default Generated badge unchanged (regression guard)',
      'Pending sections continue to render the existing outline Pending badge regardless of fallback state',
      'The amber Fallback badge has aria-label="Fallback content from LLM unavailability" and uses the existing amber-token pattern (border-amber-500/50 bg-amber-500/10 text-amber-700) so color is not the only signal',
      'data-testid="stage18-fallback-badge-{section}" is present on each fallback badge so smoke tests can assert presence/absence'
    ],
    implementation_context: 'Edit ehg/src/components/stages/Stage18MarketingCopy.tsx lines 527-529 to render a three-state Badge: amber Fallback when advisory.metadata.llmFallbackCount > 0, default Generated when llmFallbackCount === 0 and hasContent, outline Pending otherwise. Reuse the className tuple from the isLlmUnavailable Alert at lines 423-426. Do NOT introduce a new shadcn Badge variant. Tier 2 frontend change, ~15-25 src LOC + 30-50 test LOC.',
    status: 'ready'
  },
  {
    story_key: `${SD_KEY}:US-002`,
    sd_id: SD_UUID,
    title: 'Show warning Alert above section grid when fallback content present',
    user_role: 'Solo entrepreneur reviewing Stage 18 after a Generate Copy run that hit LLM unavailability',
    user_want: 'a single, prominent warning at the top of the section grid stating that the marketing copy is from the fallback path',
    user_benefit: 'I do not need to scan all 9 sections to detect the silent failure mode — the warning surfaces at the top of the screen and recommends regenerating before promoting',
    acceptance_criteria: [
      'When advisory.metadata.llmFallbackCount > 0, an Alert renders above the section card grid (after the summary metrics, before the section grid)',
      'Alert reuses the existing isLlmUnavailable amber styling pattern (lines 421-450 of Stage18MarketingCopy.tsx)',
      'Alert text reads: "Marketing copy generated from LLM-fallback path. Regenerate sections before promoting this venture." (concise, no exclamation)',
      'Alert is dismissible-or-not consistent with the existing isLlmUnavailable Alert pattern; uses AlertTriangle icon',
      'data-testid="stage18-fallback-warning-alert" is present',
      'When llmFallbackCount === 0, no Alert renders (no false positives, no regression of normal flow)'
    ],
    implementation_context: 'Add a second Alert block in Stage18MarketingCopy.tsx, reusing the conditional pattern at lines 420-451. Place after the summary metrics div (line 488) and before the section card grid (line 499). Reuse Alert, AlertTitle, AlertDescription, AlertTriangle imports already in the file. Replaces the original FR-4 of disabling a Promote button — that button does not exist, so a visual warning Alert is the correct surface for the silent-failure prevention. Tier 2 frontend change, ~10-15 src LOC.',
    status: 'ready'
  },
  {
    story_key: `${SD_KEY}:US-003`,
    sd_id: SD_UUID,
    title: 'Persist fallback origin to venture_artifacts so backfill and audit can reconstruct it',
    user_role: 'Database administrator or future operator reviewing historical marketing artifacts',
    user_want: 'each marketing_* row in venture_artifacts to carry metadata.is_fallback so the fallback origin can be queried directly without parsing artifact text',
    user_benefit: 'I can run SQL queries to count fallback artifacts across ventures, audit the silent-failure incident, and the existing 9 PrivacyPatrol AI rows can be backfilled correctly',
    acceptance_criteria: [
      'storeMarketingArtifacts in server/routes/stage18.js writes metadata: { is_fallback: boolean } on every inserted row, derived from result.metadata.llmFallbackCount > 0',
      'POST /:ventureId/regenerate/:section also writes metadata.is_fallback on the regenerated row',
      'For real-LLM rows, metadata.is_fallback is explicitly false (not omitted) so consumers can rely on the field existing',
      'Vitest unit covers both routes: success path writes is_fallback=false; fallback path writes is_fallback=true; mark-old-as-not-current pattern preserved',
      'A scoped backfill at scripts/one-off/backfill-stage18-marketing-fallback-flag.mjs sets metadata.is_fallback=true on the 9 existing PrivacyPatrol AI rows (venture_id=08d20036-03c9-4a26-bbc5-f37a18dfdf23, artifact_type LIKE marketing_%, is_current=true) — idempotent, single transaction, with audit_log row of count 9'
    ],
    implementation_context: 'Backend: extend the inserts at server/routes/stage18.js lines 59-66 (storeMarketingArtifacts) and lines 155-161 (regenerate) to include metadata: { is_fallback: copyResult.metadata?.llmFallbackCount > 0 }. Backfill: COALESCE(metadata, {}) || {is_fallback:true} jsonb merge for the 9 PrivacyPatrol AI rows; audit_log INSERT shape is documented in PRD metadata.scope_amendment.audit_log_insert_template. Tier 2 backend change, ~5-10 src LOC + 50-80 test LOC + 30-50 backfill LOC.',
    status: 'ready'
  }
];

const { data, error } = await supabase
  .from('user_stories')
  .insert(stories)
  .select('story_key, status');

if (error) {
  console.error('insert failed:', error.message);
  console.error('details:', error);
  process.exit(1);
}

console.log('inserted', data.length, 'user stories:');
for (const s of data) console.log(' -', s.story_key, '(' + s.status + ')');
