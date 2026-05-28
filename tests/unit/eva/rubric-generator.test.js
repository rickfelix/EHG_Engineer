/**
 * Tests for lib/eva/rubric-generator.js
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-2 / TS-5..TS-10).
 */
import { describe, it, expect } from 'vitest';
import { generateVentureRubrics } from '../../../lib/eva/rubric-generator.js';

function makeValidRubric(dimId) {
  return {
    id: dimId,
    name: 'venture_dim_' + dimId,
    checks: [
      { id: `${dimId}-C1`, label: 'has worker file', type: 'file_exists', weight: 40, params: { glob: 'src/workers/*.js' } },
      { id: `${dimId}-C2`, label: 'exports run', type: 'export_exists', weight: 30, params: { module: 'src/main.js', exportName: 'run' } },
      { id: `${dimId}-C3`, label: 'config schema', type: 'code_pattern', weight: 30, params: { glob: 'src/**/*.js', pattern: 'z\\.object' } },
    ],
  };
}

function makeMockClient(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    isInlineOnly: false,
    model: 'mock-model',
    async complete(system, user) {
      calls.push({ system, user });
      if (queue.length === 0) {
        return { content: '{}' };
      }
      const next = queue.shift();
      return { content: typeof next === 'string' ? next : JSON.stringify(next) };
    },
  };
}

function makeInlineOnlyClient() {
  return {
    isInlineOnly: true,
    async complete() { return { content: '{}' }; },
  };
}

