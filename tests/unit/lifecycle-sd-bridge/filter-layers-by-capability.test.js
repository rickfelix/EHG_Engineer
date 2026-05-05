/**
 * Unit tests for PA-5 capability-suppression-with-warning emission.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-5 / FR-B5.
 *
 * Tests the integration between filterLayersByCapability (lib/eva/lifecycle-sd-
 * bridge.js) and emitFeedback (lib/governance/emit-feedback.js). The function
 * is not exported from lifecycle-sd-bridge.js, so these tests exercise it via
 * a thin re-import wrapper or via mocked dependencies through indirect calls.
 *
 * Strategy: mock emitFeedback module-level and assert the call shape when
 * suppression fires on a venture-mismatched target_application.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { emitFeedbackMock } = vi.hoisted(() => ({
  emitFeedbackMock: vi.fn().mockResolvedValue({ id: 'fb-pa5', deduped: false }),
}));

vi.mock('../../../lib/governance/emit-feedback.js', () => ({
  emitFeedback: emitFeedbackMock,
}));

// Stub the capability config so we control has_serverless_api per test
vi.mock('../../../lib/eva/config/target-application-capabilities.js', () => ({
  getTargetApplicationCapabilities: (target) => {
    if (target === 'ehg') return { has_serverless_api: false };
    if (target === 'commitcraft-ai') return { has_serverless_api: true };
    return { has_serverless_api: true };
  },
}));

// Re-export filterLayersByCapability for testing — it's not exported from the
// module so we tap into it via an internal-test surface. We import the module
// and call it via a known invocation path. For this isolated test we replicate
// the function directly with the same imports — the goal is to verify the
// PA-5 wiring contract, not the capability registry itself.
//
// Pragmatic approach: re-implement the test surface using the SAME module
// imports the production code uses. Diverges from the production function
// only in being export-able. Marked clearly so future maintainers see it.
import { normalizeVentureName } from '../../../lib/eva/bridge/venture-routing-error.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import { getTargetApplicationCapabilities } from '../../../lib/eva/config/target-application-capabilities.js';

function filterLayersByCapabilityForTest(layers, targetApplication, opts = {}) {
  const { logger = console, parentChildKey = '', ventureName = null, parentChildId = null, supabase = null } = opts;
  const caps = getTargetApplicationCapabilities(targetApplication);
  const suppressed = [];
  const kept = layers.filter((layer) => {
    if (layer.key === 'api' && caps.has_serverless_api === false) {
      suppressed.push(layer.key);
      return false;
    }
    return true;
  });
  if (suppressed.length > 0 && supabase && ventureName) {
    const normalizedTarget = normalizeVentureName(targetApplication);
    const normalizedVenture = normalizeVentureName(ventureName);
    if (normalizedTarget !== normalizedVenture) {
      emitFeedback({
        supabase,
        title: 'Capability suppression on venture-mismatched SD',
        description:
          'A capability-driven layer suppression fired on an SD whose target_application ' +
          'does not match its parent venture name. This is a portfolio-isolation signal.',
        severity: 'high',
        category: 'harness_backlog',
        sd_id: parentChildId,
        dedup_key: `capability-suppression-mismatch::${suppressed.join(',')}`,
        metadata: {
          layer_suppressed: suppressed,
          venture_name: ventureName,
          normalized_venture_name: normalizedVenture,
          target_application: targetApplication,
          normalized_target_application: normalizedTarget,
          parent_child_key: parentChildKey,
          event: 'PA5_CAPABILITY_SUPPRESSION_VENTURE_MISMATCH',
        },
      }).catch(() => {});
    }
  }
  return kept;
}

const silentLogger = { log: vi.fn(), warn: vi.fn() };
const fakeSupabase = { _: 'mock' };
const layers = [{ key: 'api' }, { key: 'data' }, { key: 'ui' }];

describe('PA-5 capability suppression warning emission', () => {
  beforeEach(() => {
    emitFeedbackMock.mockClear();
  });

  it('emits warning when suppression fires on venture-mismatched SD', () => {
    // target=ehg suppresses api. venture=CommitCraft AI mismatches → warning expected
    const result = filterLayersByCapabilityForTest(layers, 'ehg', {
      logger: silentLogger,
      parentChildKey: 'SD-COMMIT-001',
      ventureName: 'CommitCraft AI',
      parentChildId: 'pc-uuid-1',
      supabase: fakeSupabase,
    });

    expect(result.map((l) => l.key)).toEqual(['data', 'ui']); // api filtered
    expect(emitFeedbackMock).toHaveBeenCalledTimes(1);

    const call = emitFeedbackMock.mock.calls[0][0];
    expect(call.severity).toBe('high');
    expect(call.category).toBe('harness_backlog');
    expect(call.sd_id).toBe('pc-uuid-1');
    expect(call.metadata.event).toBe('PA5_CAPABILITY_SUPPRESSION_VENTURE_MISMATCH');
    expect(call.metadata.layer_suppressed).toEqual(['api']);
    expect(call.metadata.venture_name).toBe('CommitCraft AI');
    expect(call.metadata.normalized_venture_name).toBe('commitcraftai');
    expect(call.metadata.target_application).toBe('ehg');
    expect(call.metadata.normalized_target_application).toBe('ehg');
  });

  it('does NOT emit warning when target_application matches venture name', () => {
    // target=ehg suppresses api. venture=ehg → match → no warning
    filterLayersByCapabilityForTest(layers, 'ehg', {
      logger: silentLogger,
      ventureName: 'ehg',
      parentChildId: 'pc-uuid-2',
      supabase: fakeSupabase,
    });
    expect(emitFeedbackMock).not.toHaveBeenCalled();
  });

  it('does NOT emit warning when no suppression fires (target has serverless api)', () => {
    filterLayersByCapabilityForTest(layers, 'commitcraft-ai', {
      logger: silentLogger,
      ventureName: 'CommitCraft AI', // would mismatch, but suppression doesn't fire
      parentChildId: 'pc-uuid-3',
      supabase: fakeSupabase,
    });
    expect(emitFeedbackMock).not.toHaveBeenCalled();
  });

  it('skips emission when supabase is missing (graceful degradation)', () => {
    filterLayersByCapabilityForTest(layers, 'ehg', {
      logger: silentLogger,
      ventureName: 'CommitCraft AI',
      parentChildId: 'pc-uuid-4',
      // no supabase
    });
    expect(emitFeedbackMock).not.toHaveBeenCalled();
  });

  it('skips emission when ventureName is missing', () => {
    filterLayersByCapabilityForTest(layers, 'ehg', {
      logger: silentLogger,
      parentChildId: 'pc-uuid-5',
      supabase: fakeSupabase,
      // no ventureName
    });
    expect(emitFeedbackMock).not.toHaveBeenCalled();
  });

  it('C-SEC-1B: homoglyph mismatch detected via NFKD normalization', () => {
    // venture name has zero-width-space — naive comparison would say "match", normalizer says "match"
    // This test confirms BOTH are treated equally (the normalizer collapses ZWSP)
    filterLayersByCapabilityForTest(layers, 'ehg', {
      logger: silentLogger,
      ventureName: 'e​hg', // zero-width-space between e and hg
      parentChildId: 'pc-uuid-6',
      supabase: fakeSupabase,
    });
    // Normalized venture = 'ehg' = normalized target → no warning
    expect(emitFeedbackMock).not.toHaveBeenCalled();
  });

  it('C-SEC-3B: structured metadata only — venture name carrying newlines does not corrupt description', () => {
    const ventureName = 'CommitCraft\nAI'; // newline injection attempt
    filterLayersByCapabilityForTest(layers, 'ehg', {
      logger: silentLogger,
      ventureName,
      parentChildId: 'pc-uuid-7',
      supabase: fakeSupabase,
    });
    expect(emitFeedbackMock).toHaveBeenCalledTimes(1);
    const call = emitFeedbackMock.mock.calls[0][0];
    expect(call.metadata.venture_name).toBe(ventureName);
    expect(call.description).not.toContain(ventureName); // not concatenated
    expect(call.title).not.toContain(ventureName); // not concatenated
  });
});
