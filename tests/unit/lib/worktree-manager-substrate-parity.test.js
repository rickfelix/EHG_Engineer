/**
 * SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (TS-008 / validation-agent C1)
 *
 * Drift guard: ensures every helper that touches worktree substrate items
 * imports from SUBSTRATE_ITEMS rather than string-literal repeating the names.
 *
 * Failure mode this prevents: a future maintainer adds a new helper that
 * checks (e.g.) ['lib', 'package.json'] inline, then the SUBSTRATE_ITEMS list
 * is amended (e.g., 'tools/' added) and the new helper silently lags. The
 * substrate-validation gate would then accept worktrees the old helper marks
 * as healthy — exactly the false-success class this SD eliminates.
 *
 * Approach: read scripts/resolve-sd-workdir.js (the only known external
 * consumer) and assert that any reference to substrate names appears in a
 * SUBSTRATE_ITEMS.includes()/contains check, NOT in a hardcoded array literal.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SUBSTRATE_ITEMS } from '../../../lib/worktree-manager.js';

const RESOLVE_SD_WORKDIR_PATH = path.resolve(__dirname, '../../../scripts/resolve-sd-workdir.js');

describe('SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 — substrate parity guard', () => {
  let resolveSource;

  beforeAll(() => {
    resolveSource = fs.readFileSync(RESOLVE_SD_WORKDIR_PATH, 'utf8');
  });

  it('scripts/resolve-sd-workdir.js imports SUBSTRATE_ITEMS from worktree-manager', () => {
    expect(resolveSource).toMatch(
      /import\s*\{[^}]*SUBSTRATE_ITEMS[^}]*\}\s*from\s*['"]\.\.\/lib\/worktree-manager\.js['"]/
    );
  });

  it('scripts/resolve-sd-workdir.js imports validateWorktreeSubstrate from worktree-manager', () => {
    expect(resolveSource).toMatch(
      /import\s*\{[^}]*validateWorktreeSubstrate[^}]*\}\s*from\s*['"]\.\.\/lib\/worktree-manager\.js['"]/
    );
  });

  it('node_modules and .env references in resolve-sd-workdir.js are gated on SUBSTRATE_ITEMS membership', () => {
    // The drift guard: every active-setup branch in ensureWorktreeEssentials
    // must check SUBSTRATE_ITEMS.includes(<item>) before doing the setup work.
    // This proves the helper's behavior is contractually tied to the const.
    expect(resolveSource).toMatch(/SUBSTRATE_ITEMS\.includes\(\s*['"]node_modules['"]\s*\)/);
    expect(resolveSource).toMatch(/SUBSTRATE_ITEMS\.includes\(\s*['"]\.env['"]\s*\)/);
  });

  it('SUBSTRATE_ITEMS list contains every item referenced for active setup', () => {
    // Sanity: the items the helper sets up actively must be in the contract.
    // (Reverse direction of the includes() guard above — defends against
    //  someone hardcoding an item the const doesn't cover.)
    expect(SUBSTRATE_ITEMS).toContain('node_modules');
    expect(SUBSTRATE_ITEMS).toContain('.env');
  });
});
