/**
 * Dead Code / Bloat Scanner — detects orphaned files, unused exports, stale files
 * SD: SD-LEO-INFRA-DEAD-CODE-SCANNER-001
 *
 * Detection strategies:
 * 1. tmp-*.cjs pattern files (orphaned temporary scripts)
 * 2. Files with no importers (unused exports via import graph) — lib/ and scripts/modules/ only
 * 3. Files with zero git activity >90 days (batch git log)
 */
import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { loadConfig } from './health-config.mjs';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

// Directories to scan for import graph analysis (lib code, not scripts)
const IMPORT_GRAPH_DIRS = ['lib', 'scripts/modules', 'scripts/eva', 'scripts/hooks'];

// Directories to skip entirely
const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'coverage', '.claude']);

const IMPORT_PATTERNS = [
  /require\(['"]([^'"]+)['"]\)/g,
  /from\s+['"]([^'"]+)['"]/g,
  /import\(['"]([^'"]+)['"]\)/g
];

/**
 * Scan for dead code and bloat in the codebase
 * @param {string} rootDir - project root directory
 * @param {Object} [options] - scan options
 * @returns {Promise<{ score: number, findings: Object[], metadata: Object }>}
 */
export async function scan(rootDir, options = {}) {
  const config = options.config || await loadConfig('dead_code');
  const allowlist = new Set(config?.allowlist || []);

  const findings = [];
  const metadata = { strategies: {}, scanned_files: 0, scan_duration_ms: 0 };
  const start = Date.now();

  // Strategy 1: Detect tmp-*.cjs orphans (fast — single directory read)
  const tmpFindings = await detectTmpOrphans(rootDir, allowlist);
  findings.push(...tmpFindings);
  metadata.strategies.tmp_orphans = tmpFindings.length;

  // Strategy 2: Detect files with no importers in lib/ directories
  const { findings: unusedFindings, scannedCount } = await detectUnusedFiles(rootDir, allowlist);
  findings.push(...unusedFindings);
  metadata.strategies.unused_files = unusedFindings.length;
  metadata.scanned_files = scannedCount;

  // Strategy 3: Detect stale files using batch git log
  const staleFindings = await detectStaleFiles(rootDir, allowlist, options.staleDays || 90);
  findings.push(...staleFindings);
  metadata.strategies.stale_files = staleFindings.length;

  metadata.scan_duration_ms = Date.now() - start;

  // Score: 100 = no dead code, 0 = heavily bloated
  const totalFiles = metadata.scanned_files || 1;
  const uniqueFiles = new Set(findings.map(f => f.file)).size;
  const deadRatio = uniqueFiles / totalFiles;
  const score = Math.max(0, Math.round((1 - deadRatio) * 100));

  return { score, findings, metadata, finding_count: findings.length };
}

/**
 * Strategy 1: Find tmp-*.cjs files in /scripts
 */
async function detectTmpOrphans(rootDir, allowlist) {
  const scriptsDir = join(rootDir, 'scripts');
  const findings = [];

  try {
    const files = await readdir(scriptsDir);
    for (const file of files) {
      if (!file.startsWith('tmp-') || !file.endsWith('.cjs')) continue;
      const relPath = `scripts/${file}`;
      if (allowlist.has(relPath)) continue;

      findings.push({
        file: relPath,
        strategy: 'tmp_orphan',
        severity: 'warning',
        reason: 'Temporary script pattern (tmp-*.cjs) — likely one-time use'
      });
    }
  } catch {
    // scripts dir doesn't exist
  }

  return findings;
}

/**
 * Strategy 2: Build import graph for lib/ and detect files with no importers
 * Only scans targeted directories to stay fast
 */
