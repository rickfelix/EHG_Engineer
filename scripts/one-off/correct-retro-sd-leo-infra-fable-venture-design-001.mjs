#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RETRO_ID = '3fe2f41a-2148-407c-9719-abaa2dee64ed';

const { data: current, error: fetchErr } = await supabase
  .from('retrospectives')
  .select('what_went_well, what_needs_improvement, key_learnings, action_items')
  .eq('id', RETRO_ID)
  .single();
if (fetchErr) { console.error(fetchErr.message); process.exit(1); }

const wgw = current.what_went_well.map(item =>
  item.startsWith('35 new unit tests')
    ? item.replace(
        '35 new unit tests (idempotency, app-vs-marketing prompt branching, all-screens coverage, designReference grounding/hallucination-rejection/graceful-degradation) all landed green',
        '18 new unit tests across 3 new test files (idempotency, app-vs-marketing prompt branching, all-screens coverage, designReference grounding/hallucination-rejection/graceful-degradation) all landed green'
      )
    : item
);

const wni = [
  ...current.what_needs_improvement,
  'A round-1 deep-tier adversarial review found and confirmed 2 CRITICAL bugs in the initial implementation: (1) archetype-generator.js wrote artifacts with an invented artifact_type string (\'stage_17_archetype\') that is NOT in the venture_artifacts CHECK constraint allowlist -- the canonical registered type is ARTIFACT_TYPES.BLUEPRINT_S17_ARCHETYPES (\'s17_archetypes\'); every insert would have been rejected by Postgres on first live use. (2) The 4-variant generation loop shared one metadata.screenId across all 4 writeArtifact() calls, and writeArtifact()\'s own is_current dedup logic (scoped by venture_id+lifecycle_stage+artifact_type+screenId) collapsed all 4 into a single overwritten row -- verified empirically by simulating the real dedup behavior. Both were fixed (canonical ARTIFACT_TYPES constant; per-variant screenId suffix) and covered by new regression tests before merge. Neither bug was caught by the original mocked unit tests, which fully stubbed writeArtifact and never exercised its real dedup/constraint behavior -- a reminder that mocking the exact seam a bug lives in hides it from the test suite.',
  'The adversarial review also found (WARNING, not fixed): neither generateArchetypeVariants() nor generateArchetypesForAllScreens() has any live caller anywhere in this repo outside their own test file -- the restored producer is itself unreachable from any real Stage 17 entry point today, repeating the exact "coded but never dispatched" pattern this SD was created to fix for extractAndLockTokens(). Wiring an actual Stage 17 trigger point was out of scope for this pass (the exact live entry mechanism was not confirmed) and is flagged as a required follow-up, not silently left undone.',
  'Incidental discovery (out of scope for this SD, not fixed here): refinement.js\'s existing, pre-existing 4-variant writeArtifact() loop (used by the LIVE selection-flow.js Pass-1 refinement step) appears to share this SD\'s same class of dedup-collision bug -- its calls pass no metadata.screenId at all, meaning the dedup check\'s screenId-less fallback path plus writeArtifact()\'s update-in-place-on-match behavior would very likely also collapse all 4 refined variants into 1 overwritten row today. This was not independently verified against live data or fixed (refinement.js is unmodified, out of this SD\'s scope) but is flagged for urgent follow-up review since it may mean the existing, live "4 refined variants" chairman-selection feature has been silently degraded to 1 variant in production.',
];

const keyLearnings = [
  ...current.key_learnings,
  'A mocked unit test that stubs the exact function where a bug lives (writeArtifact\'s dedup/constraint logic, in this case) provides zero protection against that bug -- verifying against a REALISTIC simulation of the mocked dependency\'s actual behavior (not just "was it called N times") is what caught 2 CRITICAL bugs a fully-mocked-and-passing test suite missed entirely.',
];

const actionItems = [
  ...current.action_items,
  {
    title: 'Wire a real Stage 17 entry-point call site for generateArchetypeVariants()/generateArchetypesForAllScreens()',
    description: 'Neither function has a live caller in this repo yet -- confirm the actual Stage 17 trigger mechanism (frontend action, stage-transition hook, or orchestrator dispatch) and wire it in, or this SD\'s restored producer remains unreachable dead code exactly like the function it replaced.',
    priority: 'high',
    owner_role: 'EXEC',
  },
  {
    title: 'Urgently verify whether refinement.js\'s live 4-variant writeArtifact() loop is affected by the same dedup-collision bug',
    description: 'refinement.js (unmodified, pre-existing, used by the LIVE selection-flow.js Pass-1 flow) writes 4 variants with no metadata.screenId, which appears vulnerable to the identical is_current dedup collision found and fixed in this SD\'s new archetype-generator.js. If confirmed, the existing chairman "pick 1 of 4 refined variants" feature may be silently serving only 1 variant in production today.',
    priority: 'high',
    owner_role: 'PLAN',
  },
];

const { error: updateErr } = await supabase
  .from('retrospectives')
  .update({ what_went_well: wgw, what_needs_improvement: wni, key_learnings: keyLearnings, action_items: actionItems })
  .eq('id', RETRO_ID);

if (updateErr) { console.error('[correct-retro] Failed:', updateErr.message); process.exit(1); }
console.log('[correct-retro] Retrospective corrected and enriched with adversarial-review findings.');
