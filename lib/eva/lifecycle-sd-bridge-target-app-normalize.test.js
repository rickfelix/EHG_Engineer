import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'lifecycle-sd-bridge.js'), 'utf8');

describe('lifecycle-sd-bridge target_application normalization (QF-20260504-716)', () => {
  it('declares the canonical-case map and normalize helper', () => {
    expect(SRC).toMatch(/TARGET_APP_CANONICAL\s*=\s*\{[^}]*'ehg'\s*:\s*'EHG'/);
    expect(SRC).toMatch(/function normalizeTargetApplication\s*\(/);
  });

  it('wraps every target_application write site (5 sites expected)', () => {
    const matches = SRC.match(/normalizeTargetApplication\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(6); // 1 declaration + 5 call sites
  });
});
