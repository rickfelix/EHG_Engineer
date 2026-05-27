/**
 * CI invariant T1 — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / FR-8.
 *
 * Bans static imports of process-spawning modules in all eva-support code:
 *   - child_process (any form: require, import, dynamic import)
 *   - execa
 *   - cross-spawn
 *   - shelljs
 *
 * Why: EVA Support must remain emit-only. Phase 3 emits a /leo create command
 * STRING for the chairman to run manually; if EVA ever gained the ability to
 * spawn subprocesses, the recommendation emitter would risk becoming a writer
 * to strategic_directives_v2 via /leo create execution. This test is the
 * primary structural defense against that drift (R4 mitigation).
 *
 * Walker pattern matches tests/ci/dashboard-quarantine-lint.test.js +
 * tests/ci/active-sd-predicate-parity.test.js: fs traversal + regex scan,
 * NEVER substring-exclude '.worktrees' (else this test would silently pass
 * when run from a worktree).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Directories scanned by T1.
const SCAN_DIRS = ['lib/eva-support', 'scripts/eva-support'];

// Bans. Each ban includes a regex (ECMAScript) and a human-readable name.
const BANNED_IMPORTS = [
  { name: 'child_process', regex: /\b(?:from\s+|require\(\s*)['"]child_process['"]/ },
  { name: 'execa', regex: /\b(?:from\s+|require\(\s*)['"]execa['"]/ },
  { name: 'cross-spawn', regex: /\b(?:from\s+|require\(\s*)['"]cross-spawn['"]/ },
  { name: 'shelljs', regex: /\b(?:from\s+|require\(\s*)['"]shelljs['"]/ },
  // Direct calls to dangerous APIs (in case anyone destructures from a re-exporter).
  { name: 'spawn()', regex: /\bspawn\s*\(/ },
  { name: 'execFile()', regex: /\bexecFile\s*\(/ },
  { name: 'fork()', regex: /\bfork\s*\(/ },
];

function walkJSFiles(p, acc = []) {
  if (!existsSync(p)) return acc;
  const st = statSync(p);
  if (st.isFile()) {
    if (/\.(js|mjs|ts|cjs)$/.test(p)) acc.push(p);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  // ONLY skip node_modules. Walker MUST traverse under .worktrees because the
  // test itself runs from a worktree and REPO_ROOT resolves to the worktree
  // path.
  if (p.endsWith('node_modules')) return acc;
  for (const e of readdirSync(p)) walkJSFiles(join(p, e), acc);
  return acc;
}

describe('T1: eva-support — static-import ban on process-spawning modules', () => {
  it('finds zero banned imports in lib/eva-support/** and scripts/eva-support/**', () => {
    const violations = [];

    for (const dir of SCAN_DIRS) {
      const dirPath = join(REPO_ROOT, dir);
      for (const file of walkJSFiles(dirPath)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
        // Test files in tests/ci/ never reach here (we only scan SCAN_DIRS), but
        // exclude __tests__ subdirectories defensively if any module ships co-located tests.
        if (rel.includes('/__tests__/')) continue;

        const content = readFileSync(file, 'utf8');
        for (const ban of BANNED_IMPORTS) {
          if (ban.regex.test(content)) {
            violations.push({ file: rel, banned: ban.name });
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  - ${v.file} — uses banned: ${v.banned}`)
        .join('\n');
      throw new Error(
        `T1 invariant FAILED: ${violations.length} banned import(s) found in eva-support/**.\n` +
        `EVA Support is emit-only — child_process / execa / spawn / etc. are forbidden because they\n` +
        `would let EVA execute /leo create directly, breaking the writer/consumer contract\n` +
        `(SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-5 + R4 mitigation).\n\n` +
        `Violations:\n${message}\n\n` +
        `Fix: emit the command as a string for the chairman to copy-paste. If you genuinely need\n` +
        `subprocess execution for some other purpose, file a new SD with an explicit risk review.`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
