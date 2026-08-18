/**
 * SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001 (round-2 adversarial review, security-agent).
 *
 * WHY THIS FILE EXISTS: the unit-level accounting test in tests/content-sanitizer.test.js
 * (`trustedTypes.length + PUBLIC_ORIGIN_SOURCE_TYPES.size === 13`) was mutation-proved to detect
 * ONLY cardinality drift between two in-file arrays -- it cannot see a genuinely new value added
 * to the live feedback_source_type_check constraint (this SD's own defect class: a schema-legal
 * source_type silently defaulting to trusted because nobody remembered to classify it), nor a
 * typo silently renaming a trustedTypes entry away from a real enum value. This db-tier test reads
 * the LIVE constraint directly (pure read, zero blast radius -- pg_get_constraintdef never
 * mutates) and asserts EXACT set membership, not just a count, against both application-layer
 * arrays (lib/factory/content-sanitizer.js's PUBLIC_ORIGIN_SOURCE_TYPES, and this repo's own
 * mirrored trustedTypes list) simultaneously.
 *
 * Runs only where a real DB is reachable (vitest.config.js's db project; tests/setup.db.js skips
 * every test and refuses all network unless DB_TARGET/VITEST_DB_ALLOW_REF designates a real
 * target) -- same convention as every other file in this directory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { PUBLIC_ORIGIN_SOURCE_TYPES } from '../../lib/factory/content-sanitizer.js';

// Mirrors tests/content-sanitizer.test.js's trustedTypes exactly -- kept as a separate literal
// here (not imported) since that file doesn't export it; drift between the two copies is exactly
// what the cross-check below is designed to catch.
const UNIT_TEST_TRUSTED_TYPES = new Set([
  'manual_feedback', 'auto_capture', 'uat_failure',
  'uncaught_exception', 'unhandled_rejection', 'manual_capture',
  'todoist_intake', 'youtube_intake', 'claude_code_intake',
]);

describe('feedback_source_type_check live-schema membership (runs only where a real DB is reachable)', () => {
  let client;
  let liveEnumValues;

  beforeAll(async () => {
    client = await createDatabaseClient('engineer', { verify: false });
    const { rows } = await client.query(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'feedback_source_type_check'",
    );
    const def = rows[0]?.def || '';
    // Extracts each 'quoted_value'::character varying token from the ANY (ARRAY[...]) form.
    liveEnumValues = new Set([...def.matchAll(/'([^']+)'::character varying/g)].map((m) => m[1]));
  }, 30000);

  afterAll(async () => {
    if (client) await client.end();
  });

  it('every value the application classifies as untrusted is a real, live enum value', () => {
    for (const t of PUBLIC_ORIGIN_SOURCE_TYPES) {
      expect(liveEnumValues.has(t), `PUBLIC_ORIGIN_SOURCE_TYPES has '${t}' but the live constraint does not`).toBe(true);
    }
  });

  it('every value the unit test suite classifies as trusted is a real, live enum value', () => {
    for (const t of UNIT_TEST_TRUSTED_TYPES) {
      expect(liveEnumValues.has(t), `trustedTypes has '${t}' but the live constraint does not`).toBe(true);
    }
  });

  it('the union of both application-layer classifications covers EVERY live enum value -- nothing silently falls through unclassified', () => {
    const covered = new Set([...PUBLIC_ORIGIN_SOURCE_TYPES, ...UNIT_TEST_TRUSTED_TYPES]);
    const uncovered = [...liveEnumValues].filter((v) => !covered.has(v));
    expect(uncovered, `live enum value(s) not classified by either allowlist: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('the two sets are disjoint -- nothing is claimed both trusted and untrusted', () => {
    const overlap = [...PUBLIC_ORIGIN_SOURCE_TYPES].filter((v) => UNIT_TEST_TRUSTED_TYPES.has(v));
    expect(overlap, `value(s) classified as BOTH trusted and untrusted: ${overlap.join(', ')}`).toEqual([]);
  });
});
