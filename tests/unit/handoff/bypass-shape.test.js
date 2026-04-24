/**
 * Tests for validateBypassShape (SD-LEARN-FIX-ADDRESS-PAT-AGENT-001).
 *
 * Covers:
 *  - Prose-only bypass rejected when ENFORCE_BYPASS_SHAPE=true
 *  - Prose-only bypass allowed (warn-only) when ENFORCE_BYPASS_SHAPE=false
 *  - --pattern-id with existing issue_patterns row accepted
 *  - --pattern-id with missing row rejected
 *  - --followup-sd-key with existing SD accepted
 *  - --followup-sd-key with missing SD rejected
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateBypassShape } from '../../../scripts/modules/handoff/bypass-rubric.js';

function makeSupabaseStub({ patternExists = false, sdKeyExists = false } = {}) {
  return {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'issue_patterns' && patternExists) {
              return { data: { pattern_id: 'PAT-FAKE-001', status: 'active' }, error: null };
            }
            if (table === 'strategic_directives_v2' && sdKeyExists) {
              return { data: { sd_key: 'SD-FAKE-001', status: 'draft' }, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      insert: () => ({
        then: (cb) => cb({ error: null }),
      }),
    }),
  };
}

describe('validateBypassShape (SD-LEARN-FIX-ADDRESS-PAT-AGENT-001)', () => {
  const originalFlag = process.env.ENFORCE_BYPASS_SHAPE;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ENFORCE_BYPASS_SHAPE;
    else process.env.ENFORCE_BYPASS_SHAPE = originalFlag;
  });

  it('REJECTS prose-only bypass when ENFORCE_BYPASS_SHAPE=true', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'true';
    const result = await validateBypassShape({
      patternId: null,
      followupSdKey: null,
      supabase: makeSupabaseStub(),
      bypassReason: 'Some descriptive reason text',
      sdId: 'test-sd',
      handoffType: 'LEAD-FINAL-APPROVAL',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('ERR_BYPASS_SHAPE');
    expect(result.warnOnly).toBe(false);
    expect(result.message).toContain('--pattern-id');
    expect(result.message).toContain('--followup-sd-key');
  });

  it('ALLOWS prose-only bypass (warn-only) when ENFORCE_BYPASS_SHAPE=false', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'false';
    const result = await validateBypassShape({
      patternId: null,
      followupSdKey: null,
      supabase: makeSupabaseStub(),
      bypassReason: 'prose only in warn mode',
      sdId: 'test-sd',
      handoffType: 'LEAD-FINAL-APPROVAL',
    });
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('ERR_BYPASS_SHAPE');
    expect(result.warnOnly).toBe(true);
  });

  it('ACCEPTS --pattern-id when pattern exists in issue_patterns', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'true';
    const result = await validateBypassShape({
      patternId: 'PAT-FAKE-001',
      followupSdKey: null,
      supabase: makeSupabaseStub({ patternExists: true }),
      sdId: 'test-sd',
    });
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('OK');
  });

  it('REJECTS --pattern-id when pattern missing from issue_patterns', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'true';
    const result = await validateBypassShape({
      patternId: 'PAT-DOES-NOT-EXIST',
      followupSdKey: null,
      supabase: makeSupabaseStub({ patternExists: false }),
      sdId: 'test-sd',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('ERR_BYPASS_SHAPE');
    expect(result.message).toContain('not found in issue_patterns');
  });

  it('ACCEPTS --followup-sd-key when SD exists', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'true';
    const result = await validateBypassShape({
      patternId: null,
      followupSdKey: 'SD-FAKE-001',
      supabase: makeSupabaseStub({ sdKeyExists: true }),
      sdId: 'test-sd',
    });
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('OK');
  });

  it('REJECTS --followup-sd-key when SD missing', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'true';
    const result = await validateBypassShape({
      patternId: null,
      followupSdKey: 'SD-DOES-NOT-EXIST',
      supabase: makeSupabaseStub({ sdKeyExists: false }),
      sdId: 'test-sd',
    });
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('not found in strategic_directives_v2');
  });

  it('In warn-only mode, missing pattern still returns allowed=true with warnOnly flag', async () => {
    process.env.ENFORCE_BYPASS_SHAPE = 'false';
    const result = await validateBypassShape({
      patternId: null,
      followupSdKey: null,
      supabase: makeSupabaseStub(),
      sdId: 'test-sd',
    });
    expect(result.allowed).toBe(true);
    expect(result.warnOnly).toBe(true);
  });
});
