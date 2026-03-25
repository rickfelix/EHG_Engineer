#!/usr/bin/env node

/**
 * Validate Script References v1.0.0
 *
 * Scans protocol docs, slash commands, CI workflows, hooks, and package.json
 * for references to scripts (node scripts/X, scripts/X) and verifies each
 * referenced script exists on disk.
 *
 * Usage:
 *   node scripts/validate-script-references.js           # Full scan
 *   node scripts/validate-script-references.js --json     # JSON output
 *   node scripts/validate-script-references.js --staged   # Only check staged deletions (for pre-commit)
 *   node scripts/validate-script-references.js --fix      # Show restoration commands
 *
 * Exit codes:
 *   0 = all references valid
 *   1 = broken references found
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')));
const PROJECT_ROOT = resolve(ROOT, '..');

const JSON_MODE = process.argv.includes('--json');
const STAGED_ONLY = process.argv.includes('--staged');
const SHOW_FIX = process.argv.includes('--fix');

// Tiered scan paths: CRITICAL files block commits, INFO files are advisory
const SCAN_PATHS = [
  // CRITICAL tier — these are operational; broken refs here break the system
  { glob: 'CLAUDE*.md', description: 'Protocol docs', tier: 'critical' },
  { glob: '.claude/commands/*.md', description: 'Slash commands', tier: 'critical' },
  { glob: '.claude/context/*.md', description: 'Context files', tier: 'critical' },
  { glob: '.github/workflows/*.yml', description: 'CI workflows', tier: 'critical', excludePattern: /archived/ },
  { glob: 'scripts/hooks/*.cjs', description: 'Hook scripts', tier: 'critical' },
  { glob: 'package.json', description: 'npm scripts', tier: 'critical' },
  { glob: 'templates/claude-md/**/*.md', description: 'Sub-agent templates', tier: 'critical' },
  // INFO tier — historical docs; broken refs are advisory, don't block commits
  { glob: 'docs/**/*.md', description: 'Documentation', tier: 'info', excludePattern: /archived|archive/ },
  { glob: 'templates/**/*.md', description: 'Templates', tier: 'info', excludePattern: /archived|claude-md/ },
];

// Patterns that extract script references
const REFERENCE_PATTERNS = [
  // node scripts/X invocations
  /node\s+scripts\/([a-zA-Z0-9_.-]+\.(?:js|mjs|cjs))/g,
  // npm run that maps to scripts/ (we check package.json separately)
  // Direct path references: scripts/X.js (in docs, not inside code blocks showing file content)
  /(?:^|\s|["'`(])scripts\/([a-zA-Z0-9_.-]+\.(?:js|mjs|cjs))(?:\s|["'`)\n]|$)/gm,
];

// Scripts that are legitimately not in scripts/ (they're modules, libs, etc.)
const IGNORE_PATTERNS = [
  /^modules\//,       // scripts/modules/ is a subdir reference
  /^lib\//,           // scripts/lib/ is a subdir reference
  /^hooks\//,         // scripts/hooks/ is a subdir reference
  /^archive\//,       // archive references
  /^reports\//,       // report output references
];

function walkDir(dir, pattern, excludePattern) {
  const results = [];
  if (!existsSync(dir)) return results;

  function walk(current) {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const relPath = fullPath.replace(PROJECT_ROOT + '\\', '').replace(PROJECT_ROOT + '/', '');

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.worktrees' || entry.name === '.git') continue;
        if (excludePattern && excludePattern.test(relPath)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (excludePattern && excludePattern.test(relPath)) continue;
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function getFilesToScan() {
  const files = [];

  for (const scanPath of SCAN_PATHS) {
    const { glob: pattern, excludePattern } = scanPath;

    if (pattern.includes('**')) {
      // Recursive glob - walk the directory
      const baseDir = join(PROJECT_ROOT, pattern.split('**')[0]);
      const ext = pattern.split('.').pop();
      const allFiles = walkDir(baseDir, null, excludePattern);
      files.push(...allFiles.filter(f => f.endsWith('.' + ext)));
    } else if (pattern.includes('*')) {
      // Simple glob
      const dir = join(PROJECT_ROOT, dirname(pattern));
      const ext = pattern.split('.').pop();
      if (existsSync(dir)) {
        const entries = readdirSync(dir).filter(f => f.endsWith('.' + ext));
        files.push(...entries.map(f => join(dir, f)));
      }
    } else {
      // Exact file
      const fullPath = join(PROJECT_ROOT, pattern);
      if (existsSync(fullPath)) files.push(fullPath);
    }
  }

  return [...new Set(files)];
}

function extractReferences(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const refs = new Map(); // script -> [{ line, context }]
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of REFERENCE_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const scriptName = match[1];

        // Skip ignored patterns
        if (IGNORE_PATTERNS.some(p => p.test(scriptName))) continue;

        if (!refs.has(scriptName)) refs.set(scriptName, []);
        refs.get(scriptName).push({
          line: i + 1,
          context: line.trim().substring(0, 120),
        });
      }
    }
  }

  return refs;
}

function extractPackageJsonScripts() {
  const pkgPath = join(PROJECT_ROOT, 'package.json');
  if (!existsSync(pkgPath)) return new Map();

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const refs = new Map();

  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    for (const pattern of REFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(cmd)) !== null) {
        const scriptName = match[1];
        if (IGNORE_PATTERNS.some(p => p.test(scriptName))) continue;

        if (!refs.has(scriptName)) refs.set(scriptName, []);
        refs.get(scriptName).push({
          line: 0,
          context: `npm run ${name}: ${cmd.substring(0, 100)}`,
        });
      }
    }
  }

  return refs;
}

