/**
 * AST/regex Static Guard: phantom 'fix' key elimination + canonical-enum awareness.
 *
 * SD: SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001 (FR-6)
 *
 * Scans source files in scripts/ and lib/ for any inline SD_TYPE_THRESHOLDS
 * object literal containing a `fix:` key (the phantom value that triggered
 * the witnessed UPDATE failure). Mirrors the worktree-rmsync junction-safety
 * AST static guard pattern (PAT-WINDOWS-JUNCTION-SHALLOW-WALK-001) — fail-loud
 * if a future contributor reintroduces the phantom in any SD_TYPE_THRESHOLDS
 * literal anywhere in the codebase.
 *
 * Also asserts the 4 expected files (per LEAD scope-lock testing-agent
 * evidence id 5c224612) are pinned: each contains a SD_TYPE_THRESHOLDS literal
 * but none contains the phantom `fix:` key.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// SD_TYPE_THRESHOLDS literal pattern: matches `SD_TYPE_THRESHOLDS = {...}` (any
// depth of nested braces handled via lazy match + balanced-brace post-check).
// Anchors at `=` to skip references like `SD_TYPE_THRESHOLDS[type]`.
const LITERAL_PATTERN = /SD_TYPE_THRESHOLDS\s*=\s*\{([\s\S]*?)\n\s*\}/g;

const PHANTOM_KEY_PATTERN = /(^|\s|,)\s*['"]?fix['"]?\s*:/m;

const SCAN_ROOTS = ['scripts', 'lib'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs']);
const EXCLUDE_DIRS = new Set([
  'node_modules', '__tests__', 'dist', 'build', '.worktrees', '.git',
  'archived-prd-scripts', 'archived-sd-scripts', 'archived',
]);
const EXCLUDE_FILE_RX = /\.(test|spec)\.(m?js)$/;

const EXPECTED_LITERAL_FILES = [
  'scripts/modules/sd-quality-scoring.js',
  'scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js',
  'scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js',
  'scripts/story-requirements-template.js',
];

function walkDir(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walkDir(join(dir, e.name), out);
    } else if (e.isFile()) {
      if (EXCLUDE_FILE_RX.test(e.name)) continue;
      const ext = e.name.slice(e.name.lastIndexOf('.'));
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      out.push(join(dir, e.name));
    }
  }
  return out;
}

function findFiles() {
  const out = [];
  for (const root of SCAN_ROOTS) {
    const fullRoot = join(REPO_ROOT, root);
    try {
      if (statSync(fullRoot).isDirectory()) walkDir(fullRoot, out);
    } catch {
      // root missing — skip
    }
  }
  return out;
}

describe('SD_TYPE_THRESHOLDS phantom-key static guard (FR-6)', () => {
  it('no inline SD_TYPE_THRESHOLDS literal in scripts/ or lib/ contains the phantom `fix:` key', () => {
    const files = findFiles();
    const violations = [];

    for (const filePath of files) {
      const src = readFileSync(filePath, 'utf-8');
      const matches = src.matchAll(LITERAL_PATTERN);
      for (const m of matches) {
        const literalBody = m[1];
        if (PHANTOM_KEY_PATTERN.test(literalBody)) {
          // Compute approximate line number for actionable error message
          const offset = m.index ?? 0;
          const lineNo = src.slice(0, offset).split('\n').length;
          violations.push(
            `${relative(REPO_ROOT, filePath)}:${lineNo} — SD_TYPE_THRESHOLDS literal contains phantom 'fix:' key. Canonical sd_type is 'bugfix' (per lib/sd-type-enum.js).`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('all 4 expected SD_TYPE_THRESHOLDS literal sites still exist (regression-pin per LEAD scope-lock)', () => {
    for (const relPath of EXPECTED_LITERAL_FILES) {
      const fullPath = join(REPO_ROOT, relPath);
      const src = readFileSync(fullPath, 'utf-8');
      const found = LITERAL_PATTERN.exec(src);
      // Reset regex state for next iteration
      LITERAL_PATTERN.lastIndex = 0;
      expect(found, `Expected SD_TYPE_THRESHOLDS literal in ${relPath} but did not find one. If this site was intentionally removed, update EXPECTED_LITERAL_FILES.`).toBeTruthy();
    }
  });
});
