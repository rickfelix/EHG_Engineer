// SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-F — regression coverage for the model-config SSOT migration.
// NOTE: lib/ai/multimodal-client.js has no working runtime path under Node directly (it mixes
// `require()` with this repo's "type": "module" package.json -- confirmed pre-existing, not
// introduced by this SD; the file cannot be `require()`d/`import()`ed even under vitest's
// transform pipeline). So this asserts on CODE (matching the existing source-pin pattern in
// lib/llm/truncation-detect.test.js's "THE CEILING" describe block for this same file), not on
// runtime behavior -- and separately proves the getGoogleModel() purpose values it now depends on.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGoogleModel } from '../config/model-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(__dirname, 'multimodal-client.js'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('lib/ai/multimodal-client.js model resolution (SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-F)', () => {
  it('imports getGoogleModel from the model-config SSOT', () => {
    expect(CODE).toMatch(/import \{ getGoogleModel \} from '\.\.\/config\/model-config\.js'/);
  });

  it('the constructor default and callGemini() primary/fallback no longer hardcode a bare gemini- literal', () => {
    expect(CODE).not.toMatch(/model:\s*config\.model\s*\|\|\s*process\.env\.AI_MODEL\s*\|\|\s*'gemini-[\d.]+-\w+'/);
    expect(CODE).toMatch(/model:\s*config\.model\s*\|\|\s*process\.env\.AI_MODEL\s*\|\|\s*getGoogleModel\('vision'\)/);
    expect(CODE).not.toMatch(/primaryModel\s*=\s*this\.config\.model\s*\|\|\s*'gemini-[\d.]+-\w+'/);
    expect(CODE).toMatch(/primaryModel\s*=\s*this\.config\.model\s*\|\|\s*getGoogleModel\('vision'\)/);
    expect(CODE).not.toMatch(/fallbackModels\s*=\s*this\.config\.fallbackModels\s*\|\|\s*\['gemini-[\d.]+-\w+'\]/);
    expect(CODE).toMatch(/fallbackModels\s*=\s*this\.config\.fallbackModels\s*\|\|\s*\[getGoogleModel\('vision'\)\]/);
  });

  it('getRecommendedModel()\'s Google-family entries resolve via getGoogleModel, and the Claude entry is untouched', () => {
    expect(CODE).toMatch(/'high-accuracy':\s*getGoogleModel\('reasoning'\)/);
    expect(CODE).toMatch(/'balanced':\s*getGoogleModel\('vision'\)/);
    expect(CODE).toMatch(/'low-cost':\s*getGoogleModel\('vision'\)/);
    expect(CODE).toMatch(/'fast-screening':\s*getGoogleModel\('vision'\)/);
    expect(CODE).toMatch(/'default':\s*getGoogleModel\('vision'\)/);
    expect(CODE).toMatch(/'complex-reasoning':\s*'claude-opus-4-8'/);
  });

  it('getGoogleModel(vision|reasoning) resolve to the exact values this file used to hardcode -- proving the migration is value-preserving', () => {
    expect(getGoogleModel('vision')).toBe('gemini-2.5-flash');
    expect(getGoogleModel('reasoning')).toBe('gemini-2.5-pro');
  });
});
