/**
 * Static negative test (PRD FR-7): proves the scan is mechanically unable to write to
 * .env or lib/config/model-config.js. Greps every file the scan owns for any reference
 * to those paths as a write target and asserts zero matches. Defense-in-depth, not the
 * sole guarantee -- the deeper guarantee is architectural: TR-2 names the only two
 * writers (known-models JSON, feedback insert), and neither file below touches fs
 * writes to any other path.
 */
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const SCAN_OWNED_FILES = [
  'lib/gemini-scan/models-api-client.js',
  'lib/gemini-scan/lifecycle-classifier.js',
  'lib/gemini-scan/diff-known-models.js',
  'lib/gemini-scan/cost-cap.js',
  'lib/gemini-scan/candidate-eval.js',
  'lib/gemini-scan/recommendation-builder.js',
  'scripts/gemini-weekly-scan.mjs',
];

const FS_WRITE_CALL = /\.(writeFileSync|writeFile|appendFileSync|appendFile)\(/;
const FORBIDDEN_WRITE_TARGETS = ['.env', 'model-config.js'];

describe('gemini-scan write-path separation', () => {
  test.each(SCAN_OWNED_FILES)('%s: no fs-write call line references .env or model-config.js as its target', (relPath) => {
    const lines = fs.readFileSync(path.join(repoRoot, relPath), 'utf8').split('\n');
    const writeLines = lines.filter((line) => FS_WRITE_CALL.test(line) || /^\s*(writeFile|writeFileSync)\(/.test(line));
    for (const line of writeLines) {
      for (const target of FORBIDDEN_WRITE_TARGETS) {
        expect(line.includes(target)).toBe(false);
      }
    }
  });

  test('only scripts/gemini-weekly-scan.mjs (the declared I/O shell) contains any fs-write reference; every pure lib/gemini-scan/* module has none', () => {
    for (const relPath of SCAN_OWNED_FILES.filter((f) => f !== 'scripts/gemini-weekly-scan.mjs')) {
      const content = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
      expect(/writeFileSync|appendFileSync|appendFile\(/.test(content)).toBe(false);
    }
  });
});
