// Dead Script Archival v2.0.0 - SD-LEO-INFRA-DEAD-SCRIPT-ARCHIVAL-002
// Uses static reference analysis to determine if a script is truly dead.
// NEVER archives a script that is referenced in operational files.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPTS_DIR = path.join(__dirname);
const PROJECT_ROOT = path.resolve(SCRIPTS_DIR, '..');
const ARCHIVE_DIR = path.join(SCRIPTS_DIR, 'archive', 'one-time');

// ============================================================================
// REFERENCE ANALYSIS (replaces hardcoded PROTECTED list)
// ============================================================================

// Operational file patterns to scan for script references
const OPERATIONAL_SCAN_DIRS = [
  { dir: '', patterns: ['CLAUDE*.md'], description: 'Protocol docs' },
  { dir: '.claude/commands', patterns: ['*.md'], description: 'Slash commands' },
  { dir: '.claude/context', patterns: ['*.md'], description: 'Context files' },
  { dir: '.github/workflows', patterns: ['*.yml'], exclude: /archived/, description: 'CI workflows' },
  { dir: 'scripts/hooks', patterns: ['*.cjs', '*.js'], description: 'Hook scripts' },
  { dir: 'templates/claude-md', patterns: ['*.md'], description: 'Sub-agent templates' },
  { dir: '', patterns: ['package.json'], description: 'npm scripts' },
];

// Regex patterns to extract script references from files
const REF_PATTERNS = [
  /node\s+scripts\/([a-zA-Z0-9_.-]+\.(?:js|mjs|cjs))/g,
  /(?:^|\s|["'`(])scripts\/([a-zA-Z0-9_.-]+\.(?:js|mjs|cjs))(?:\s|["'`)\n]|$)/gm,
];

// Subdirectory references to ignore (these aren't root-level scripts)
const SUBDIR_PREFIXES = ['modules/', 'lib/', 'hooks/', 'archive/', 'reports/'];

/**
 * Collect all files matching patterns in a directory (non-recursive simple glob)
 */
function collectFiles(baseDir, patterns, exclude) {
  const results = [];
  const dir = path.join(PROJECT_ROOT, baseDir);
  if (!fs.existsSync(dir)) return results;

  // Simple *.ext matching
  for (const pattern of patterns) {
    if (pattern.startsWith('*')) {
      const ext = pattern.slice(1); // e.g., '.md'
      const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
      for (const f of files) {
        const fullPath = path.join(dir, f);
        if (exclude && exclude.test(fullPath)) continue;
        results.push(fullPath);
      }
    } else {
      // Exact filename
      const fullPath = path.join(dir, pattern);
      if (fs.existsSync(fullPath)) results.push(fullPath);
    }
  }
  return results;
}

/**
 * Recursively collect files matching extension in a directory tree
 */
function collectFilesRecursive(baseDir, ext, exclude) {
  const results = [];
  const dir = path.join(PROJECT_ROOT, baseDir);
  if (!fs.existsSync(dir)) return results;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.worktrees' || entry.name === '.git') continue;
        if (exclude && exclude.test(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

/**
 * Build the set of scripts referenced in operational files
 */
function buildReferencedSet() {
  const referenced = new Set();

  // Collect all operational files to scan
  const filesToScan = [];
  for (const scan of OPERATIONAL_SCAN_DIRS) {
    filesToScan.push(...collectFiles(scan.dir, scan.patterns, scan.exclude));
  }
  // Also scan templates recursively
  filesToScan.push(...collectFilesRecursive('templates/claude-md', '.md'));

  // Also check package.json scripts section specifically
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scriptValues = Object.values(pkg.scripts || {}).join('\n');
      for (const pattern of REF_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(scriptValues)) !== null) {
          const name = match[1];
          if (!SUBDIR_PREFIXES.some(p => name.startsWith(p))) {
            referenced.add(name);
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Extract references from all operational files
  for (const file of filesToScan) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); }
    catch { continue; }

    for (const pattern of REF_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!SUBDIR_PREFIXES.some(p => name.startsWith(p))) {
          referenced.add(name);
        }
      }
    }
  }

  // Also check JS imports/requires between scripts
  const scriptFiles = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => /\.(js|mjs|cjs)$/.test(f) && fs.statSync(path.join(SCRIPTS_DIR, f)).isFile());

  for (const scriptFile of scriptFiles) {
    let content;
    try { content = fs.readFileSync(path.join(SCRIPTS_DIR, scriptFile), 'utf8'); }
    catch { continue; }

    // Check require('./X') or import './X' patterns
    const importPatterns = [
      /require\(['"]\.\/([a-zA-Z0-9_.-]+)(?:\.(?:js|mjs|cjs))?['"]\)/g,
      /from\s+['"]\.\/([a-zA-Z0-9_.-]+)(?:\.(?:js|mjs|cjs))?['"]/g,
    ];

    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const baseName = match[1];
        // Try common extensions
        for (const ext of ['.js', '.mjs', '.cjs']) {
          const candidate = baseName + ext;
          if (fs.existsSync(path.join(SCRIPTS_DIR, candidate))) {
            referenced.add(candidate);
          }
        }
        // Also try exact match (may already have extension)
        if (/\.(js|mjs|cjs)$/.test(baseName)) {
          referenced.add(baseName);
        }
      }
    }
  }

  return referenced;
}

// ============================================================================
// ARCHIVAL LOGIC
// ============================================================================

// Patterns for scripts that are CANDIDATES for archival (one-off patterns)
const ONE_OFF_PATTERNS = [
  /^accept-/,
  /^create-.*prd/i,
  /^create-.*section/i,
  /^create-.*handoff/i,
  /^create-.*gate/i,
  /^create-.*retro/i,
  /^create-.*sd-/i,
  /^activate-/,
  /^fix-/,
  /^migrate-/,
  /^setup-/,
  /^add-/,
  /^create-/,
];

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const mode = dryRun ? 'DRY RUN' : 'LIVE';

console.log(`\n=== Dead Script Archival v2.0.0 (${mode}) ===`);
console.log('Using static reference analysis (not pattern matching alone)\n');

// Step 1: Build referenced set from operational files
console.log('Scanning operational files for script references...');
const referenced = buildReferencedSet();
console.log(`Found ${referenced.size} scripts referenced in operational files`);

// Step 2: Get all root-level scripts
const allFiles = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => /\.(js|mjs|cjs)$/.test(f) && fs.statSync(path.join(SCRIPTS_DIR, f)).isFile());

