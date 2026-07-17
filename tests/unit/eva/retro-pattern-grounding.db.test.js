/**
 * SD-LEO-INFRA-STAGE-GROUNDING-INJECTOR-001 FR-2 — retro/issue-pattern grounding.
 *
 * Live-path test (NOT mocked): when real Supabase creds are present it exercises
 * the actual inject path against the live retrospectives + issue_patterns tables
 * and asserts the block is populated + noise-free — so the test fails if the
 * module reads dead/wrong data (test-masking guard). Self-skips the live
 * assertion when no creds (HAS_REAL_DB false); the fail-safe assertions always run.
 */
import { describe, it, expect } from 'vitest';
import { getRetroPatternGroundingBlock } from '../../../lib/eva/standards/retro-pattern-grounding.js';

const HAS_REAL_DB = !!(
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
);

describe('getRetroPatternGroundingBlock (FR-2)', () => {
  it('is fail-safe: returns empty string when no supabase client is provided', async () => {
    expect(await getRetroPatternGroundingBlock({})).toBe('');
    expect(await getRetroPatternGroundingBlock({ supabase: null })).toBe('');
    expect(await getRetroPatternGroundingBlock({ supabase: {} })).toBe('');
  });

  it('is fail-safe: swallows a throwing client and returns empty string', async () => {
    const throwing = { from() { throw new Error('boom'); } };
    expect(await getRetroPatternGroundingBlock({ supabase: throwing, stageType: 'architecture' })).toBe('');
  });

  (HAS_REAL_DB ? it : it.skip)('live-path: injects real, noise-free lessons from the DB', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const block = await getRetroPatternGroundingBlock({ supabase: sb, stageType: 'architecture', limit: 3 });
    // Populated from real rows (the DB has thousands of retros + patterns).
    expect(typeof block).toBe('string');
    expect(block).toContain('ACCUMULATED LESSONS');
    expect(block.length).toBeGreaterThan(50);
    // Telemetry/test-stub noise must be filtered out, not injected into prompts.
    expect(block).not.toMatch(/test-stub|api error:\s*unknown/i);
  });
});
