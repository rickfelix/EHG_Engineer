#!/usr/bin/env node
/**
 * Orphan Detector — Verifier #1 of 5 in the LEO Wiring Verification Framework.
 *
 * Detects NEW files added in an SD's diff that have zero import sites
 * (orphan_detection) and modules reachable only from dead code
 * (pipeline_integration). Emits a leo_wiring_validations-shaped JSON to stdout.
 *
 * Vision: VISION-LEO-WIRING-VERIFICATION-L2-001
 * Arch:   ARCH-LEO-WIRING-VERIFICATION-001 (Phase 1)
 * SD:     SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-A
 *
 * Usage:
 *   node scripts/wiring-validators/orphan-detector.js <SD-KEY> [--base <ref>] [--root <path>]
 *
 * Output: JSON on stdout. Logs on stderr.
 *   { sd_key, check_type, status, signals_detected, evidence }
 *
 * check_type in the output is 'orphan_detection' for orphan signals and an
 * additional 'pipeline_integration' row is emitted when applicable.
 * When the runner harness (Child D) invokes this script, it will iterate both
 * check_types from the `results` array.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT_DEFAULT = resolve(__filename, '..', '..', '..');

const NEW_FILE_EXTENSIONS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs']);
const DEFAULT_SEARCH_ROOTS = [
  'ehg/src',
  'scripts',
  'lib',
  'server',
  'src',
];
const DEFAULT_PIPELINE_ENTRY_GLOBS = [
  'server/routes',
  'lib/eva/orchestrator-runner.js',
  'scripts/handoff.js',
];

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { sdKey: null, base: 'main', root: REPO_ROOT_DEFAULT };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--base') opts.base = args[++i];
    else if (a === '--root') opts.root = resolve(args[++i]);
    else if (!a.startsWith('--') && !opts.sdKey) opts.sdKey = a;
    i++;
  }
  if (!opts.sdKey) {
    process.stderr.write('Usage: orphan-detector.js <SD-KEY> [--base <ref>] [--root <path>]\n');
    process.exit(2);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Git diff: list new files added on this branch
// ---------------------------------------------------------------------------
function listNewFiles(repoRoot, base) {
  // Sanitize base to a git-safe ref (alphanumeric, dash, underscore, slash, dot)
  // Prevents command injection via CLI --base arg.
  if (!/^[\w./-]+$/.test(base)) {
    process.stderr.write(`[orphan-detector] invalid base ref rejected: ${base}\n`);
    return [];
  }
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-status', '--diff-filter=A', `${base}...HEAD`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/\s+/).slice(-1)[0])
      .filter((p) => NEW_FILE_EXTENSIONS.has(extname(p)));
  } catch (err) {
    process.stderr.write(`[orphan-detector] git diff failed: ${err.message}\n`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// AST export extraction (regex-based — deterministic, no new deps)
// ---------------------------------------------------------------------------
function extractExports(filePath, absPath) {
  const exports = new Set();
  let mode = 'regex';
  try {
    const src = readFileSync(absPath, 'utf8');
    // default export
    if (/^\s*export\s+default\s+/m.test(src)) exports.add('default');
    // named: export const/function/class Foo
    for (const m of src.matchAll(/^\s*export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/gm)) {
      exports.add(m[1]);
    }
    // named: export { Foo, Bar as Baz }
    for (const m of src.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[1] || part.trim().split(/\s+as\s+/)[0];
        if (name) exports.add(name.trim());
      }
    }
    // Fallback symbol: the filename itself (component patterns import by path)
    const base = filePath.split('/').slice(-1)[0].replace(/\.(js|ts|tsx|jsx|mjs)$/, '');
    exports.add(base);
  } catch (err) {
    process.stderr.write(`[orphan-detector] parse fallback for ${filePath}: ${err.message}\n`);
  }
  return { exports: [...exports], mode };
}

// ---------------------------------------------------------------------------
// Import-site grep: count references to a file path or exported symbols
// ---------------------------------------------------------------------------
function walkSourceFiles(repoRoot, roots) {
  const files = [];
  const stack = roots.map((r) => resolve(repoRoot, r)).filter((p) => existsSync(p));
  while (stack.length) {
    const cur = stack.pop();
    let st;
    try { st = statSync(cur); } catch { continue; }
    if (st.isDirectory()) {
      if (/[/\\](node_modules|\.git|\.worktrees|dist|build|coverage)([/\\]|$)/.test(cur)) continue;
      for (const entry of readdirSync(cur)) stack.push(join(cur, entry));
    } else if (st.isFile() && NEW_FILE_EXTENSIONS.has(extname(cur))) {
      files.push(cur);
    }
  }
  return files;
}

function countImportSites(sourceFiles, filePath, symbols) {
  const base = filePath.split('/').slice(-1)[0].replace(/\.(js|ts|tsx|jsx|mjs)$/, '');
  const pathStem = filePath.replace(/\.(js|ts|tsx|jsx|mjs)$/, '');
  const patterns = new Set([base, pathStem.split('/').slice(-2).join('/')]);
  for (const s of symbols) if (s !== 'default') patterns.add(s);

  let total = 0;
  let nonTest = 0;
  for (const f of sourceFiles) {
    if (f.endsWith(filePath.replace(/\//g, sep))) continue; // skip self
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    let matched = false;
    for (const p of patterns) {
      if (!p || p.length < 3) continue;
      const re = new RegExp(`(?:from\\s+['"\`][^'"\`]*${escapeRegex(p)}|require\\(\\s*['"\`][^'"\`]*${escapeRegex(p)}|\\b${escapeRegex(p)}\\s*\\()`);
      if (re.test(src)) { matched = true; break; }
    }
    if (matched) {
      total++;
      if (!/[/\\](__tests__|tests?|\.test\.|\.spec\.)/i.test(f)) nonTest++;
    }
  }
  return { total, nonTest };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Confidence classifier: HIGH | MEDIUM | LOW
// ---------------------------------------------------------------------------
function classify(filePath, importCounts) {
  const ext = extname(filePath);
  const isFrontend = ext === '.tsx' || ext === '.jsx';
  const isUtility = /(^|\/)(utils|helpers)(\/|$)/.test(filePath);
  if (isUtility) return 'LOW';
  if (isFrontend && importCounts.total === 0) return 'HIGH';
  if (!isFrontend && importCounts.nonTest === 0) return 'MEDIUM';
  return null; // not orphan
}

// ---------------------------------------------------------------------------
// Pipeline reachability (shallow): files imported transitively from entry points
// ---------------------------------------------------------------------------
function buildReachableSet(repoRoot, entryGlobs) {
  const reachable = new Set();
  const entries = [];
  for (const g of entryGlobs) {
    const abs = resolve(repoRoot, g);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const f of walkSourceFiles(repoRoot, [g])) entries.push(f);
    } else entries.push(abs);
  }
  const stack = [...entries];
  while (stack.length) {
    const cur = stack.pop();
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    let src;
    try { src = readFileSync(cur, 'utf8'); } catch { continue; }
    // Shallow: just collect all relative imports
    for (const m of src.matchAll(/(?:from|require\()\s*['"\`](\.\.?\/[^'"\`]+)['"\`]/g)) {
      const target = resolve(cur, '..', m[1]);
      for (const ext of ['', ...NEW_FILE_EXTENSIONS, ...[...NEW_FILE_EXTENSIONS].map((e) => `/index${e}`)]) {
        const candidate = target + ext;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          stack.push(candidate);
          break;
        }
      }
    }
  }
  return reachable;
}

// ---------------------------------------------------------------------------
// Main verifier entry point
// ---------------------------------------------------------------------------
export function runDetector({ sdKey, base, root }) {
  const repoRoot = root || REPO_ROOT_DEFAULT;
  const newFiles = listNewFiles(repoRoot, base);
  process.stderr.write(`[orphan-detector] SD=${sdKey} base=${base} new files: ${newFiles.length}\n`);

  const sourceFiles = walkSourceFiles(repoRoot, DEFAULT_SEARCH_ROOTS);
  const reachableSet = buildReachableSet(repoRoot, DEFAULT_PIPELINE_ENTRY_GLOBS);

  const orphanSignals = [];
  const pipelineSignals = [];
  const evidence = {};

  for (const filePath of newFiles) {
    const absPath = resolve(repoRoot, filePath);
    if (!existsSync(absPath)) continue;
    const { exports: symbols, mode } = extractExports(filePath, absPath);
    const counts = countImportSites(sourceFiles, filePath, symbols);
    const confidence = classify(filePath, counts);
    evidence[filePath] = { total_imports: counts.total, non_test_imports: counts.nonTest, exports: symbols, parse_mode: mode, confidence };

    if (confidence) {
      orphanSignals.push({ file: filePath, confidence });
    }
    if (!reachableSet.has(absPath) && counts.total > 0) {
      pipelineSignals.push({ file: filePath, reason: 'not_reachable_from_pipeline_entry_points' });
    }
  }

  const hasHigh = orphanSignals.some((s) => s.confidence === 'HIGH');
  const results = [
    {
      sd_key: sdKey,
      check_type: 'orphan_detection',
      status: hasHigh ? 'fail' : (orphanSignals.length > 0 ? 'pass' : 'pass'),
      signals_detected: orphanSignals,
      evidence,
    },
    {
      sd_key: sdKey,
      check_type: 'pipeline_integration',
      status: pipelineSignals.length > 0 ? 'fail' : 'pass',
      signals_detected: pipelineSignals,
      evidence: {},
    },
  ];
  return results;
}

/**
 * Persistence hook: Child D will wire this to the leo_wiring_validations table.
 * For Child A (standalone), this no-ops when supabase is null.
 */
export async function persistResults(supabase, result) {
  if (!supabase) {
    process.stderr.write('[orphan-detector] persistResults: no supabase client, skipping\n');
    return { skipped: true };
  }
  const { error } = await supabase
    .from('leo_wiring_validations')
    .upsert({ ...result, updated_at: new Date().toISOString() }, { onConflict: 'sd_key,check_type' });
  return { skipped: false, error: error ? error.message : null };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('orphan-detector.js')) {
  const opts = parseArgs(process.argv);
  const results = runDetector(opts);
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}
