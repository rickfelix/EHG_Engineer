import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

const GUARDIAN_FILES = [
  resolve(REPO_ROOT, 'scripts/modules/orchestrator-completion-guardian.js'),
  resolve(REPO_ROOT, 'scripts/modules/handoff/orchestrator-completion-guardian.js'),
];

describe('orchestrator-completion-guardian retrospective shape', () => {
  it.each(GUARDIAN_FILES)(
    '%s does not set retrospective_type on SD-completion retro INSERT (gate filter requires NULL)',
    (file) => {
      const src = readFileSync(file, 'utf8');
      expect(src).toMatch(/retro_type:\s*'SD_COMPLETION'/);
      expect(src).not.toMatch(/retrospective_type\s*:/);
    }
  );
});
