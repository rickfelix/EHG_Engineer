import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixturesForScript, runReplay, assertParity } from './index.mjs';
import { buildDomainPrompt, validateDomainPromptShape } from '../../eva/srip/quality-checker.mjs';

const GOLDEN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../golden');

const promptFn = async (input) => buildDomainPrompt(input.domainKey);
const validator = (output) => validateDomainPromptShape(output);

describe('replay: quality-checker (PR #2 of campaign)', async () => {
  const fixtures = await loadFixturesForScript('quality-checker', GOLDEN_ROOT);

  it('loads at least 10 sanitized fixtures (FR-2 AC-1)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  for (const fixture of fixtures) {
    it(`parity holds for ${fixture.captured_at} (domainKey="${fixture.input.domainKey}")`, async () => {
      const { v2Result } = await runReplay({ promptFn, fixture, validator });
      assertParity({
        v1Result: fixture.validator_result,
        v2Result,
        fixturePath: fixture.captured_at,
      });
    });
  }

  it('V2 prompt for known domain "layout" uses imperative voice (Compare/Score/Identify/Return)', () => {
    const prompt = buildDomainPrompt('layout');
    expect(prompt).toMatch(/^Compare /);
    expect(prompt).toMatch(/Score /);
    expect(prompt).toMatch(/Identify /);
    expect(prompt).toMatch(/Return /);
    expect(prompt).not.toMatch(/^You are /);
  });

  it('V2 prompt falls back to technical for unknown domain key', () => {
    const fallback = buildDomainPrompt('unknown_zzz');
    const technical = buildDomainPrompt('technical');
    expect(fallback).toBe(technical);
  });

  it('validateDomainPromptShape rejects empty / non-string', () => {
    expect(validateDomainPromptShape('').passed).toBe(false);
    expect(validateDomainPromptShape(null).passed).toBe(false);
    expect(validateDomainPromptShape(undefined).passed).toBe(false);
    expect(validateDomainPromptShape(42).passed).toBe(false);
  });

  it('validateDomainPromptShape rejects prompt missing output-spec markers', () => {
    const r = validateDomainPromptShape('Just words, no JSON spec.');
    expect(r.passed).toBe(false);
    expect(r.details).toMatch(/missing markers/);
  });
});
