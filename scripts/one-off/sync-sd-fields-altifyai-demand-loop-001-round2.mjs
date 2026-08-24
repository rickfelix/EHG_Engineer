#!/usr/bin/env node
// SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 -- round-2 sync after the prospective TESTING review
// (before EXEC) found real defects in the round-1 design. Updates
// description/scope/success_criteria/strategic_objectives/smoke_test_steps/metadata together.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '96219580-132e-4594-a61c-62da9b3eed6d';

const NEW_DESCRIPTION = `AltifyAI demand loop (repeatable acquisition channel; feeds Demand-E unpark) (W3 item 4)

## Type
infrastructure

**Provenance**: W3 GO (chairman A + "Go and ratify", decision e1da09a3, approved 16:41-16:46Z 08-24); roadmap_wave_items fbd6b295-579d-4d04-8775-2dfb29cd20f5, priority_rank 4. Enriched at LEAD 2026-08-24 (Explore evidence 4e067753) from a bare title-only promotion. Re-scoped AGAIN at PLAN 2026-08-24 after a prospective TESTING review (before any code written) found the round-1 design would silently drop referral attribution for the common case.

## Round-2 PLAN findings (prospective TESTING review, before EXEC)
- Round-1 FR-3 assumed /api/register is where users are first created -- FALSE. 4 separate auto-provision call sites exist (me.js, checkout.js, events.js x2, register.js), all funneling through the SAME createUserFromClerk upsert on first contact. Attribution scoped only to /api/register would silently drop referred_by on the common path -- the SAME bug class QF-20260816-568 already fixed once for email/displayName. Corrected: code generation AND attribution both move into the shared upsert via a COALESCE-ordering fix.
- Round-1 FR-2/FR-4 assumed GET /api/me would trivially expose new columns -- FALSE. getUserByClerkId uses an explicit SELECT column list, not SELECT *; a migration-only change would silently return undefined referralCode for already-provisioned users while appearing to work for freshly-provisioned ones in a fresh-DB test fixture. Corrected: FR-2's acceptance criteria now require a fixture that pre-seeds a user before the GET.
- Round-1's implied migration shape (ADD COLUMN ... UNIQUE) is illegal in SQLite/D1. Corrected: two ADD COLUMN statements + separate CREATE UNIQUE INDEX + CREATE INDEX (on referred_by, for the referredCount COUNT query).
- Round-1's TR-4 entropy requirement was underspecified (an "or" between entropy and a real check). Corrected: 8-char Crockford base32, generated independently (NOT derived from the ULID user id, which would leak account-creation-order timestamp), enforced by both entropy AND a real UNIQUE index with bounded retry-on-collision.
- Confirmed real (not stale): TR-2's claim that migration ordinal 0005 is taken and 0006 is next-free -- verified directly against origin/main's migrations/ directory.
- New: FR-5 now explicitly names the 2 existing tests this SD will legitimately need to update (users-schema.test.js TS-1's exact-column assertion, migrate.test.js's exact-filename assertion) rather than leaving them to break as a surprise.

## Scope (corrected, cross-repo: AltifyAI app primarily, EHG_Engineer config secondarily)
- FR-1: Referral code generated once, inside the shared createUserFromClerk upsert (covers all 4 provision call sites uniformly), idempotent via COALESCE ordering, lazily backfills pre-existing NULL-coded rows.
- FR-2: GET /api/me returns referralCode -- requires extending getUserByClerkId's explicit SELECT list.
- FR-3: POST /api/register accepts an optional referral code; attribution happens on the SAME shared upsert (not a separate write); self-referral rejected via clerk_user_id comparison (not internal id, which doesn't exist pre-insert); invalid/missing/self all fail open.
- FR-4: GET /api/me returns referredCount, backed by a real index on referred_by.
- FR-5: Fixtures for all of the above, including a bounded collision-retry path, plus updating the 2 existing tests this SD legitimately changes.

## Out of scope
Paid acquisition/ads; email marketing campaigns; a public marketing/growth dashboard; item 3's human outreach work (separate SD, separate session); any change to the EVA lifecycle gate code itself; anti-fraud/rate-limiting on referral farming (documented limitation, not silently dropped).

## Success criteria
- Every user (regardless of which route first provisions them) has a real, stable referral code retrievable via GET /api/me, including already-existing rows.
- A new user who registers via a valid referral code has referred_by correctly persisted, idempotently; invalid/missing/self-referral codes fail open without a 500.
- A user can see their own referral code and referredCount via GET /api/me, backed by a real index.
`;

const success_criteria = [
  { measure: '[VERIFIED]', criterion: 'Every user (regardless of which route first provisions them) has a real, stable referral code retrievable via GET /api/me, including already-existing rows.' },
  { measure: '[VERIFIED]', criterion: 'A new user who registers via a valid referral code has referred_by correctly persisted, idempotently; invalid/missing/self-referral codes fail open without a 500.' },
  { measure: '[VERIFIED]', criterion: 'A user can see their own referral code and referredCount via GET /api/me, backed by a real index.' },
];

const strategic_objectives = [
  'Build a genuine, repeatable, code-driven acquisition mechanism for AltifyAI that correctly covers all real user-provisioning paths, not just the registration route',
  'Produce real demand-evidence-shaped output (attributable referred signups) that a future EVA lifecycle demand-validation gate could consume',
];

const smoke_test_steps = [
  {
    instruction: 'Call GET /api/me as a signed-in test user who was provisioned via /api/checkout or /api/events (never /api/register) and note the referralCode field.',
    expected_outcome: 'A non-empty, unique-looking referral code is returned, proving generation happens on the shared upsert, not only at registration.',
  },
  {
    instruction: 'Register a second test user, passing the first user\'s referral code, then call GET /api/me for the first (referring) user.',
    expected_outcome: 'The referring user\'s referredCount has incremented by 1.',
  },
  {
    instruction: 'Register a third test user with an obviously invalid/nonexistent referral code.',
    expected_outcome: 'Registration still succeeds (not blocked, no 500); no referredCount anywhere incorrectly increments.',
  },
  {
    instruction: 'Attempt to register a user passing that same user\'s own referral code (self-referral).',
    expected_outcome: 'Registration succeeds but referred_by is not set to the user\'s own id.',
  },
  {
    instruction: 'Simulate a referral-code UNIQUE-index collision during generation (e.g. by pre-seeding a code) and confirm the retry path.',
    expected_outcome: 'A fresh code is generated and persisted after a bounded retry, never a silent duplicate and never a hang.',
  },
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
    rescope_note_round2: {
      rescoped_at: new Date().toISOString(),
      reason:
        'Prospective TESTING review (before EXEC) found the round-1 design would silently drop referral attribution for the common case (4 auto-provision call sites, not just /api/register), and that getUserByClerkId\'s explicit column list would silently hide the new field for already-provisioned users. Corrected by moving generation+attribution into the shared createUserFromClerk upsert via a COALESCE-ordering fix, extending the SELECT list, fixing the illegal SQLite ADD COLUMN UNIQUE shape, and specifying a concrete Crockford-base32 code format with bounded collision retry.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: NEW_DESCRIPTION,
      scope: NEW_DESCRIPTION.split('\n')[0],
      success_criteria,
      strategic_objectives,
      smoke_test_steps,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD round-2 sync complete.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
