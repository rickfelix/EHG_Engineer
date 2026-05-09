import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * QF-20260508-102 — Static-source-code guard test
 *
 * Witnesses 2026-05-08: scripts/worktree-reaper.mjs:465 used raw
 * `fs.rmSync({recursive:true,force:true})` which on Windows follows
 * worktree node_modules junctions and wipes the main repo's node_modules,
 * bricking every parallel session.
 *
 * This test asserts: any file under scripts/ that calls
 * `fs.rmSync(..., {recursive: true...})` MUST also import `safeRecursiveRm`
 * from lib/worktree-manager.js (the junction-aware helper).
 *
 * Without this guard, future contributors may reintroduce the bug because
 * raw `fs.rmSync` is the natural Node.js API to reach for.
 */

const SCRIPTS_DIR = join(process.cwd(), 'scripts');
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// Comment-stripping helper — same approach as audit-shared-tables-residue static guard
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Test files legitimately use fs.rmSync for fixture cleanup; exclude per
// canonical pattern (mirrors EXCLUSION_PATTERNS in WIRE_CHECK_GATE).
const TEST_FILE_PATTERNS = [
  /\.test\.(js|mjs|cjs)$/,
  /\.spec\.(js|mjs|cjs)$/,
  /(^|[\\/])__tests__[\\/]/,
  /(^|[\\/])tests?[\\/]/,
];

function isTestFile(filepath) {
  return TEST_FILE_PATTERNS.some((re) => re.test(filepath));
}

// Recursive walk; returns absolute paths to .{js,mjs,cjs} files (excluding test files)
function walkScripts(dir, accum = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return accum;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and archived dirs
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'archive' || entry.name === 'archived-prd-scripts' || entry.name === 'archived-sd-scripts')
        continue;
      walkScripts(full, accum);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      if (dot >= 0 && EXTENSIONS.has(entry.name.slice(dot))) {
        if (!isTestFile(full)) accum.push(full);
      }
    }
  }
  return accum;
}

// Detects fs.rmSync(<anything>, {recursive: true ...}) — supports common
// formatting variants (newlines, varying spacing).
const RAW_RMSYNC_RECURSIVE = /\bfs\.rmSync\s*\([^)]*\brecursive\s*:\s*true/s;

// Confirms file uses junction-safe rm. Two accepted patterns:
//   1. References safeRecursiveRm (ESM ./lib/worktree-manager.js consumers)
//   2. Inlines junction-aware logic (CJS callers): lstatSync + isSymbolicLink + unlinkSync
//      indicate the file checks-and-unlinks junctions BEFORE rmSync.
const SAFE_IMPORT = /\bsafeRecursiveRm\b|isSymbolicLink\(\)[\s\S]{0,200}\bunlinkSync\b/;

// Worktree-related code paths — files that operate on `.worktrees/*` paths.
// The static guard only fires on these; non-worktree rmSync (e.g., cleaning
// repo temp dirs, artifact pruning) is allowed to use raw fs.rmSync.
// QF-20260508-102: this is the canonical witness. concurrent-session-worktree.cjs
// is the sibling consumer; both fixed in this QF.
const WORKTREE_PATH_REFERENCE = /\.worktrees|worktree-(?:reaper|manager)|wtPath|worktreePath/i;

