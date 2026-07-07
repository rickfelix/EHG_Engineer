/**
 * Static-source-scan verification for SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001.
 * Confirms each migrated call site resolves its model via lib/config/model-config.js
 * purposes instead of a hardcoded literal, and confirms the 3 non-model-config fixes
 * (proposer dedup, generated_by provenance, --help text) landed as described.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001: model-config migration (FR-2, FR-3, FR-4)', () => {
  const purposeSites = [
    { file: 'lib/eva/qa/stitch-wireframe-qa.js', fn: 'getClaudeModel', purpose: 'vision' },
    { file: 'lib/integrations/youtube/transcript-fallback.js', fn: 'getGoogleModel', purpose: 'fast' },
    { file: 'lib/integrations/youtube/video-metadata.js', fn: 'getGoogleModel', purpose: 'vision' },
    { file: 'lib/programmatic/tool-loop.js', fn: 'getClaudeModel', purpose: 'generation' },
    { file: 'lib/programmatic/tool-loop.js', fn: 'getGoogleModel', purpose: 'generation' },
    { file: 'lib/uat/feedback-analyzer.js', fn: 'getGoogleModel', purpose: 'fast' },
    { file: 'scripts/modules/ai-quality-judge/config.js', fn: 'getClaudeModel', purpose: 'generation' },
    { file: 'scripts/modules/child-sd-llm-service.mjs', fn: 'getOpenAIModel', purpose: 'generation' },
    { file: 'lib/competitive-intelligence/differentiation-board.js', fn: 'getClaudeModel', purpose: 'premium-generation' },
    // SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001 (FR-4): S17 generation re-pointed premium-generation -> design-generation (Fable).
    { file: 'lib/eva/stage-17/refinement.js', fn: 'getClaudeModel', purpose: 'design-generation' },
    { file: 'scripts/eva-support/_internal/anthropic-client.js', fn: 'getClaudeModel', purpose: 'premium-generation' },
    { file: 'lib/marketing/ai/image-generator.js', fn: 'getGoogleModel', purpose: 'image-generation' },
    { file: 'scripts/lib/visualization-provider.js', fn: 'getGoogleModel', purpose: 'image-generation' },
    { file: 'scripts/lib/visualization-provider.js', fn: 'getOpenAIModel', purpose: 'image-generation' },
    { file: 'lib/skunkworks/proposal-agent.js', fn: 'getClaudeModel', purpose: 'fast' },
    { file: 'scripts/eva/srip/quality-checker.mjs', fn: 'getClaudeModel', purpose: 'fast' },
    { file: 'lib/agents/context-monitor.js', fn: 'getOpenAIModel', purpose: 'classification' },
  ];

  it.each(purposeSites)('$file resolves via $fn(\'$purpose\')', ({ file, fn, purpose }) => {
    const src = read(file);
    expect(src).toContain('import');
    expect(src).toMatch(new RegExp(`${fn}\\s*\\(\\s*['"]${purpose}['"]\\s*\\)`));
  });

  it('none of the migrated files retain a bare claude-haiku-4-5-20251001/claude-opus-4-8/gpt- fallback literal as the primary resolution', () => {
    const bareLiteralFiles = [
      'lib/eva/qa/stitch-wireframe-qa.js',
      'lib/programmatic/tool-loop.js',
      'lib/competitive-intelligence/differentiation-board.js',
      'lib/eva/stage-17/refinement.js',
      'scripts/eva-support/_internal/anthropic-client.js',
      'lib/skunkworks/proposal-agent.js',
      'scripts/eva/srip/quality-checker.mjs',
    ];
    for (const file of bareLiteralFiles) {
      const src = read(file);
      // The literal may still appear as a documented default INSIDE model-config.js itself,
      // but these call sites should no longer hardcode it directly as the resolution value.
      expect(src).not.toMatch(/model:\s*client\._model\s*\|\|\s*['"]claude-(haiku|opus)-[\d.-]+['"]/);
      expect(src).not.toMatch(/getClaudeModel\s*\([^)]*\)\s*\|\|\s*['"]claude-opus-4-8['"]/);
    }
  });
});

describe('SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001: FR-5 ai-quality-judge proposer dedup', () => {
  it('index.js reads proposer model from config.js, not a re-hardcoded literal', () => {
    const index = read('scripts/modules/ai-quality-judge/index.js');
    expect(index).toContain('MODEL_CONFIG.proposer.model');
    expect(index).not.toMatch(/proposer.*claude-sonnet-4-20250514/);
  });

  it('config.js is the single definition point for the proposer model', () => {
    const config = read('scripts/modules/ai-quality-judge/config.js');
    expect(config).toMatch(/proposer:\s*\{[^}]*model:\s*getClaudeModel\('generation'\)/s);
  });
});

describe('SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001: FR-6 sd-baseline-intelligent.js generated_by provenance', () => {
  it('derives generated_by from the resolved adapter model, not a static gpt-5.2 string', () => {
    const src = read('scripts/sd-baseline-intelligent.js');
    expect(src).toMatch(/const generationModelUsed = openai\.model \|\| openai\.modelId \|\| 'unknown'/);
    expect(src).toMatch(/generated_by:\s*generationModelUsed/);
    expect(src).not.toMatch(/generated_by:\s*['"]gpt-5\.2['"]/);
  });
});

describe('SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001: FR-7 semantic-target-application-validator.js --help text', () => {
  it('help text no longer states a static gpt-5.2 default', () => {
    const src = read('scripts/validators/semantic-target-application-validator.js');
    expect(src).not.toMatch(/--model.*default.*gpt-5\.2/i);
    expect(src).toMatch(/--model.*resolved via lib\/config\/model-config\.js/i);
  });
});

describe('SD-LEO-FIX-MIGRATE-RUNTIME-MODEL-001: FR-9 context-monitor.js purpose conflict resolved', () => {
  it('resolves via getOpenAIModel(classification) with no competing bare gpt-4 override', () => {
    const src = read('lib/agents/context-monitor.js');
    expect(src).toMatch(/getOpenAIModel\s*\(\s*['"]classification['"]\s*\)/);
    expect(src).not.toMatch(/model:\s*['"]gpt-4['"]/);
  });
});
