import { describe, it, expect } from 'vitest';
import { evaluatePlugin, RELEVANCE_KEYWORDS, MAX_SCORE } from '../../../lib/plugins/fitness-rubric.js';

describe('fitness-rubric', () => {
  const basePlugin = {
    plugin_name: 'test-plugin',
    source_path: 'tools/test-plugin',
    source_repo: 'anthropics/test',
  };

  it('scores a relevant plugin higher than irrelevant one', () => {
    const relevant = evaluatePlugin(
      { ...basePlugin, plugin_name: 'financial-analysis-tool' },
      { description: 'Portfolio investment scoring and evaluation', files: ['config.json', 'README.md'] }
    );
    const irrelevant = evaluatePlugin(
      { ...basePlugin, plugin_name: 'hello-world-demo' },
      { description: 'A simple demo tutorial', files: [] }
    );
    expect(relevant.score).toBeGreaterThanOrEqual(irrelevant.score);
  });

  it('returns score between 0 and MAX_SCORE', () => {
    const result = evaluatePlugin(basePlugin, {});
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(MAX_SCORE);
  });

  it('returns evaluation object with required fields', () => {
    const result = evaluatePlugin(basePlugin, { files: ['config.json'] });
    expect(result.evaluation).toHaveProperty('relevance');
    expect(result.evaluation).toHaveProperty('format_compatible');
    expect(result.evaluation).toHaveProperty('security_ok');
    expect(result.evaluation).toHaveProperty('adaptation_notes');
  });

  it('detects format compatibility from config files', () => {
    const filePlugin = { ...basePlugin, source_path: 'tools/test.js' }; // file path, not dir
    const withConfig = evaluatePlugin(filePlugin, { files: ['config.json', 'README.md'] });
    const withoutConfig = evaluatePlugin(filePlugin, { files: ['index.js'] });
    expect(withConfig.evaluation.format_compatible).toBe(true);
    expect(withoutConfig.evaluation.format_compatible).toBe(false);
  });

  it('detects directory-based plugins as format compatible', () => {
    const dirPlugin = { ...basePlugin, source_path: 'tools/plugin-dir' };
    const result = evaluatePlugin(dirPlugin, { files: [] });
    expect(result.evaluation.format_details.is_directory).toBe(true);
  });

  it('flags security concerns for sensitive files', () => {
    const result = evaluatePlugin(basePlugin, { files: ['.env', 'config.json'] });
    expect(result.evaluation.security_ok).toBe(false);
    expect(result.evaluation.security_notes).toContain('sensitive');
  });

  it('passes security check for clean files', () => {
    const result = evaluatePlugin(basePlugin, { files: ['config.json', 'README.md'] });
    expect(result.evaluation.security_ok).toBe(true);
  });

  it('generates adaptation notes', () => {
    const result = evaluatePlugin(
      { ...basePlugin, plugin_name: 'financial-venture-tool' },
      { description: 'Investment portfolio analysis', files: ['config.json'] }
    );
    expect(typeof result.evaluation.adaptation_notes).toBe('string');
    expect(result.evaluation.adaptation_notes.length).toBeGreaterThan(0);
  });

  it('exports constants', () => {
    expect(RELEVANCE_KEYWORDS).toBeDefined();
    expect(RELEVANCE_KEYWORDS).toHaveProperty('high');
    expect(RELEVANCE_KEYWORDS).toHaveProperty('medium');
    expect(MAX_SCORE).toBe(10);
  });
});
