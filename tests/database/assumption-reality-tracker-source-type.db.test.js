/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154 / PAT-LES-6d8e6a986931 (validation-learn154 F1/F2).
 *
 * WHY THIS FILE EXISTS: the unit-level test in tests/unit/eva/assumption-reality-tracker.test.js
 * mocks lib/governance/emit-feedback.js entirely, so it can assert reportWriteFailure() PASSES
 * `source_type: 'auto_capture'` but can never prove that value is actually a live-valid
 * feedback_source_type_check enum member -- exactly the gap that let the original
 * `source_type: 'assumption_reality_tracker'` ship green through 84 passing mocked tests while
 * being dead by construction (every real call would throw at INSERT and be silently swallowed
 * by reportWriteFailure's own .catch(), reproducing PAT-LES-6d8e6a986931's complaint verbatim).
 *
 * This reads the LIVE constraint directly (pure read, zero blast radius -- pg_get_constraintdef
 * never mutates) and asserts the exact literal reportWriteFailure() hardcodes is a member, so a
 * future schema change that drops 'auto_capture' fails this test instead of failing silently in
 * production. Same convention as tests/database/feedback-source-type-allowlist-membership.db.test.js.
 *
 * Runs only where a real DB is reachable (vitest.config.js's db project; tests/setup.db.js skips
 * every test and refuses all network unless DB_TARGET/VITEST_DB_ALLOW_REF designates a real target).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

// The literal value lib/eva/utils/assumption-reality-tracker.js's reportWriteFailure() passes to
// emitFeedback -- kept as a separate literal here (not imported; it's a private, unexported
// function) so drift between the two is exactly what this test is designed to catch.
const SOURCE_TYPE_USED_BY_REALITY_TRACKER = 'auto_capture';

describe('assumption-reality-tracker reportWriteFailure source_type (runs only where a real DB is reachable)', () => {
  let client;
  let liveEnumValues;

  beforeAll(async () => {
    client = await createDatabaseClient('engineer', { verify: false });
    const { rows } = await client.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'feedback_source_type_check'",
    );
    const def = rows[0]?.def || '';
    liveEnumValues = new Set([...def.matchAll(/'([^']+)'::character varying/g)].map((m) => m[1]));
  }, 30000);

  afterAll(async () => {
    if (client) await client.end();
  });

  it('the source_type reportWriteFailure() hardcodes is a real, live enum value', () => {
    expect(
      liveEnumValues.has(SOURCE_TYPE_USED_BY_REALITY_TRACKER),
      `'${SOURCE_TYPE_USED_BY_REALITY_TRACKER}' is not in the live feedback_source_type_check constraint: ${[...liveEnumValues].join(', ')}`,
    ).toBe(true);
  });

  it('the ORIGINAL (buggy) value is confirmed NOT a live enum value -- documents the regression this test guards against', () => {
    expect(liveEnumValues.has('assumption_reality_tracker')).toBe(false);
  });
});
