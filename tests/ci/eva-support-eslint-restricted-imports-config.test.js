/**
 * CI invariant T3 — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / FR-8.
 *
 * Verifies that eslint.config.js contains the per-directory `no-restricted-imports`
 * rule for lib/eva-support/** + scripts/eva-support/** that bans process-spawning
 * modules at lint time.
 *
 * T1 (vitest) catches violations at test time; T3 (this test + the config block)
 * catches them earlier — at lint/IDE time. Both layers must agree.
 *
 * Implementation: static-source scan of eslint.config.js. We do NOT actually
 * run ESLint here (too slow for CI); we verify the config block is present
 * with the right shape.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESLINT_CONFIG_PATH = join(REPO_ROOT, 'eslint.config.js');

describe('T3: eva-support ESLint no-restricted-imports config', () => {
  const source = readFileSync(ESLINT_CONFIG_PATH, 'utf8');

  it('eslint.config.js targets lib/eva-support/** and scripts/eva-support/**', () => {
    expect(source).toMatch(/['"]lib\/eva-support\/\*\*\/\*[^'"]*['"]/);
    expect(source).toMatch(/['"]scripts\/eva-support\/\*\*\/\*[^'"]*['"]/);
    // Sanity: must appear inside a `files:` array.
    expect(source).toMatch(/files:\s*\[[^\]]*lib\/eva-support/);
  });

  it('eslint.config.js declares no-restricted-imports rule', () => {
    expect(source).toMatch(/['"]no-restricted-imports['"]/);
  });

  it('rule bans child_process / execa / cross-spawn / shelljs', () => {
    const requiredBans = ['child_process', 'execa', 'cross-spawn', 'shelljs'];
    for (const banned of requiredBans) {
      // Module name must appear in a name: 'X' field within the rule block.
      const re = new RegExp(`name:\\s*['"]${banned.replace(/[-/]/g, '\\$&')}['"]`);
      expect(source).toMatch(re);
    }
  });

  it('rule blocks decision-log-store insertEntry import (T7 boundary at lint-time)', () => {
    expect(source).toMatch(/group:\s*\[\s*['"][^'"]*decision-log-store/);
    expect(source).toMatch(/importNames:\s*\[\s*['"]insertEntry['"]/);
  });

  it('rule cites the canonical SD reference (auditability)', () => {
    expect(source).toMatch(/SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C/);
  });
});
