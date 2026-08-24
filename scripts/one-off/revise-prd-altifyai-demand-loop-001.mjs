#!/usr/bin/env node
// SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 -- PLAN-phase PRD revision (round 2) after a prospective
// TESTING review (before EXEC) found real defects in the round-1 design: (1) getUserByClerkId
// uses an explicit column SELECT list -- a new referral_code column would silently return
// undefined for existing (returning) users, only working for freshly-provisioned ones (a
// fresh-DB fixture would never catch this). (2) FR-3 assumed /api/register is where users are
// first created -- FALSE: 4 auto-provision call sites exist (me.js, checkout.js, events.js x2)
// that all reach createUserFromClerk first in the common case, so INSERT-only attribution
// silently drops on the common path -- the SAME bug class QF-20260816-568 already fixed once
// for email/displayName. (3) SQLite/D1 cannot ADD COLUMN ... UNIQUE inline -- needs a separate
// CREATE UNIQUE INDEX. (4) Existing tests (users-schema.test.js TS-1 exact-column assertion,
// migrate.test.js exact-filename assertion) will legitimately need updating, not silently break.
// (5) TR-4's entropy requirement needed a concrete design (Crockford base32, not ULID-derived --
// a ULID leaks creation-order timestamp). All incorporated below before EXEC begins.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { updatePRDWithLLMContent } from '../prd/prd-creator.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001';
const PRD_ID = 'PRD-SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001';