describe('generateVentureRubrics', () => {
  it('TS-5: generates valid Map<dimId, rubric> for 2 vision + 2 arch dims (mocked LLM)', async () => {
    const client = makeMockClient([
      makeValidRubric('V01'),
      makeValidRubric('V02'),
      makeValidRubric('A01'),
      makeValidRubric('A02'),
    ]);
    const vision = { extracted_dimensions: [{ name: 'd1', weight: 0.5 }, { name: 'd2', weight: 0.5 }] };
    const arch = { extracted_dimensions: [{ name: 'a1', weight: 0.5 }, { name: 'a2', weight: 0.5 }] };
    const { rubrics, meta } = await generateVentureRubrics({
      vision, arch, targetPath: '/fake/venture', llmClient: client, retries: 0,
    });
    expect(rubrics).toBeInstanceOf(Map);
    expect(rubrics.size).toBe(4);
    expect(rubrics.get('V01').id).toBe('V01');
    expect(rubrics.get('A02').id).toBe('A02');
    expect(rubrics.get('V01').checks.length).toBeGreaterThanOrEqual(3);
    expect(meta.generator_model).toBe('mock-model');
    expect(client.calls.length).toBe(4);
  });

  it('TS-6: rejects LLM rubric with <3 checks (validateRubricStrict catches)', async () => {
    const tooFew = {
      id: 'V01', name: 'foo',
      checks: [
        { id: 'V01-C1', label: 'a', type: 'file_exists', weight: 50, params: { glob: 'a' } },
        { id: 'V01-C2', label: 'b', type: 'file_exists', weight: 50, params: { glob: 'b' } },
      ],
    };
    const client = makeMockClient([tooFew, tooFew]); // returns 2 checks both attempts
    const vision = { extracted_dimensions: [{ name: 'd1' }] };
    await expect(generateVentureRubrics({
      vision, arch: { extracted_dimensions: [] }, targetPath: '/x', llmClient: client, retries: 1,
    })).rejects.toThrow(/checks\.length=2/);
  });

  it('TS-7: rejects LLM rubric with check.type outside ALLOWED_CHECK_TYPES', async () => {
    const badType = {
      id: 'V01', name: 'foo',
      checks: [
        { id: 'V01-C1', label: 'a', type: 'sql_query', weight: 34, params: { table: 't' } },
        { id: 'V01-C2', label: 'b', type: 'file_exists', weight: 33, params: { glob: 'b' } },
        { id: 'V01-C3', label: 'c', type: 'file_exists', weight: 33, params: { glob: 'c' } },
      ],
    };
    const client = makeMockClient([badType, badType]);
    await expect(generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client, retries: 1,
    })).rejects.toThrow(/type='sql_query'/);
  });

  it('TS-8: rejects LLM rubric with empty params (no concrete-reference field)', async () => {
    const empty = {
      id: 'V01', name: 'foo',
      checks: [
        { id: 'V01-C1', label: 'a', type: 'file_exists', weight: 34, params: {} },
        { id: 'V01-C2', label: 'b', type: 'file_exists', weight: 33, params: { glob: 'b' } },
        { id: 'V01-C3', label: 'c', type: 'file_exists', weight: 33, params: { glob: 'c' } },
      ],
    };
    const client = makeMockClient([empty, empty]);
    await expect(generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client, retries: 1,
    })).rejects.toThrow(/no non-empty concrete-reference field/);
  });

  it('TS-9: retries once on validation failure; succeeds on second valid response', async () => {
    const bad = { id: 'V01', name: 'foo', checks: [] }; // invalid: empty
    const good = makeValidRubric('V01');
    const client = makeMockClient([bad, good]);
    const { rubrics } = await generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client, retries: 1,
    });
    expect(rubrics.size).toBe(1);
    expect(rubrics.get('V01').checks.length).toBeGreaterThanOrEqual(3);
    expect(client.calls.length).toBe(2);
  });

  it('TS-10: throws explicit error when LLM client is inline-only (TR-6 refused-silent-fallback)', async () => {
    const client = makeInlineOnlyClient();
    await expect(generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client, retries: 1,
    })).rejects.toThrow(/REFUSING silent fallback to EHG rubrics/);
  });

  it('weights must sum to 100 ±2 — boundary tolerance', async () => {
    // Same rubric with weights summing to 95 should be rejected; 101 should pass.
    const w95 = {
      id: 'V01', name: 'foo',
      checks: [
        { id: 'V01-C1', label: 'a', type: 'file_exists', weight: 30, params: { glob: 'a' } },
        { id: 'V01-C2', label: 'b', type: 'file_exists', weight: 30, params: { glob: 'b' } },
        { id: 'V01-C3', label: 'c', type: 'file_exists', weight: 35, params: { glob: 'c' } },
      ],
    };
    const client95 = makeMockClient([w95, w95]);
    await expect(generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client95, retries: 1,
    })).rejects.toThrow(/weight sum=95/);

    const w101 = {
      id: 'V01', name: 'foo',
      checks: [
        { id: 'V01-C1', label: 'a', type: 'file_exists', weight: 34, params: { glob: 'a' } },
        { id: 'V01-C2', label: 'b', type: 'file_exists', weight: 34, params: { glob: 'b' } },
        { id: 'V01-C3', label: 'c', type: 'file_exists', weight: 33, params: { glob: 'c' } },
      ],
    };
    const client101 = makeMockClient([w101]);
    const { rubrics } = await generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client101, retries: 0,
    });
    expect(rubrics.get('V01').checks.length).toBe(3);
  });

  it('auto-assigns missing check ids', async () => {
    const noIds = {
      id: 'V01', name: 'foo',
      checks: [
        { label: 'a', type: 'file_exists', weight: 34, params: { glob: 'a' } },
        { label: 'b', type: 'file_exists', weight: 33, params: { glob: 'b' } },
        { label: 'c', type: 'file_exists', weight: 33, params: { glob: 'c' } },
      ],
    };
    const client = makeMockClient([noIds]);
    const { rubrics } = await generateVentureRubrics({
      vision: { extracted_dimensions: [{ name: 'd1' }] },
      arch: { extracted_dimensions: [] },
      targetPath: '/x', llmClient: client, retries: 0,
    });
    const r = rubrics.get('V01');
    expect(r.checks[0].id).toBe('V01-C1');
    expect(r.checks[2].id).toBe('V01-C3');
  });
});
