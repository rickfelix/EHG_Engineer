/**
 * QF-20260705-716: complete-quick-fix's --auto-pr path probed gh availability with
 * `which gh` — `which` does not exist on win32, so the probe threw on every Windows
 * worker and auto-PR creation always aborted ("Please create PR manually") even with
 * gh installed and on PATH (hit live by worker Alpha completing QF-20260705-429).
 *
 * Lint-style regression tripwire (same pattern as coordinator-dispatch-work-assignment-
 * type-lint.test.js): the complete-quick-fix module tree must never probe tool
 * availability via Unix-only `which`. Cross-platform probe is `gh --version`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/modules/complete-quick-fix');

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectJsFiles(full));
    else if (/\.(js|cjs|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('complete-quick-fix — no Unix-only `which` availability probes (QF-20260705-716)', () => {
  it('no file under scripts/modules/complete-quick-fix shells `which <tool>`', () => {
    const offenders = [];
    for (const file of collectJsFiles(MODULE_DIR)) {
      const src = readFileSync(file, 'utf8');
      // Matches execSync('which gh') / exec("which foo") style probes, not prose.
      if (/execSync\(\s*['"`]which\s/.test(src) || /exec\(\s*['"`]which\s/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('orchestrator probes gh with the cross-platform `gh --version`', () => {
    const src = readFileSync(join(MODULE_DIR, 'orchestrator.js'), 'utf8');
    expect(src).toContain("execSync('gh --version'");
    expect(src).not.toContain("execSync('which gh'");
  });
});