async function detectUnusedFiles(rootDir, allowlist) {
  // Collect files only from targeted directories
  const jsFiles = [];
  for (const dir of IMPORT_GRAPH_DIRS) {
    await collectJSFilesFromDir(rootDir, dir, jsFiles);
  }

  const importedPaths = new Set();

  // Build set of all imported paths
  for (const file of jsFiles) {
    try {
      const content = await readFile(join(rootDir, file), 'utf8');
      for (const pattern of IMPORT_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(content)) !== null) {
          const imported = match[1];
          if (imported.startsWith('.')) {
            const resolved = resolveImportPath(file, imported, jsFiles);
            if (resolved) importedPaths.add(resolved);
          }
        }
      }
    } catch {
      // skip unreadable
    }
  }

  // Find lib files not imported by anything
  const findings = [];
  for (const file of jsFiles) {
    if (importedPaths.has(file)) continue;
    if (allowlist.has(file)) continue;
    if (file.includes('.test.') || file.includes('.spec.') || file.includes('/test')) continue;
    // Entry points (index files, CLI scripts) are expected to not be imported
    if (file.endsWith('/index.js') || file.endsWith('/index.mjs')) continue;
    if (file.startsWith('scripts/eva/') && file.endsWith('.mjs')) continue; // top-level EVA scripts are entry points

    findings.push({
      file,
      strategy: 'unused_export',
      severity: 'info',
      reason: 'File is not imported by any other module in scanned directories'
    });
  }

  return { findings, scannedCount: jsFiles.length };
}

/**
 * Strategy 3: Batch detect stale files using git log
 * Uses a single git command to check all tracked files
 */
async function detectStaleFiles(rootDir, allowlist, staleDays) {
  const findings = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - staleDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  try {
    // Use git log to find JS files not modified in staleDays
    // Get all tracked JS files with their last commit date in one command
    const output = execSync(
      `git log --all --pretty=format: --name-only --diff-filter=ACMR --since="${cutoffStr}" -- "*.js" "*.mjs" "*.cjs"`,
      { cwd: rootDir, encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
    );

    const recentlyModified = new Set(
      output.split('\n').map(l => l.trim()).filter(Boolean)
    );

    // Get all tracked JS files
    const allTracked = execSync(
      'git ls-files -- "*.js" "*.mjs" "*.cjs"',
      { cwd: rootDir, encoding: 'utf8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    ).split('\n').map(l => l.trim()).filter(Boolean);

    // Files tracked but not recently modified = stale
    for (const file of allTracked) {
      if (recentlyModified.has(file)) continue;
      if (allowlist.has(file)) continue;
      if (file.includes('node_modules')) continue;
      if (file.startsWith('.')) continue;

      findings.push({
        file,
        strategy: 'stale_file',
        severity: 'info',
        reason: `No git activity in the last ${staleDays} days`
      });
    }
  } catch (err) {
    // git command failed — skip this strategy
    console.log(`   ⚠️  Stale file detection skipped: ${err.message}`);
  }

  return findings;
}

/**
 * Collect JS files from a specific subdirectory
 */
async function collectJSFilesFromDir(rootDir, relDir, results) {
  const fullDir = join(rootDir, relDir);
  try {
    const entries = await readdir(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = `${relDir}/${entry.name}`;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory()) {
        await collectJSFilesFromDir(rootDir, relPath, results);
      } else if (JS_EXTENSIONS.has(extname(entry.name))) {
        results.push(relPath);
      }
    }
  } catch {
    // directory doesn't exist
  }
}

/**
 * Resolve a relative import path to an actual file path
 */
function resolveImportPath(fromFile, importPath, allFiles) {
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.split('/');
  let resolved = fromDir;

  for (const part of parts) {
    if (part === '..') {
      resolved = resolved.split('/').slice(0, -1).join('/');
    } else if (part !== '.') {
      resolved = resolved ? `${resolved}/${part}` : part;
    }
  }

  if (allFiles.includes(resolved)) return resolved;
  for (const ext of ['.js', '.mjs', '.cjs']) {
    if (allFiles.includes(resolved + ext)) return resolved + ext;
  }
  for (const ext of ['.js', '.mjs', '.cjs']) {
    if (allFiles.includes(`${resolved}/index${ext}`)) return `${resolved}/index${ext}`;
  }

  return null;
}
