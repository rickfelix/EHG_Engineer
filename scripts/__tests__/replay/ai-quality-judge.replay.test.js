import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixturesForScript, runReplay, assertParity } from './index.mjs';
import {
  generateEvaluationPrompt,
  generateBatchEvaluationPrompt,
  generateReEvaluationPrompt,
  validateEvaluationPromptShape,
  validateBatchEvaluationPromptShape,
  validateReEvaluationPromptShape,
} from '../../modules/ai-quality-judge/prompts.js';

const GOLDEN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../golden');

const promptFnByBuilder = {
  evaluation: async (input) => generateEvaluationPrompt(input.improvement, input.constitutionRules),
  batch: async (input) => generateBatchEvaluationPrompt(input.improvements, input.constitutionRules),
  're-evaluation': async (input) => generateReEvaluationPrompt(input.improvement, input.previousAssessment, input.constitutionRules),
};

const validatorByBuilder = {
  evaluation: (output) => validateEvaluationPromptShape(output),
  batch: (output) => validateBatchEvaluationPromptShape(output),
  're-evaluation': (output) => validateReEvaluationPromptShape(output),
};

describe('replay: ai-quality-judge (PR #2 of campaign — sole remaining V1->V2 target)', async () => {
  const fixtures = await loadFixturesForScript('ai-quality-judge', GOLDEN_ROOT);

  it('loads at least 10 sanitized fixtures (FR-1 AC-1)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it('fixture corpus covers all 3 builders', () => {
    const builders = new Set(fixtures.map(f => f.builder));
    expect(builders.has('evaluation')).toBe(true);
    expect(builders.has('batch')).toBe(true);
    expect(builders.has('re-evaluation')).toBe(true);
  });

  for (const fixture of fixtures) {
    it(`parity holds for ${fixture.label} (builder=${fixture.builder})`, async () => {
      const promptFn = promptFnByBuilder[fixture.builder];
      const validator = validatorByBuilder[fixture.builder];
      expect(promptFn, `unknown builder ${fixture.builder}`).toBeTypeOf('function');
      expect(validator, `unknown builder ${fixture.builder}`).toBeTypeOf('function');
      const { v2Result } = await runReplay({ promptFn, fixture, validator });
      assertParity({
        v1Result: fixture.validator_result,
        v2Result,
        fixturePath: fixture.label,
      });
    });
  }

  describe('V2 imperative voice (FR-3 AC)', () => {
    const sampleImprovement = {
      id: 'imp-test-0001', improvement_type: 'CRUD_INSERT', target_table: 't', target_operation: 'INSERT',
      risk_tier: 'AUTO', evidence_count: 3, description: 'd', payload: {}, source_retro_id: 'r-1',
    };
    const sampleRules = [{ rule_code: 'CONST-001', rule_text: 'r', rationale: 'why' }];

    it('evaluation prompt does not open with declarative "You are an AI Quality Judge"', () => {
      const prompt = generateEvaluationPrompt(sampleImprovement, sampleRules);
      expect(prompt).not.toMatch(/You are an AI Quality Judge/);
    });

    it('evaluation prompt body uses imperative opener (Evaluate)', () => {
      const prompt = generateEvaluationPrompt(sampleImprovement, sampleRules);
      // After the markdown header line, the next non-blank line must start with an imperative verb.
      const afterHeader = prompt.split('\n').slice(2).join('\n').trim();
      expect(afterHeader).toMatch(/^(Evaluate|Score|Apply|Check|Identify|Verify|Return) /);
    });

    it('batch prompt does not contain declarative "You are" framing', () => {
      const prompt = generateBatchEvaluationPrompt([sampleImprovement, sampleImprovement], sampleRules);
      expect(prompt).not.toMatch(/^You are /m);
    });

    it('re-evaluation prompt does not contain "Please evaluate" deferential phrasing', () => {
      const prev = { score: 60, recommendation: 'NEEDS_REVISION', reasoning: 'r' };
      const prompt = generateReEvaluationPrompt(sampleImprovement, prev, sampleRules);
      expect(prompt).not.toMatch(/Please evaluate/);
      expect(prompt).toMatch(/Verify whether/);
    });
  });

  describe('shape validators reject malformed input', () => {
    it('validateEvaluationPromptShape rejects empty / non-string', () => {
      expect(validateEvaluationPromptShape('').passed).toBe(false);
      expect(validateEvaluationPromptShape(null).passed).toBe(false);
      expect(validateEvaluationPromptShape(undefined).passed).toBe(false);
      expect(validateEvaluationPromptShape(42).passed).toBe(false);
    });

    it('validateEvaluationPromptShape rejects prompt missing required markers', () => {
      const r = validateEvaluationPromptShape('Just words, no scoring criteria.');
      expect(r.passed).toBe(false);
      expect(r.details).toMatch(/missing markers/);
    });

    it('validateBatchEvaluationPromptShape requires evaluations / improvement_id markers', () => {
      const r = validateBatchEvaluationPromptShape('Single proposal, no array.');
      expect(r.passed).toBe(false);
    });

    it('validateReEvaluationPromptShape requires previous-assessment marker on top of base', () => {
      // Build a prompt that has all base markers but no "previous"
      const minimalBase = `constitution criteria_scores reasoning recommendation safety specificity necessity evidence atomicity APPROVE NEEDS_REVISION REJECT JSON`;
      const r = validateReEvaluationPromptShape(minimalBase);
      expect(r.passed).toBe(false);
      expect(r.details).toMatch(/previous/);
    });
  });
});
