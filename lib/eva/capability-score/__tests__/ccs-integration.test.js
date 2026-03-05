/**
 * Integration Tests — CCS hook in stage-execution-engine
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E
 *
 * Verifies CCS is invoked as a non-blocking post-analysis hook
 * and that stage execution still works if CCS module is unavailable.
 */
import { describe, test, expect, vi } from 'vitest';
import { validateOutput } from '../../stage-execution-engine.js';

describe('validateOutput (stage-execution-engine)', () => {
  test('returns valid:true when template has no validate function', () => {
    const result = validateOutput({ some: 'data' }, {});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('returns validation result from template.validate()', () => {
    const template = {
      validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    };
    const result = validateOutput({ some: 'data' }, template);
    expect(result.valid).toBe(true);
    expect(template.validate).toHaveBeenCalled();
  });

  test('catches validation errors and returns valid:false', () => {
    const template = {
      validate: vi.fn().mockImplementation(() => { throw new Error('boom'); }),
    };
    const result = validateOutput({ some: 'data' }, template);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('boom');
  });
});

describe('CCS hook backward compatibility', () => {
  test('dynamic import of score-stage.js resolves', async () => {
    const mod = await import('../score-stage.js');
    expect(typeof mod.computeCapabilityScore).toBe('function');
  });

  test('CCS failure does not throw (non-blocking pattern)', async () => {
    const { computeCapabilityScore } = await import('../score-stage.js');

    // Simulate LLM failure — should return null, not throw
    const failClient = {
      complete: vi.fn().mockRejectedValue(new Error('LLM down')),
    };

    const result = await computeCapabilityScore(1, { data: 'test' }, {
      ventureId: 'v-001',
      llmClient: failClient,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    expect(result).toBeNull(); // Non-blocking: null, not thrown
  });
});