console.log(`Total scripts at root: ${allFiles.length}`);

// Step 3: Categorize with reference-awareness
const toArchive = [];
const toRemove = [];
const protectedByRef = [];

for (const file of allFiles) {
  // NEVER archive referenced scripts
  if (referenced.has(file)) {
    protectedByRef.push(file);
    continue;
  }

  // NEVER archive this script itself
  if (file === 'archive-dead-scripts.cjs') continue;

  // tmp-* and debug-* -> remove (even if unreferenced)
  if (/^(tmp-|debug-)/.test(file)) {
    toRemove.push(file);
    continue;
  }

  // One-off patterns -> archive candidates (only if NOT referenced)
  if (ONE_OFF_PATTERNS.some(p => p.test(file))) {
    toArchive.push(file);
    continue;
  }
}

console.log(`\nProtected by references: ${protectedByRef.length}`);
console.log(`Candidates for archive:  ${toArchive.length}`);
console.log(`Candidates for removal:  ${toRemove.length}`);

if (verbose) {
  console.log('\n--- Protected by operational references ---');
  protectedByRef.sort().forEach(f => console.log('  ✓ ' + f));
}

if (dryRun) {
  console.log('\n--- Would archive (unreferenced one-off) ---');
  toArchive.slice(0, 30).forEach(f => console.log('  → ' + f));
  if (toArchive.length > 30) console.log(`  ... and ${toArchive.length - 30} more`);

  console.log('\n--- Would remove (tmp/debug) ---');
  toRemove.forEach(f => console.log('  ✗ ' + f));

  console.log(`\nExpected root count: ${allFiles.length - toArchive.length - toRemove.length}`);
  process.exit(0);
}

// Step 4: Create archive directory
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// Step 5: Move unreferenced one-off scripts
let moved = 0;
for (const file of toArchive) {
  const src = path.join(SCRIPTS_DIR, file);
  const dst = path.join(ARCHIVE_DIR, file);
  try {
    execSync(`git mv "${src}" "${dst}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    moved++;
  } catch {
    try {
      fs.renameSync(src, dst);
      moved++;
    } catch (e) {
      console.error(`  Failed to move: ${file} - ${e.message}`);
    }
  }
}
console.log(`\nArchived: ${moved} unreferenced scripts`);

// Step 6: Remove tmp/debug
let removed = 0;
for (const file of toRemove) {
  const src = path.join(SCRIPTS_DIR, file);
  try {
    execSync(`git rm "${src}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    removed++;
  } catch {
    try {
      fs.unlinkSync(src);
      removed++;
    } catch (e) {
      console.error(`  Failed to remove: ${file} - ${e.message}`);
    }
  }
}
console.log(`Removed: ${removed} tmp/debug scripts`);

// Final count
const finalFiles = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => /\.(js|mjs|cjs)$/.test(f) && fs.statSync(path.join(SCRIPTS_DIR, f)).isFile());

console.log(`\n=== RESULTS ===`);
console.log(`Root scripts: ${allFiles.length} -> ${finalFiles.length}`);
console.log(`Referenced (protected): ${protectedByRef.length}`);
console.log(`Archived: ${moved}`);
console.log(`Removed: ${removed}`);
