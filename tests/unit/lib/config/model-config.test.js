/**
 * SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001: unit tests for the two purposes added
 * to the model-config seam (image-generation, premium-generation) and their
 * env-var override independence from pre-existing purposes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getGoogleModel,
  getOpenAIModel,
  getClaudeModel,
  VALID_PURPOSES,
} from '../../../../lib/config/model-config.js';

const ENV_KEYS = [
  'GEMINI_MODEL_IMAGE_GENERATION',
  'OPENAI_MODEL_IMAGE_GENERATION',
  'CLAUDE_MODEL_PREMIUM_GENERATION',
  'CLAUDE_MODEL_SOLOMON',
  'GEMINI_MODEL',
  'OPENAI_MODEL',
  'CLAUDE_MODEL',
];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe('model-config.js image-generation and premium-generation purposes (TS-1, TS-2)', () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it('VALID_PURPOSES includes the two new purposes', () => {
    expect(VALID_PURPOSES).toContain('image-generation');
    expect(VALID_PURPOSES).toContain('premium-generation');
  });

  it('getGoogleModel("image-generation") returns the documented default', () => {
    expect(getGoogleModel('image-generation')).toBe('gemini-3-pro-image-preview');
  });

  it('getGoogleModel("image-generation") respects its env-var override', () => {
    process.env.GEMINI_MODEL_IMAGE_GENERATION = 'gemini-custom-image-model';
    expect(getGoogleModel('image-generation')).toBe('gemini-custom-image-model');
  });

  it('getOpenAIModel("image-generation") returns the documented default', () => {
    expect(getOpenAIModel('image-generation')).toBe('dall-e-3');
  });

  it('getOpenAIModel("image-generation") respects its env-var override', () => {
    process.env.OPENAI_MODEL_IMAGE_GENERATION = 'dall-e-custom';
    expect(getOpenAIModel('image-generation')).toBe('dall-e-custom');
  });

  it('getClaudeModel("premium-generation") returns claude-opus-4-8 by default', () => {
    expect(getClaudeModel('premium-generation')).toBe('claude-opus-4-8');
  });

  it('getClaudeModel("premium-generation") respects its OWN env-var override independently of "solomon"', () => {
    process.env.CLAUDE_MODEL_PREMIUM_GENERATION = 'claude-custom-premium';
    process.env.CLAUDE_MODEL_SOLOMON = 'claude-custom-solomon';
    expect(getClaudeModel('premium-generation')).toBe('claude-custom-premium');
    expect(getClaudeModel('solomon')).toBe('claude-custom-solomon');
  });

  it('changing CLAUDE_MODEL_SOLOMON does not affect premium-generation resolution', () => {
    process.env.CLAUDE_MODEL_SOLOMON = 'claude-custom-solomon';
    expect(getClaudeModel('premium-generation')).toBe('claude-opus-4-8');
  });
});