describe('worktree-rmsync junction safety — static guard over scripts/', () => {
  const allFiles = walkScripts(SCRIPTS_DIR);

  it(`finds at least 100 source files under scripts/ (sanity)`, () => {
    expect(allFiles.length).toBeGreaterThan(100);
  });

  it('every WORKTREE-RELATED script that uses fs.rmSync({recursive:true}) MUST be junction-safe', () => {
    // Static guard: scoped to files that operate on worktree paths.
    // Non-worktree rmSync (artifact cleaners, temp dir cleanup outside worktrees)
    // is allowed to use raw fs.rmSync because junction-following is not a risk
    // for those paths.
    const offenders = [];
    for (const file of allFiles) {
      let src;
      try {
        src = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const stripped = stripComments(src);
      if (!RAW_RMSYNC_RECURSIVE.test(stripped)) continue;
      // Only flag files that touch worktree paths (per QF intent)
      if (!WORKTREE_PATH_REFERENCE.test(stripped)) continue;
      // File touches worktree paths AND uses raw fs.rmSync — must be junction-safe
      if (!SAFE_IMPORT.test(stripped)) {
        offenders.push(file.replace(/\\/g, '/'));
      }
    }
    if (offenders.length > 0) {
      const message =
        `Found ${offenders.length} WORKTREE-RELATED file(s) using raw fs.rmSync({recursive:true}) ` +
        `without junction-safe handling:\n` +
        offenders.map((f) => `  - ${f}`).join('\n') +
        `\n\nFix options:\n` +
        `  1. ESM callers: import { safeRecursiveRm } from '../lib/worktree-manager.js' and replace the rmSync call.\n` +
        `  2. CJS callers (cannot import ESM directly): inline the unlink-junction-first pattern. See ` +
        `scripts/hooks/concurrent-session-worktree.cjs (QF-20260508-102) for the canonical CJS template.\n` +
        `  3. Or scripts/worktree-reaper.mjs (QF-20260508-102) for the canonical ESM pattern.`;
      throw new Error(message);
    }
    expect(offenders).toEqual([]);
  });

  it('regex correctly detects synthetic worktree-related violation', () => {
    const violation = `
import fs from 'node:fs';
const wtPath = '/some/.worktrees/SD-X-001';
fs.rmSync(wtPath, { recursive: true, force: true });
    `;
    const stripped = stripComments(violation);
    expect(stripped).toMatch(RAW_RMSYNC_RECURSIVE);
    expect(stripped).toMatch(WORKTREE_PATH_REFERENCE);
    expect(stripped).not.toMatch(SAFE_IMPORT);
  });

  it('regex accepts ESM caller with safeRecursiveRm import', () => {
    const guarded = `
import { safeRecursiveRm } from '../lib/worktree-manager.js';
import fs from 'node:fs';
const wtPath = '/some/.worktrees/SD-X-001';
fs.rmSync(wtPath, { recursive: true, force: true });
safeRecursiveRm(wtPath);
    `;
    const stripped = stripComments(guarded);
    expect(stripped).toMatch(SAFE_IMPORT);
  });

  it('regex accepts CJS caller with inlined unlink-junction-first pattern', () => {
    const cjsInlined = `
const fs = require('fs');
const path = require('path');
const wtPath = '/some/.worktrees/SD-X-001';
try {
  const nm = path.join(wtPath, 'node_modules');
  const lst = fs.lstatSync(nm);
  if (lst.isSymbolicLink()) fs.unlinkSync(nm);
} catch {}
fs.rmSync(wtPath, { recursive: true, force: true });
    `;
    const stripped = stripComments(cjsInlined);
    expect(stripped).toMatch(SAFE_IMPORT);
  });

  it('non-worktree rmSync is allowed (e.g., artifact cleaners)', () => {
    const artifactCleaner = `
import fs from 'node:fs';
const dirPath = './build/artifacts';
fs.rmSync(dirPath, { recursive: true });
    `;
    const stripped = stripComments(artifactCleaner);
    expect(stripped).toMatch(RAW_RMSYNC_RECURSIVE);
    expect(stripped).not.toMatch(WORKTREE_PATH_REFERENCE);
    // Test does NOT flag this — non-worktree path is exempt
  });

  it('comments do NOT trigger false positive', () => {
    const benign = `
import fs from 'node:fs';
const wtPath = '/x/.worktrees/y';
// fs.rmSync(wtPath, { recursive: true, force: true })  <- old approach, do not use
console.log('hello');
    `;
    const stripped = stripComments(benign);
    expect(stripped).not.toMatch(RAW_RMSYNC_RECURSIVE);
  });
});
