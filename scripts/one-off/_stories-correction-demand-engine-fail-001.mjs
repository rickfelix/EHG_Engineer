import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const updates = [
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Wire recordPublishOutcome() so a credential-dry-run publish is never recorded as shipped_clean',
    user_want: 'a dry-run publish result to have its ledger row reconciled to a non-shipped outcome, not left asserting an unreconciled accepted decision',
    priority: 'medium',
    acceptance_criteria: [
      'content-pipeline.js and owned-audience-content-loop.js call recordPublishOutcome() with the real observed outcome (dry-run never resolves to shipped_clean)',
      'Neither caller increments totalPublished, calls recordSpend, or marks content status=posted on a dry-run result',
    ],
    implementation_context: `## Implementation Guidance\n\n**Architecture Patterns:**\n- FR-3 (corrected): this is a data-integrity/reconciliation fix, NOT the go-live safety property -- checkPublishAuthorization() already denies cleanly (no ledger row) once armed (FR-1/FR-2). The real bug: an autonomous-tier authorized publish writes an 'accepted' ledger row BEFORE the credential-dry-run branch runs; recordPublishOutcome() (the only writer of a non-'unknown' outcome) has ZERO production callers today.\n- Files: lib/marketing/publisher/index.js, lib/marketing/content-pipeline.js, lib/marketing/owned-audience-content-loop.js, lib/marketing/autonomy-gate.js (recordPublishOutcome)\n\n**Integration Points:**\n- Database: venture_channel_publish_ledger.outcome column, via recordPublishOutcome(correlationId, outcome)\n\n**Implementation Steps:**\n1. After a publish() call, both callers must invoke recordPublishOutcome() using the returned ledgerCorrelationId\n2. A dry-run (dryRun:true) result must resolve to a non-shipped_clean outcome\n3. Unit test TS-4/US-003 acceptance criteria`,
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Add a mock/synthetic ledger discriminator as defense-in-depth (downgraded from CRITICAL to MEDIUM)',
    user_want: 'the graduation streak mechanism to be structurally incapable of counting a mock send as real, once it is ever wired up',
    priority: 'medium',
    acceptance_criteria: [
      "VERIFIED: recordPublishOutcome() has zero production callers today, so evaluateGraduation() cannot fire for any channel currently -- this is forward-looking defense-in-depth, not closing a live exploit",
      'venture_channel_publish_ledger carries (or FR-3\'s outcome vocabulary encodes) a mock/synthetic discriminator',
      'A mixed fixture (older real shipped_clean rows + newer mock rows) proves mock rows never contribute to the streak',
    ],
    implementation_context: `## Implementation Guidance\n\n**Architecture Patterns:**\n- FR-4 (corrected, downgraded from CRITICAL): land in the SAME change as US-003/FR-3's recordPublishOutcome() wiring, not before -- there is no live exploit window today (recordPublishOutcome has zero callers, so evaluateGraduation is currently dead code for all channels)\n- Files: database/chairman-gated/, lib/marketing/autonomy-gate.js (evaluateGraduation)\n\n**Integration Points:**\n- Database: chairman-gated migration for the discriminator\n\n**Implementation Steps:**\n1. Add the discriminator column/outcome-value alongside FR-3's recordPublishOutcome() wiring\n2. Update evaluateGraduation()'s streak-counting to treat a discriminated row as breaking the streak\n3. Mixed-fixture unit test (TS-5) -- an all-mock fixture alone does not exercise the real vector`,
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Extend gating to email-campaigns.js sendEmail() via a REQUIRED venture-linkage parameter (fails closed on absence)',
    user_want: 'sendEmail() to require venture linkage so a caller cannot omit it and fail open',
    acceptance_criteria: [
      'sendEmail() takes a REQUIRED ventureId (or equivalent venture-linkage) parameter -- not optional',
      'Every existing call site is updated to supply it',
      'venture-consent.js resolveSendPermission() denies for a below-go-live venture',
      'A DB trigger on the outbound ledger rejects inserts for a below-go-live venture',
    ],
    implementation_context: `## Implementation Guidance\n\n**Architecture Patterns:**\n- FR-5 CORRECTION (post-testing-agent): sendEmail({to,subject,html,from,tags}) (email-campaigns.js:60) has NO ventureId today. An OPTIONAL added param fails OPEN (omit -> no_venture_id -> OUT_OF_SCOPE -> shouldEnforceBlock()===false -> send proceeds) -- exactly the bypass this FR exists to close. ventureId must be REQUIRED, with absence failing CLOSED.\n- Files: lib/marketing/ai/email-campaigns.js, lib/marketing/venture-consent.js, database/chairman-gated/\n\n**Integration Points:**\n- Database: outbound ledger trigger migration\n\n**Implementation Steps:**\n1. Make ventureId a required param of sendEmail() and its factory deps\n2. Update every call site to supply it\n3. Add the same check to venture-consent.js resolveSendPermission()\n4. Add the DB trigger migration\n5. Integration test TS-6 for the direct sendEmail() call, and a contract test proving omission fails closed`,
  },
];

for (const u of updates) {
  const { data: existing, error: readErr } = await supabase.from('user_stories').select('acceptance_criteria').eq('story_key', u.story_key).single();
  if (readErr) { console.error(`READ ERROR ${u.story_key}:`, readErr.message); process.exit(1); }
  const patch = {
    title: u.title,
    user_want: u.user_want || undefined,
    priority: u.priority || undefined,
    acceptance_criteria: u.acceptance_criteria,
    implementation_context: u.implementation_context,
    updated_by: 'Alpha-2 (PLAN correction pass)',
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  const { error: updErr } = await supabase.from('user_stories').update(patch).eq('story_key', u.story_key);
  if (updErr) { console.error(`UPDATE ERROR ${u.story_key}:`, updErr.message); process.exit(1); }
  console.log('Story corrected:', u.story_key);
}
