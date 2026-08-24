#!/usr/bin/env node
// SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 -- LEAD-phase enrichment. Promoted from a bare-title
// roadmap item with no real description/scope (metadata.needs_enrichment). Enriches from the
// real roadmap_wave_items record + measured AltifyAI repo state (Explore evidence
// 4e067753-e6f3-4289-8e48-ae950109b2d2: zero existing acquisition/referral infrastructure).
// Updates ALL structured fields together -- established discipline this session.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '96219580-132e-4594-a61c-62da9b3eed6d';

const NEW_DESCRIPTION = `AltifyAI demand loop (repeatable acquisition channel; feeds Demand-E unpark) (W3 item 4)

## Type
infrastructure

**Provenance**: W3 GO (chairman A + "Go and ratify", decision e1da09a3, approved 16:41-16:46Z 08-24); roadmap_wave_items fbd6b295-579d-4d04-8775-2dfb29cd20f5, priority_rank 4 of the same wave that produced SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (item 1) and SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 (item 2, completed 2026-08-24). Item 3 (SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001, "initial outreach/demand test to a paying user") is a concurrent, human-outreach-flavored item worked by a peer session -- no hard sequencing dependency on it. Enriched at LEAD 2026-08-24 (Explore evidence 4e067753) from a bare title-only promotion.

## What "Demand-E unpark" means (measured, not assumed)
Searched the codebase for the exact term -- one match, docs/design/s20-26-simulated-run-harness-spec.md, describing a "Demand-E gate" as an EVA venture lifecycle execution_gate requiring coordinator confirmation of demand posture for a live-URL venture. A related, concretely-coded mechanism exists at lib/eva/stage-templates/stage-05.js: a cost-only kill-gate pass is downgraded to conditional_pass unless the organic-acquisition assumption is validated by explicit demand evidence or a CAC-stress-surviving LTV/CAC ratio. This SD's deliverable (a real, functioning repeatable-acquisition mechanism producing attributable referred signups) is the kind of artifact that would constitute demand evidence for that class of gate. No single hardcoded "Demand-E" constant exists yet -- this appears to be chairman/coordinator shorthand for a lifecycle checkpoint class, not a formally named code constant.

## Confirmed: genuinely greenfield (measured against the real AltifyAI repo)
Zero existing acquisition/marketing infrastructure. grep for referral|waitlist|utm_|share.*link|invite.*code across src/ returns NO matches. LandingPage.jsx is a single static hero + CTA to /register with zero attribution tracking of signup source and zero sharing mechanism. No field on users tracks how a user arrived.

## Scope (proportionate to what's actually buildable in code, without paid spend or human sales action)
- FR-1: Referral code -- every authenticated user gets a stable, unique referral code (derivable from their existing user id, no new external service).
- FR-2: Referral attribution -- POST /api/register accepts an optional referral code (e.g. query param or body field) and persists referred_by on the new user's row (new additive D1 migration, safe NULL default for existing users).
- FR-3: Referral visibility -- extend GET /api/me (shipped this session via QF-20260824-309) to also return the caller's own referral code and referred-user count, so a user can see and share their own loop.
- FR-4: Fixtures -- referral code generation is stable and collision-resistant; a valid code correctly attributes referred_by; an invalid/missing code fails open (registration still succeeds, unattributed); referred count reflects real referred users only.

## Out of scope
Paid acquisition/ads; email marketing campaigns; a public marketing/growth dashboard; item 3's human outreach work (separate SD, separate session); any change to the EVA lifecycle gate code itself (this SD produces evidence a future gate check could consume, it does not modify the gate).

## Success criteria
- Every authenticated user has a real, stable referral code retrievable via GET /api/me.
- A new user who registers via a valid referral code has referred_by correctly persisted; an invalid/missing code does not block registration.
- A user can see their own referral code and how many users they've referred.
`;

const success_criteria = [
  { measure: '[VERIFIED]', criterion: 'Every authenticated user has a real, stable referral code retrievable via GET /api/me.' },
  { measure: '[VERIFIED]', criterion: 'A new user who registers via a valid referral code has referred_by correctly persisted; an invalid/missing code does not block registration.' },
  { measure: '[VERIFIED]', criterion: 'A user can see their own referral code and how many users they\'ve referred.' },
];

const strategic_objectives = [
  'Build a genuine, repeatable, code-driven acquisition mechanism for AltifyAI (a referral/invite loop) -- proportionate to what a code-focused fleet can build without paid spend or human sales action',
  'Produce real demand-evidence-shaped output (attributable referred signups) that a future EVA lifecycle demand-validation gate could consume',
];

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    enrichment_note: {
      enriched_at: new Date().toISOString(),
      reason: 'SD was promoted from a bare-title roadmap item with no real description/scope (needs_enrichment flagged). Enriched from the real roadmap_wave_items record, its W3 sibling sequence, and measured AltifyAI repo state (zero existing acquisition infrastructure) -- scoped to a proportionate referral/invite loop rather than a sprawling growth-marketing platform. See Explore evidence 4e067753-e6f3-4289-8e48-ae950109b2d2.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: NEW_DESCRIPTION,
      scope: NEW_DESCRIPTION.split('\n')[0],
      success_criteria,
      strategic_objectives,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD enriched/rescoped successfully.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
