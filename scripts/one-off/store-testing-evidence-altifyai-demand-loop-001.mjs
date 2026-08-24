#!/usr/bin/env node
// PLAN-phase TESTING evidence for SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001 -- prospective design
// review run BEFORE any EXEC code was written. Found the round-1 PRD would silently drop
// referral attribution for the common case (4 auto-provision call sites, not just
// /api/register) and would silently hide the new field for already-provisioned users
// (explicit-column-list SELECT). Both resolved via a round-2 PRD/SD revision before this
// evidence was written.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '96219580-132e-4594-a61c-62da9b3eed6d';
const SD_KEY = 'SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Testing (prospective design review)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 87,
    critical_issues: [],
    warnings: [
      'Round-2 PRD still requires EXEC to correctly implement the COALESCE-ordering fix inside createUserFromClerk and the bounded collision-retry path -- code-time implementation fidelity, not something this review can pre-confirm.',
      'Anti-fraud/rate-limiting on referral farming remains explicitly out of scope for this minimal SD, documented as a known limitation.',
    ],
    recommendations: [
      'Update tests/users-schema.test.js and tests/migrate.test.js FIRST (to reflect the new schema/migration list) before wiring the actual referral logic, so the red-suite-by-design transition is deliberate and visible rather than a surprise mid-EXEC.',
      'Write the collision-retry test early, using a pre-seeded colliding code, to prove the bounded-retry path works before building on top of it.',
    ],
    detailed_analysis:
      'Prospective review (before any EXEC code written) measured the round-1 PRD against the real AltifyAI repo (fetched ' +
      'origin/main directly via git show, since the local checkout was 74 commits behind with another sessions ' +
      'uncommitted work) -- not just PRD prose. FINDING 1 (real defect): round-1 FR-3 assumed /api/register is where ' +
      'users are first created; measured 4 separate auto-provision call sites (me.js, checkout.js, events.js x2, ' +
      'register.js) all funnel through the SAME createUserFromClerk upsert on first contact -- attribution scoped only ' +
      'to /api/register would silently drop referred_by on the common path, the SAME bug class QF-20260816-568 already ' +
      'fixed once for email/displayName in this exact function. FINDING 2 (real defect): round-1 FR-2/FR-4 assumed GET ' +
      '/api/me would trivially expose new columns; measured getUserByClerkId uses an explicit SELECT column list (not ' +
      'SELECT *), so a migration-only change would silently return undefined referralCode for already-provisioned users ' +
      'while appearing to work for freshly-provisioned ones in a fresh-DB test fixture -- a genuinely dangerous ' +
      'false-green pattern. FINDING 3 (real defect): round-1s implied migration shape (ADD COLUMN ... UNIQUE inline) is ' +
      'illegal in SQLite/D1 -- corrected to two ADD COLUMN statements plus separate CREATE UNIQUE INDEX / CREATE INDEX ' +
      'statements. FINDING 4 (underspecified): TR-4s entropy requirement used an or between entropy and a real ' +
      'uniqueness check; corrected to require both, with a concrete 8-char Crockford base32 format (explicitly not ' +
      'derived from the ULID user id, which would leak account-creation-order timestamp) and a bounded collision-retry ' +
      'path the round-1 PRD entirely lacked. CONFIRMED TRUE (not stale): TR-2s claim that migration ordinal 0005 is ' +
      'taken and 0006 is next-free -- verified directly against origin/mains real migrations/ directory contents. All ' +
      'findings were resolved via a round-2 PRD revision (functional_requirements/technical_requirements/risks/' +
      'test_scenarios/smoke_test_steps all rewritten) and a matching SD-level rescope before this evidence was recorded.',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'A prospective review before EXEC caught 2 real, silent-failure-class defects (attribution dropped on the common ' +
      'non-register provisioning path; a new field silently hidden by an existing explicit-column SELECT) that would ' +
      'otherwise have surfaced only in production, past a fresh-DB test fixture that could not have caught either -- ' +
      'matching this sessions established discipline of reviewing PLAN-phase design against measured reality before ' +
      'code is written. All findings were resolved via PRD/SD revision prior to this evidence being recorded.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'TESTING',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_UUID,
    { name: 'Testing (prospective design review)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