const llmContent = {
  executive_summary:
    'Build a new referral/invite loop for AltifyAI: a stable per-user referral code generated inside the shared user-upsert (not at registration, which is not always first contact), attribution via a COALESCE-preserving UPDATE, and visibility via GET /api/me.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement:
        'Referral code generation: every user gets a stable, unique referral code generated exactly once, inside `createUserFromClerk`\'s single atomic INSERT ... ON CONFLICT upsert (measured: 4 separate call sites -- src/routes/me.js, checkout.js, events.js x2, register.js -- all funnel through this one function on a user\'s first contact with the app, whichever route that happens to be). No other code path generates a referral code. A COALESCE ordering (stored value wins over incoming) makes this idempotent across repeat upserts AND lazily backfills any pre-existing NULL-coded row the next time it\'s touched, with no separate backfill migration needed.',
      acceptance_criteria: [
        'A given user\'s referral code is identical across repeated requests, regardless of which route triggers their upsert.',
        'Two different users never share the same referral code (enforced by a real UNIQUE index, not merely probabilistic entropy).',
        'A user who was auto-provisioned by /api/me, /api/checkout, or /api/events before ever calling /api/register still has a real referral code.',
      ],
    },
    {
      id: 'FR-2',
      requirement:
        'Referral code exposure: GET /api/me is extended to return the caller\'s own referralCode. This requires extending getUserByClerkId\'s explicit SELECT column list (src/data/users.js) to include the new column -- measured: it does NOT use SELECT *, so a naive migration-only change would silently return undefined for every returning (already-provisioned) user while appearing to work for freshly-provisioned ones in a fresh-DB test fixture.',
      acceptance_criteria: [
        'GET /api/me\'s response includes a referralCode field for an authenticated caller.',
        'The field is populated for a user who already existed in the DB before this call (not only for a freshly-provisioned one) -- proven with a fixture that pre-seeds a user row before calling GET /api/me, not only a fresh-registration flow.',
      ],
    },
    {
      id: 'FR-3',
      requirement:
        'Referral attribution: POST /api/register accepts an optional referral code (inside parseRegisterInput\'s validated input shape, spread into the trusted-clerkUserId-last object per register.js\'s existing SEC-A2-02 ordering guard -- referralCode must never be able to shadow clerkUserId). The referring user is looked up by SELECT id, clerk_user_id FROM users WHERE referral_code = ?; self-referral is rejected by comparing clerk_user_id (the new user\'s internal id does not exist pre-insert, so id-to-id comparison is not possible at this point without an extra round-trip). A match sets referred_by on the SAME upsert call as FR-1\'s code generation (via the COALESCE-preserving UPDATE, so referred_by is also idempotent -- never overwritten by a later /api/register call with a different code). An invalid, unrecognized, missing, or self-referral code fails open: registration succeeds regardless, referred_by stays NULL, and no error propagates into register.js\'s error-response branches.',
      acceptance_criteria: [
        'Registering with a valid referral code correctly sets referred_by to the referring user\'s id.',
        'Registering with an invalid, missing, or self-referral code still succeeds (200), with referred_by left NULL and no 500.',
        'referred_by, once set, is never overwritten by a later /api/register call (idempotent, matching FR-1\'s COALESCE design).',
      ],
    },
    {
      id: 'FR-4',
      requirement:
        'Referred-count visibility: GET /api/me additionally returns referredCount, a real COUNT of users whose referred_by matches the caller\'s id. Backed by a new index (referred_by is a foreign-key-shaped column with no existing index) so this stays a cheap indexed lookup rather than a full table scan as the user base grows -- matching this repo\'s existing convention of indexing every FK-ish column.',
      acceptance_criteria: [
        'GET /api/me\'s response includes a referredCount field reflecting the real count of users whose referred_by matches the caller\'s id.',
        'referredCount is 0 (not null/undefined) for a user who has referred nobody.',
        'The referred_by column has a real index backing this query.',
      ],
    },
    {
      id: 'FR-5',
      requirement:
        'Fixtures proving all of the above end-to-end, plus updating the 2 existing tests this SD will legitimately change (not silently break): tests/users-schema.test.js\'s TS-1 exact-column-list assertion (must include the 2 new columns) and tests/migrate.test.js\'s exact-migration-filename-list assertion (must include the new 0006 migration).',
      acceptance_criteria: [
        'All test scenarios in this PRD pass in local/CI tests, with no external service dependency.',
        'tests/users-schema.test.js and tests/migrate.test.js are updated (not left red) to reflect the new schema.',
        'A collision-retry path (bounded, e.g. 3 attempts) is tested: if the UNIQUE index rejects a generated code, a fresh code is retried rather than surfacing a 500 to the registering user.',
      ],
    },
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement:
        'Scope fence: this SD\'s code changes land primarily in the AltifyAI repo (Cloudflare Worker app). EHG_Engineer changes are limited to LEO protocol coordination artifacts.',
    },
    {
      id: 'TR-2',
      requirement:
        'D1 migration, verified next-free ordinal is 0006 (migrations/0001-0005 confirmed present on origin/main, 0005 taken by the pricing-checkout SD\'s idempotency table). SQLite/D1 cannot add a UNIQUE column inline via ADD COLUMN -- the migration must be: two `ALTER TABLE users ADD COLUMN` statements (referral_code TEXT, referred_by TEXT, both nullable, safe default for existing rows) followed by separate `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)` and `CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by)` statements. A UNIQUE index over a nullable column correctly permits multiple NULLs, which the lazy-backfill design (FR-1) depends on.',
    },
    {
      id: 'TR-3',
      requirement:
        'No new external dependency: referral link construction is client-side URL composition; the referral code itself is generated with the existing Workers-safe PRNG already in lib/auth/register.js (crypto.getRandomValues-based), no new package added.',
    },
    {
      id: 'TR-4',
      requirement:
        'Referral code format: 8-character Crockford base32 (excludes ambiguous I/L/O/U, URL-safe with no special encoding), generated independently -- explicitly NOT derived from the user\'s ULID id, since a ULID\'s leading characters encode a real creation timestamp and deriving from it would leak account-creation order (violating the no-sensitive-info-leak requirement). Uniqueness is enforced by BOTH sufficient entropy (32^8 space) AND a real UNIQUE index (TR-2) -- not entropy alone. A UNIQUE-constraint violation on insert must be caught and retried with a freshly-generated code, bounded at 3 attempts before failing loud (never silently duplicate, never hang).',
    },
  ],
  test_scenarios: [
    { scenario: 'Two different users\' referral codes (via GET /api/me) differ from each other.', type: 'happy_path' },
    { scenario: 'A user\'s referral code is identical across two separate GET /api/me calls.', type: 'happy_path' },
    { scenario: 'A user auto-provisioned by /api/checkout or /api/events (never /api/register) still has a real referral code visible via GET /api/me.', type: 'edge_case' },
    { scenario: 'A new user registers with a valid referral code and referred_by is set to the referring user\'s id.', type: 'happy_path' },
    { scenario: 'A new user registers with an invalid/nonexistent referral code and registration still succeeds with referred_by NULL, no 500.', type: 'error_handling' },
    { scenario: 'A user attempts to register using their own referral code and is not self-attributed (compared via clerk_user_id, not internal id).', type: 'edge_case' },
    { scenario: 'A referrer\'s referredCount in GET /api/me correctly reflects the number of users who registered with their code.', type: 'happy_path' },
    { scenario: 'A user who has referred nobody sees referredCount === 0.', type: 'edge_case' },
    { scenario: 'A simulated UNIQUE-index collision on referral-code generation triggers a bounded retry with a fresh code, not a 500.', type: 'error_handling' },
    { scenario: 'referred_by set on a first /api/register call is not overwritten by a second /api/register call carrying a different referral code.', type: 'edge_case' },
  ],
  risks: [
    {
      risk: 'A naive migration-only implementation would extend the schema but leave getUserByClerkId\'s explicit column list unchanged, silently returning undefined referralCode for every already-provisioned (returning) user while appearing to work in a fresh-DB test.',
      mitigation: 'FR-2 explicitly calls out extending the SELECT list, and its acceptance criteria require a fixture that pre-seeds a user before calling GET /api/me, not only a fresh-registration flow.',
    },
    {
      risk: 'Attributing referrals only inside /api/register would silently drop attribution for the common case where a user\'s first real contact is /api/me, /api/checkout, or /api/events (all of which auto-provision) -- the same bug class QF-20260816-568 already fixed once for email/displayName.',
      mitigation: 'FR-1/FR-3 move code generation and attribution into the single shared createUserFromClerk upsert via a COALESCE-ordering fix, covering all 4 call sites uniformly.',
    },
    {
      risk: 'Referral-farming (fake signups solely to inflate a referrer\'s count) is not addressed by this minimal SD -- no anti-fraud/rate-limiting is in scope.',
      mitigation: 'Explicitly documented as a known limitation and out of scope for this first, minimal version; a future SD can add anti-fraud measures if referral volume ever makes it a real problem.',
    },
    {
      risk: 'This SD legitimately breaks 2 existing tests with hardcoded exact-list assertions (users-schema.test.js TS-1, migrate.test.js).',
      mitigation: 'FR-5 explicitly names both tests and requires them updated (not left red) as part of this SD\'s own deliverable.',
    },
  ],
};

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: sdData, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw new Error(`SD fetch failed: ${sdErr.message}`);

  const ok = await updatePRDWithLLMContent(supabase, PRD_ID, SD_KEY, sdData, llmContent);
  if (!ok) throw new Error('updatePRDWithLLMContent returned false');

  console.log('PRD revised (round 2) successfully.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
