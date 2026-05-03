/**
 * Tests for lifecycle-feature classifier path + full A01-A05 dimension strip.
 * SD-LEO-INFRA-EXTEND-CORRECTIVE-GENERATOR-001
 *
 * Follows the mock pattern established by corrective-sd-generator-a05-filter.test.js
 * (SD-LEO-INFRA-FILTER-CORRECTIVE-GENERATOR-001).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let classifySourceSD, isSourceSDA05Suppressed, SUPPRESSED_ARCHITECTURAL_DIMS, LIFECYCLE_FEATURE_KEYWORDS;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
  classifySourceSD = mod.classifySourceSD;
  isSourceSDA05Suppressed = mod.isSourceSDA05Suppressed;
  SUPPRESSED_ARCHITECTURAL_DIMS = mod.SUPPRESSED_ARCHITECTURAL_DIMS;
  LIFECYCLE_FEATURE_KEYWORDS = mod.LIFECYCLE_FEATURE_KEYWORDS;
});

describe('classifySourceSD: lifecycle-feature path', () => {
  it('feature SD with session/hook keywords + zero writes returns lifecycle_feature', () => {
    // Mirrors the source SD that triggered cancelled noise SDs 040/041/042
    // (SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001).
    const sd = {
      sd_type: 'feature',
      title: 'SessionStart hook capture-session-id.cjs identity record',
      description: 'capture session identity on SessionStart hook fire',
      scope: 'session lifecycle plumbing only',
      key_changes: [{ change: 'add session capture hook', impact: 'identity row exists' }],
    };
    expect(classifySourceSD(sd)).toBe('lifecycle_feature');
  });

  it('feature SD with single lifecycle keyword still triggers (>=1 threshold)', () => {
    const sd = {
      sd_type: 'feature',
      title: 'Add identity badge to header',
      description: 'show user identity',
      scope: 'header component',
      key_changes: [],
    };
    expect(classifySourceSD(sd)).toBe('lifecycle_feature');
  });

  it('feature SD without lifecycle keywords returns null', () => {
    const sd = {
      sd_type: 'feature',
      title: 'Add user dashboard component',
      description: 'show metrics',
      scope: 'dashboard ui',
      key_changes: [{ change: 'render dashboard', impact: 'visible to user' }],
    };
    expect(classifySourceSD(sd)).toBeNull();
  });

  it('feature SD with lifecycle keyword AND write keyword returns null (write floor)', () => {
    // The conservative path: a feature that BOTH is lifecycle-themed AND emits/persists
    // is genuine architectural surface — must not be suppressed.
    const sd = {
      sd_type: 'feature',
      title: 'Persist session identity and emit lifecycle event on capture',
      description: 'persist + emit on session start',
      scope: 'session lifecycle backend',
      key_changes: [],
    };
    expect(classifySourceSD(sd)).toBeNull();
  });

  it('non-feature type with lifecycle keywords does not trigger lifecycle path', () => {
    // Documentation SD with "session" word should still classify via documentation
    // branch, NOT via lifecycle_feature. Fixture avoids strict write verbs (update,
    // persist, etc.) since those would trigger the writeMatches >= 2 short-circuit.
    const sd = {
      sd_type: 'documentation',
      title: 'Document session capture flow',
      description: 'docs',
      scope: 'docs only',
      key_changes: [],
    };
    expect(classifySourceSD(sd)).toBe('documentation');
  });

  it('feature SD with write keyword count exactly 1 still suppressed (writeMatches===0 is required)', () => {
    // Edge case: writeMatches must be EXACTLY 0 for the lifecycle-feature path.
    // A single write keyword fails the >=2 short-circuit but also fails the ===0 floor.
    const sd = {
      sd_type: 'feature',
      title: 'SessionStart hook with persist',
      description: 'capture session identity',
      scope: 'capture',
      key_changes: [{ change: 'capture hook', impact: 'identity captured' }],
    };
    // 'persist' (write) appears once → fails writeMatches===0 → returns null
    expect(classifySourceSD(sd)).toBeNull();
  });
});

describe('Existing classifier paths unchanged', () => {
  it('CLI bugfix still returns cli_validation', () => {
    const sd = {
      sd_type: 'bugfix',
      title: 'Fix CLI parser preflight validation',
      description: 'parsing fix',
      scope: 'cli check',
      key_changes: [],
    };
    expect(classifySourceSD(sd)).toBe('cli_validation');
  });

  it('Documentation SD still returns documentation', () => {
    expect(classifySourceSD({ sd_type: 'documentation', title: 'docs', description: '', scope: '', key_changes: [] }))
      .toBe('documentation');
  });

  it('Write-heavy feature still returns null', () => {
    const sd = {
      sd_type: 'feature',
      title: 'Add user preferences API',
      description: 'persist preferences and emit lifecycle events on update',
      scope: 'API insert/update + event publishing',
      key_changes: [{ change: 'persist prefs', impact: 'emit user.updated event' }],
    };
    expect(classifySourceSD(sd)).toBeNull();
  });

  it('Null/empty source still returns null', () => {
    expect(classifySourceSD(null)).toBeNull();
    expect(classifySourceSD(undefined)).toBeNull();
    expect(classifySourceSD({})).toBeNull();
  });
});

describe('SUPPRESSED_ARCHITECTURAL_DIMS contract', () => {
  it('contains exactly A01-A05', () => {
    expect([...SUPPRESSED_ARCHITECTURAL_DIMS].sort()).toEqual(['A01', 'A02', 'A03', 'A04', 'A05']);
  });

  it('does not contain V-dimensions (vision pass-through)', () => {
    expect(SUPPRESSED_ARCHITECTURAL_DIMS.has('V01')).toBe(false);
    expect(SUPPRESSED_ARCHITECTURAL_DIMS.has('V07')).toBe(false);
    expect(SUPPRESSED_ARCHITECTURAL_DIMS.has('V11')).toBe(false);
  });

  it('does not contain A06+ (out-of-band architectural extensions, if any)', () => {
    expect(SUPPRESSED_ARCHITECTURAL_DIMS.has('A06')).toBe(false);
    expect(SUPPRESSED_ARCHITECTURAL_DIMS.has('A07')).toBe(false);
  });
});

describe('LIFECYCLE_FEATURE_KEYWORDS contract', () => {
  it('contains the six core lifecycle terms', () => {
    expect(LIFECYCLE_FEATURE_KEYWORDS).toContain('session');
    expect(LIFECYCLE_FEATURE_KEYWORDS).toContain('hook');
    expect(LIFECYCLE_FEATURE_KEYWORDS).toContain('capture');
    expect(LIFECYCLE_FEATURE_KEYWORDS).toContain('sessionstart');
    expect(LIFECYCLE_FEATURE_KEYWORDS).toContain('lifecycle');
    expect(LIFECYCLE_FEATURE_KEYWORDS).toContain('identity');
  });
});

describe('isSourceSDA05Suppressed: lifecycle_feature reason propagation', () => {
  function makeSupabase(returnRow) {
    return {
      from: () => ({
        select: () => ({
          or: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: returnRow, error: null }),
            }),
          }),
        }),
      }),
    };
  }

  it('lifecycle-feature source returns suppress=true with reason=lifecycle_feature', async () => {
    const sb = makeSupabase({
      id: 'uuid-lf', sd_key: 'SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001', sd_type: 'feature',
      title: 'SessionStart hook capture-session-id.cjs',
      description: 'capture session identity',
      scope: 'session lifecycle hook',
      key_changes: [],
    });
    const r = await isSourceSDA05Suppressed('SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001', sb);
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('lifecycle_feature');
    expect(r.sourceSdKey).toBe('SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001');
  });

  it('write-heavy feature source returns suppress=false', async () => {
    const sb = makeSupabase({
      id: 'uuid-wh', sd_key: 'SD-FEAT-API-001', sd_type: 'feature',
      title: 'Persist preferences and emit lifecycle event',
      description: 'API endpoint that persists and broadcasts',
      scope: 'persist + emit + broadcast',
      key_changes: [],
    });
    const r = await isSourceSDA05Suppressed('SD-FEAT-API-001', sb);
    expect(r.suppress).toBe(false);
    expect(r.reason).toBeNull();
  });
});
