/**
 * Regression test for QF-20260524-872 / feedback 86e0a816.
 *
 * lead-final-approval/index.js dynamically imports the KR reality-checker. The
 * specifier had one too few parent hops ('../../../../lib/eva/...'), resolving to
 * the non-existent scripts/lib/eva/kr-reality-checker.js — caught and silently
 * skipped, so the SD-completion KR reality-check never ran. This test reads the
 * ACTUAL specifier from the source and asserts it resolves to the real module, so
 * any future depth regression fails here rather than silently at runtime.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.resolve(
  __dirname,
  '../../../scripts/modules/handoff/executors/lead-final-approval/index.js'
);

describe('LEAD-FINAL-APPROVAL kr-reality-checker import (86e0a816)', () => {
  it('imports kr-reality-checker.js with a specifier that resolves to the real module', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf8');
    const m = source.match(/import\(\s*['"]([^'"]*kr-reality-checker\.js)['"]\s*\)/);
    expect(m, 'kr-reality-checker dynamic import not found in index.js').toBeTruthy();

    const specifier = m[1];
    const resolved = path.resolve(path.dirname(INDEX_PATH), specifier);
    expect(fs.existsSync(resolved), `import specifier resolves to a missing file: ${specifier}`).toBe(true);
  });

  it('the resolved module exports updateKRFromSDCompletion', async () => {
    const mod = await import('../../../lib/eva/kr-reality-checker.js');
    expect(typeof mod.updateKRFromSDCompletion).toBe('function');
  });
});
