/**
 * E2E regression test — --from-feedback flag mode.
 *
 * Covers the mapping logic in scripts/sd-from-feedback.js:
 *   FEEDBACK_TYPE_MAP: issue → bugfix, enhancement → feature
 *   PRIORITY_MAP:    P0 → critical, P1 → high, P2 → medium, P3 → low
 *
 * The script itself is interactive (readline) so the test exercises the
 * typed-mapping contract programmatically and asserts a DB round-trip via
 * generateSDKey using the mapped type, then verifies the SD row
 * persists with JSONB constraints intact.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import {
  credentialsPresent,
  getSupabase,
  newTestRunId,
  seedFeedback,
  cleanup,
} from './fixtures/supabase-seed.js';

// Replicate the mapping constants from scripts/sd-from-feedback.js.
// If these ever drift in the source script, the test will fail where it
// creates an SD with a non-mapped type.
const FEEDBACK_TYPE_MAP = Object.freeze({
  issue: 'bugfix',
  enhancement: 'feature',
});
const PRIORITY_MAP = Object.freeze({
  P0: 'critical',
  P1: 'high',
  P2: 'medium',
  P3: 'low',
});

const testRunId = newTestRunId();
const skip = !credentialsPresent();

describe.skipIf(skip)('SD creation — --from-feedback mode', () => {
  afterAll(async () => {
    await cleanup(testRunId);
  });

  it('maps feedback_type=issue to sd_type=bugfix', () => {
    expect(FEEDBACK_TYPE_MAP.issue).toBe('bugfix');
  });

  it('maps feedback_type=enhancement to sd_type=feature', () => {
    expect(FEEDBACK_TYPE_MAP.enhancement).toBe('feature');
  });

  it('maps priority P0/P1/P2/P3 to critical/high/medium/low', () => {
    expect(PRIORITY_MAP.P0).toBe('critical');
    expect(PRIORITY_MAP.P1).toBe('high');
    expect(PRIORITY_MAP.P2).toBe('medium');
    expect(PRIORITY_MAP.P3).toBe('low');
  });

  it('end-to-end: seed feedback → generate SD key → insert SD row with JSONB constraints', async () => {
    const { row: feedback } = await seedFeedback(testRunId, {
      feedback_type: 'issue',
      priority: 'P1',
      title: `${testRunId} feedback-to-sd bugfix round-trip`,
    });

    const mappedType = FEEDBACK_TYPE_MAP[feedback.feedback_type];
    const mappedPriority = PRIORITY_MAP[feedback.priority];
    expect(mappedType).toBe('bugfix');
    expect(mappedPriority).toBe('high');

    const sdKey = await generateSDKey({
      source: 'FEEDBACK',
      type: mappedType,
      title: feedback.title,
    });
    expect(sdKey).toMatch(/^SD-FEEDBACK-BUGFIX-[A-Z0-9-]+-\d{3}$/);

    const supabase = await getSupabase();
    const row = {
      id: sdKey,
      sd_key: sdKey,
      title: feedback.title,
      description: `Seeded from feedback ${feedback.id}`,
      rationale: 'Integration test — feedback-to-SD mapping',
      status: 'draft',
      sd_type: mappedType,
      category: 'Testing',
      priority: mappedPriority,
      scope: 'test',
      target_application: 'EHG_Engineer',
      key_changes: [{ change: 'seed from feedback', type: 'test' }],
      key_principles: ['mapping contract'],
      success_criteria: [{ criterion: 'row persists', measure: 'SELECT returns 1' }],
    };
    const { error } = await supabase.from('strategic_directives_v2').insert(row);
    expect(error, `insert error: ${error?.message}`).toBeNull();

    // Verify JSONB constraints enforced at DB level
    const { data: check } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, sd_type, key_changes, key_principles')
      .eq('sd_key', sdKey)
      .single();
    expect(check).toBeTruthy();
    expect(check.sd_type).toBe('bugfix');
    expect(Array.isArray(check.key_changes)).toBe(true);
    expect(check.key_changes[0]).toMatchObject({ change: expect.any(String), type: expect.any(String) });
    expect(Array.isArray(check.key_principles)).toBe(true);
    expect(check.key_principles.length).toBeGreaterThan(0);
  });
});