function getStagedDeletions() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=D', { encoding: 'utf8' });
    return output.trim().split('\n').filter(f => f.startsWith('scripts/') && !f.includes('archive/'));
  } catch {
    return [];
  }
}

function main() {
  // Build file-to-tier map from scan config
  const fileTierMap = new Map();
  const filesToScan = getFilesToScan();

  for (const scanPath of SCAN_PATHS) {
    // Tag files with their tier based on which scan path matched them
    for (const file of filesToScan) {
      const relFile = file.replace(PROJECT_ROOT + '\\', '').replace(PROJECT_ROOT + '/', '').replace(/\\/g, '/');
      // Match by glob prefix
      const globBase = scanPath.glob.split('*')[0].replace(/\\/g, '/');
      if (relFile.startsWith(globBase) || (scanPath.glob === 'package.json' && relFile === 'package.json')) {
        // Critical takes precedence over info
        if (!fileTierMap.has(file) || scanPath.tier === 'critical') {
          fileTierMap.set(file, scanPath.tier || 'info');
        }
      }
    }
  }

  // Collect all references
  const allRefs = new Map(); // scriptName -> [{ file, line, context, tier }]

  for (const file of filesToScan) {
    const relFile = file.replace(PROJECT_ROOT + '\\', '').replace(PROJECT_ROOT + '/', '').replace(/\\/g, '/');
    const tier = fileTierMap.get(file) || 'info';
    const refs = extractReferences(file);

    for (const [script, locations] of refs) {
      if (!allRefs.has(script)) allRefs.set(script, []);
      for (const loc of locations) {
        allRefs.get(script).push({ file: relFile, tier, ...loc });
      }
    }
  }

  // Check which referenced scripts exist
  const broken = [];
  const valid = [];

  for (const [script, locations] of allRefs) {
    const scriptPath = join(PROJECT_ROOT, 'scripts', script);
    if (existsSync(scriptPath)) {
      valid.push({ script, refCount: locations.length });
    } else {
      const inArchive = existsSync(join(PROJECT_ROOT, 'scripts', 'archive', 'one-time', script));
      const hasCriticalRef = locations.some(l => l.tier === 'critical');
      broken.push({ script, locations, inArchive, hasCriticalRef });
    }
  }

  // If staged-only mode, filter to just staged deletions
  if (STAGED_ONLY) {
    const deletions = getStagedDeletions();
    const deletedScripts = deletions.map(f => basename(f));
    const affectedRefs = broken.filter(b => deletedScripts.includes(b.script));

    // Also check if any valid scripts are being deleted
    for (const v of valid) {
      if (deletedScripts.includes(v.script)) {
        const locations = allRefs.get(v.script);
        affectedRefs.push({ script: v.script, locations, inArchive: false, stagedForDeletion: true });
      }
    }

    if (affectedRefs.length === 0) {
      if (!JSON_MODE) console.log('✅ No staged deletions break script references.');
      process.exit(0);
    }

    if (JSON_MODE) {
      console.log(JSON.stringify({ broken: affectedRefs, total: affectedRefs.length }, null, 2));
    } else {
      console.error(`\n❌ BLOCKED: ${affectedRefs.length} staged deletion(s) would break script references:\n`);
      for (const ref of affectedRefs) {
        console.error(`  ${ref.script} (${ref.locations.length} reference(s)):`);
        for (const loc of ref.locations.slice(0, 3)) {
          console.error(`    ${loc.file}:${loc.line}`);
        }
        if (ref.locations.length > 3) console.error(`    ... and ${ref.locations.length - 3} more`);
      }
      console.error('\n  Remove references before deleting, or use --force to bypass.');
    }
    process.exit(1);
  }

  // Split broken refs by tier
  const criticalBroken = broken.filter(b => b.hasCriticalRef);
  const infoBroken = broken.filter(b => !b.hasCriticalRef);

  // Full report
  if (JSON_MODE) {
    console.log(JSON.stringify({
      summary: { total: allRefs.size, valid: valid.length, broken: broken.length, critical: criticalBroken.length, info: infoBroken.length, filesScanned: filesToScan.length },
      critical: criticalBroken.map(b => ({ script: b.script, inArchive: b.inArchive, refCount: b.locations.length, locations: b.locations.filter(l => l.tier === 'critical') })),
      info: infoBroken.map(b => ({ script: b.script, inArchive: b.inArchive, refCount: b.locations.length })),
    }, null, 2));
  } else {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  SCRIPT REFERENCE VALIDATION');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Files scanned:    ${filesToScan.length}`);
    console.log(`  Scripts found:    ${allRefs.size}`);
    console.log(`  Valid:            ${valid.length}`);
    console.log(`  Broken (total):   ${broken.length}`);
    console.log(`  Broken CRITICAL:  ${criticalBroken.length}  (protocol docs, commands, CI, hooks)`);
    console.log(`  Broken INFO:      ${infoBroken.length}  (historical docs — advisory only)`);
    console.log('');

    if (criticalBroken.length > 0) {
      console.log('❌ CRITICAL BROKEN REFERENCES (blocks commits):');
      console.log('────────────────────────────────────────────────────────────');
      for (const b of criticalBroken.sort((a, c) => c.locations.length - a.locations.length)) {
        const archiveTag = b.inArchive ? ' [in archive]' : ' [NOT FOUND]';
        const critLocs = b.locations.filter(l => l.tier === 'critical');
        console.log(`\n  ${b.script} (${critLocs.length} critical refs)${archiveTag}`);
        for (const loc of critLocs.slice(0, 5)) {
          console.log(`    ${loc.file}:${loc.line}`);
        }
        if (critLocs.length > 5) console.log(`    ... and ${critLocs.length - 5} more`);

        if (SHOW_FIX && b.inArchive) {
          console.log(`    FIX: cp scripts/archive/one-time/${b.script} scripts/${b.script}`);
        }
      }
      console.log('');
    }

    if (infoBroken.length > 0) {
      console.log(`ℹ️  ${infoBroken.length} INFO-tier broken references (docs only, advisory):`);
      const top5 = infoBroken.sort((a, c) => c.locations.length - a.locations.length).slice(0, 5);
      for (const b of top5) {
        console.log(`    ${b.script} (${b.locations.length} refs) ${b.inArchive ? '[in archive]' : '[NOT FOUND]'}`);
      }
      if (infoBroken.length > 5) console.log(`    ... and ${infoBroken.length - 5} more`);
      console.log('');
    }

    if (broken.length === 0) {
      console.log('✅ All script references are valid.');
    }

    console.log('════════════════════════════════════════════════════════════');
  }

  // Exit code: only fail on CRITICAL broken refs (or --staged mode)
  process.exit(criticalBroken.length > 0 ? 1 : 0);
}

main();
