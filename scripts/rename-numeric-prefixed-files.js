#!/usr/bin/env node
/**
 * Rename Numeric-Prefixed Documentation Files
 * Converts files like 01a_draft_idea.md to draft-idea.md (kebab-case)
 *
 * Target: 30+ files with pattern ^\d+[a-z]?_.*\.md$
 *
 * Usage:
 *   node scripts/rename-numeric-prefixed-files.js --dry-run  # Preview
 *   node scripts/rename-numeric-prefixed-files.js            # Execute
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Pattern to match numeric-prefixed files
const NUMERIC_PREFIX_PATTERN = /^(\d+[a-z]?)_(.+)\.md$/;

function findNumericPrefixedFiles() {
  const results = [];
  findFilesRecursive(DOCS_DIR, results);
  return results.filter(f => NUMERIC_PREFIX_PATTERN.test(f.name));
}

function findFilesRecursive(dir, results) {
  if (!fs.existsSync(dir)) return;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'archive' || item.name === 'node_modules') continue;
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        findFilesRecursive(fullPath, results);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push({
          name: item.name,
          path: fullPath,
          dir: dir,
          relativePath: path.relative(ROOT_DIR, fullPath)
        });
      }
    }
  } catch (e) { /* skip */ }
}

function convertToKebabCase(filename) {
  const match = filename.match(NUMERIC_PREFIX_PATTERN);
  if (!match) return filename;

  // Remove numeric prefix, convert underscores to hyphens
  let newName = match[2]
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');

  return `${newName}.md`;
}

function generateRenamePlan(files) {
  const plan = [];

  for (const file of files) {
    const newName = convertToKebabCase(file.name);
    const newPath = path.join(file.dir, newName);
    const newRelativePath = path.relative(ROOT_DIR, newPath);

    plan.push({
      ...file,
      oldName: file.name,
      newName,
      newPath,
      newRelativePath,
      conflict: fs.existsSync(newPath)
    });
  }

  return plan;
}

function findCrossReferences(files) {
  const references = new Map();

  // Build a map of all md files that might contain references
  const allMdFiles = [];
  findFilesRecursive(DOCS_DIR, allMdFiles);

  for (const file of files) {
    const refsToThisFile = [];

    for (const mdFile of allMdFiles) {
      try {
        const content = fs.readFileSync(mdFile.path, 'utf8');
        // Look for markdown links containing the filename
        if (content.includes(file.name) || content.includes(file.relativePath)) {
          refsToThisFile.push(mdFile.relativePath);
        }
      } catch (e) { /* skip */ }
    }

    if (refsToThisFile.length > 0) {
      references.set(file.relativePath, refsToThisFile);
    }
  }

  return references;
}

function updateCrossReferences(oldPath, newPath, dryRun) {
  const oldName = path.basename(oldPath);
  const newName = path.basename(newPath);
  const allMdFiles = [];
  findFilesRecursive(DOCS_DIR, allMdFiles);

  let updateCount = 0;

  for (const mdFile of allMdFiles) {
    try {
      let content = fs.readFileSync(mdFile.path, 'utf8');
      let newContent = content;

      // Replace references to old filename
      const patterns = [
        new RegExp(`\\]\\(${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
        new RegExp(`\\]\\([^)]*${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g')
      ];

      for (const pattern of patterns) {
        newContent = newContent.replace(pattern, (match) => {
          return match.replace(oldName, newName);
        });
      }

      if (newContent !== content) {
        updateCount++;
        if (!dryRun) {
          fs.writeFileSync(mdFile.path, newContent, 'utf8');
        }
      }
    } catch (e) { /* skip */ }
  }

  return updateCount;
}

function executeRename(plan, dryRun = true) {
  const results = { renamed: [], skipped: [], errors: [], refUpdates: 0 };

  for (const item of plan) {
    if (item.conflict) {
      results.skipped.push({ ...item, reason: 'Target filename already exists' });
      continue;
    }

    if (dryRun) {
      results.renamed.push(item);
      continue;
    }

    try {
      // Rename the file
      fs.renameSync(item.path, item.newPath);

      // Update cross-references
      const refUpdates = updateCrossReferences(item.relativePath, item.newRelativePath, dryRun);
      results.refUpdates += refUpdates;

      results.renamed.push(item);
    } catch (error) {
      results.errors.push({ ...item, error: error.message });
    }
  }

  return results;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const checkRefs = process.argv.includes('--check-refs');

  console.log('📝 Numeric-Prefix File Renaming');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`Pattern: ^\\d+[a-z]?_.*\\.md$`);
  console.log('');

  // Find numeric-prefixed files
  const files = findNumericPrefixedFiles();
  console.log(`Found ${files.length} numeric-prefixed files`);

  if (files.length === 0) {
    console.log('✅ No files to rename');
    process.exit(0);
  }

  // Show examples
  console.log('\n📋 Example Conversions:');
  for (const file of files.slice(0, 5)) {
    const newName = convertToKebabCase(file.name);
    console.log(`   ${file.name} → ${newName}`);
  }
  if (files.length > 5) {
    console.log(`   ... and ${files.length - 5} more`);
  }

  // Check for cross-references if requested
  if (checkRefs) {
    console.log('\n🔗 Cross-Reference Analysis:');
    const refs = findCrossReferences(files);
    let totalRefs = 0;
    for (const [file, refFiles] of refs) {
      totalRefs += refFiles.length;
      if (verbose) {
        console.log(`   ${file}: ${refFiles.length} reference(s)`);
      }
    }
    console.log(`   Total cross-references to update: ${totalRefs}`);
  }

  // Generate rename plan
  const plan = generateRenamePlan(files);

  // Check for conflicts
  const conflicts = plan.filter(p => p.conflict);
  if (conflicts.length > 0) {
    console.log(`\n⚠️  ${conflicts.length} conflict(s) detected:`);
    for (const c of conflicts) {
      console.log(`   ${c.oldName} → ${c.newName} (exists)`);
    }
  }

  // Execute
  console.log('\n🔄 Executing...');
  const results = executeRename(plan, dryRun);

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Renamed: ${results.renamed.length}`);
  console.log(`   Skipped: ${results.skipped.length}`);
  console.log(`   Errors: ${results.errors.length}`);
  if (!dryRun) {
    console.log(`   Cross-references updated: ${results.refUpdates}`);
  }

  // Show renamed files
  if (verbose && results.renamed.length > 0) {
    console.log('\n✅ Renamed files:');
    for (const item of results.renamed) {
      console.log(`   ${item.oldName} → ${item.newName}`);
    }
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const item of results.errors) {
      console.log(`   ${item.oldName}: ${item.error}`);
    }
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to execute renames.');
    console.log('   Add --check-refs to analyze cross-references before renaming.');
  } else {
    console.log('\n✅ Renaming complete!');
    console.log('   Run `git status` to see renamed files');
    console.log('   Run `npm run docs:validate-links` to verify references');
  }

  // Output JSON if requested
  if (process.argv.includes('--json')) {
    console.log('\n--- JSON RESULTS ---');
    console.log(JSON.stringify({
      total: files.length,
      renamed: results.renamed.map(r => ({ old: r.oldName, new: r.newName })),
      skipped: results.skipped.map(s => ({ file: s.oldName, reason: s.reason })),
      errors: results.errors.map(e => ({ file: e.oldName, error: e.error }))
    }, null, 2));
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
