#!/usr/bin/env node
/**
 * Codemod: Replace raw ESM entry-point guards with isMainModule() utility.
 * SD-LEO-INFRA-CENTRALIZE-ESM-ENTRY-001
 *
 * Usage:
 *   node scripts/codemod-esm-guard.js [--dry-run]
 */
import fs from 'fs/promises';
import path from 'path';
import { isMainModule } from '../lib/utils/is-main-module.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DRY_RUN = process.argv.includes('--dry-run');
const SELF = 'lib/utils/is-main-module.js';

// Collect .js/.mjs files, excluding archive/ and node_modules/
async function collectFiles(dir, files = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (['node_modules', 'archive', '.git', '.worktrees', '.claude'].includes(entry.name)) continue;
      await collectFiles(full, files);
    } else if (/\.(js|mjs)$/.test(entry.name) && !rel.startsWith('archive/') && rel !== SELF) {
      files.push(full);
    }
  }
  return files;
}

// Patterns to detect the raw ESM guard (multi-line aware)
const GUARD_BLOCK = /(?:\/\/[^\n]*\n)?(?:const\s+\w+\s*=\s*)?(?:process\.argv\[1\]\s*&&\s*\(?\s*)?import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`[^;]*?(?:\.replace\([^)]+\)[^;]*?)*(?:\)\s*)?;?\s*\n/g;

// Broader pattern: entire if-block that uses import.meta.url === `file://...`
const IF_BLOCK = /(?:\/\/[^\n]*\n)*(?:const\s+(\w+)\s*=\s*(?:process\.argv\[1\]\s*&&\s*\(?\s*)?import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`[^;]*;\s*\n\s*if\s*\(\1\))|(?:if\s*\(\s*(?:process\.argv\[1\]\s*&&\s*\(?\s*)?(?:import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`[^)]*)\s*\))/g;

async function processFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  let src = await fs.readFile(filePath, 'utf-8');
  if (!src.includes('import.meta.url === `file://${process.argv[1]}')) return null;
  if (src.includes("from '../lib/utils/is-main-module.js'") || src.includes("from './lib/utils/is-main-module.js'")) return null;

  const original = src;

  // Calculate relative import path from file to lib/utils/is-main-module.js
  const fileDir = path.dirname(filePath);
  let importPath = path.relative(fileDir, path.join(ROOT, SELF)).replace(/\\/g, '/');
  if (!importPath.startsWith('.')) importPath = './' + importPath;

  // Step 1: Remove existing variable assignment patterns and rewrite the if-check
  // Pattern A: const _isMain = process.argv[1] && (...); \n if (_isMain)
  src = src.replace(
    /(?:\/\/[^\n]*\n)*const\s+(\w+)\s*=\s*(?:process\.argv\[1\]\s*(?:\?\.)?\s*&&\s*\(?\s*)?import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`[^;]*;\s*\n(\s*if\s*\()\1\)/gm,
    `$2isMainModule(import.meta.url))`
  );

  // Pattern B: if (process.argv[1] && (import.meta.url === ...))  or  if (import.meta.url === ...)
  src = src.replace(
    /if\s*\(\s*(?:process\.argv\[1\]\s*&&\s*\(?\s*)?import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`[^)]*(?:\|\|\s*process\.argv\[1\]\??\s*\.endsWith\([^)]*\))?\s*\)?\s*\)/gm,
    'if (isMainModule(import.meta.url))'
  );

  if (src === original) return null; // No changes made

  // Step 2: Add import statement if not already present
  if (!src.includes('isMainModule')) return null; // replacement didn't work
  const importLine = `import { isMainModule } from '${importPath}';\n`;
  // Insert after last existing import statement
  const lastImportIdx = src.lastIndexOf('\nimport ');
  if (lastImportIdx !== -1) {
    const endOfLine = src.indexOf('\n', lastImportIdx + 1);
    src = src.slice(0, endOfLine + 1) + importLine + src.slice(endOfLine + 1);
  } else {
    src = importLine + src;
  }

  if (!DRY_RUN) await fs.writeFile(filePath, src, 'utf-8');
  return rel;
}

async function main() {
  console.log(`ESM Guard Codemod ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(50));

  const dirs = ['scripts', 'lib', '.'].map(d => path.join(ROOT, d));
  const seen = new Set();
  const allFiles = [];
  // Also include root-level .js files
  for (const d of dirs) {
    for (const f of await collectFiles(d)) {
      const abs = path.resolve(f);
      if (!seen.has(abs)) { seen.add(abs); allFiles.push(f); }
    }
  }
  // Add root-level files explicitly
  for (const entry of await fs.readdir(ROOT)) {
    if (/\.(js|mjs)$/.test(entry)) {
      const full = path.join(ROOT, entry);
      const abs = path.resolve(full);
      if (!seen.has(abs)) { seen.add(abs); allFiles.push(full); }
    }
  }

  console.log(`Scanning ${allFiles.length} files...\n`);
  const modified = [];
  for (const f of allFiles) {
    const result = await processFile(f);
    if (result) {
      modified.push(result);
      console.log(`  ${DRY_RUN ? '[DRY] ' : ''}Modified: ${result}`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total scanned: ${allFiles.length}`);
  console.log(`Modified: ${modified.length}`);
  if (DRY_RUN) console.log('(No files were written - dry run mode)');
}

if (isMainModule(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
