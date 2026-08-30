/**
 * SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001 (FR-1, FR-2)
 *
 * Unit tests for the pull_request SD resolver. Two-sided contract (coordinator's verbatim
 * shape): a PR on the branch of an SD that carries a bypass finding MUST fail; a PR on an
 * unrelated SD's branch (or a non-SD branch) MUST NOT fail on that finding. This file proves the
 * RESOLUTION half of that contract -- which SD (if any) a given branch resolves to. The
 * validator's own pre-existing per-SD logic (validateSDTimeline) is unchanged and untested here.
 */
import { describe, test, expect, vi } from 'vitest';
import { resolvePrBypassSd } from '../../../scripts/ci/resolve-pr-bypass-sd.mjs';

function makeFakeSupabase(rowsByKey) {
  return {
    from: (table) => {
      expect(table).toBe('strategic_directives_v2');
      return {
        select: () => ({
          eq: (col, val) => {
            expect(col).toBe('sd_key');
            return { maybeSingle: async () => ({ data: rowsByKey[val] || null, error: null }) };
          },
        }),
      };
    },
  };
}

describe('resolvePrBypassSd', () => {
  test('SD-branded branch resolves to its live UUID (positive path -- own-SD check can fire)', async () => {
    const supabase = makeFakeSupabase({ 'SD-LEO-INFRA-EXAMPLE-001': { id: 'uuid-123' } });
    const result = await resolvePrBypassSd('feat/SD-LEO-INFRA-EXAMPLE-001', supabase);
    expect(result).toEqual({ resolution: 'resolved', sdUuid: 'uuid-123', sdKey: 'SD-LEO-INFRA-EXAMPLE-001' });
  });

  test('a non-SD branch (docs/chore/etc) skips rather than failing (scoping test -- unrelated work is never blocked)', async () => {
    const supabase = makeFakeSupabase({});
    const result = await resolvePrBypassSd('docs/update-readme', supabase);
    expect(result).toEqual({ resolution: 'skip-no-key', sdUuid: null, sdKey: null });
  });

  test('a QF-branded branch skips (QFs carry no sd_phase_handoffs timeline to validate)', async () => {
    const supabase = makeFakeSupabase({});
    const result = await resolvePrBypassSd('qf/QF-20260829-001', supabase);
    expect(result).toEqual({ resolution: 'skip-qf', sdUuid: null, sdKey: 'QF-20260829-001' });
  });

  test('an SD-branded branch that resolves to nothing FAILS CLOSED, not silently passes', async () => {
    const supabase = makeFakeSupabase({});
    const result = await resolvePrBypassSd('feat/SD-LEO-INFRA-GHOST-001', supabase);
    expect(result.resolution).toBe('unresolved-sd');
    expect(result.sdUuid).toBeNull();
    expect(result.sdKey).toBe('SD-LEO-INFRA-GHOST-001');
  });

  test('an empty/undefined branch skips rather than throwing', async () => {
    const supabase = makeFakeSupabase({});
    const result = await resolvePrBypassSd('', supabase);
    expect(result.resolution).toBe('skip-no-key');
  });

  test('propagates a real DB error rather than treating it as unresolved (never silently green on a query failure)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'connection refused' } }) }),
        }),
      }),
    };
    await expect(resolvePrBypassSd('feat/SD-LEO-INFRA-EXAMPLE-001', supabase)).rejects.toThrow(/connection refused/);
  });
});

describe('leo-bypass-validation.yml -- source-pin on the wiring', () => {
  test('the workflow scopes the pull_request ARGS to the resolved SD UUID, and skips (never fails) on skip-no-key/skip-qf', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const ROOT = path.resolve(__dirname, '../../..');
    const yml = readFileSync(path.join(ROOT, '.github/workflows/leo-bypass-validation.yml'), 'utf8');

    expect(yml).toContain('scripts/ci/resolve-pr-bypass-sd.mjs');
    expect(yml).toMatch(/ARGS="--sd=\$\{\{ steps\.resolve-pr-sd\.outputs\.sd_uuid \}\}"/);
    expect(yml).toMatch(/resolution == 'skip-no-key' \|\| steps\.resolve-pr-sd\.outputs\.resolution == 'skip-qf'/);
    // workflow_dispatch behavior byte-equivalent: original sd_id/validate_all handling preserved.
    expect(yml).toContain('github.event.inputs.sd_id');
    expect(yml).toContain('github.event.inputs.validate_all');
  });
});
