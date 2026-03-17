#!/usr/bin/env node
/**
 * Rationalize Documentation Folder Structure
 * Merges duplicate folders and consolidates underutilized folders
 *
 * Target: Reduce from 58 folders to ~25 well-organized folders
 *
 * Actions:
 * 1. Merge duplicate folders (architecture/ vs 01_architecture/)
 * 2. Consolidate underutilized folders (<5 files)
 * 3. Create sub-folders for large directories (>50 files)
 *
 * Usage:
 *   node scripts/rationalize-doc-folders.js --dry-run  # Preview
 *   node scripts/rationalize-doc-folders.js            # Execute
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Duplicate folder merges - source → target
const DUPLICATE_MERGES = {
  'architecture': '01_architecture',
  'strategic-directives': 'strategic_directives'
};

// Underutilized folder consolidation rules
// Folders with <5 files that should be merged elsewhere
const CONSOLIDATION_RULES = {
  'agents': 'reference/sub-agents',
  'approvals': 'summaries/sd-sessions',
  'brainstorming': 'archive/2026/drafts',
  'cli': 'reference/commands',
  'design-analysis': '01_architecture',
  'discovery': 'research',
  'doctrine': '03_protocols_and_standards',
  'drafts': 'archive/2026/drafts',
  'examples': 'reference/examples',
  'implementation': 'summaries/implementations',
  'parking-lot': 'archive/2026/drafts',
  'product-requirements': 'archive/2026/legacy-prds',
  'specs': '01_architecture/specs'
};

// Sub-categorization rules for large folders
const SUBCATEGORIZATION = {
  'reference': {
    threshold: 50,
    subfolders: ['database', 'validation', 'schema', 'commands', 'sub-agents', 'examples']
  },
  'guides': {
    threshold: 50,
    subfolders: ['database', 'testing', 'development', 'deployment', 'leo-protocol']
  },
  '04_features': {
    threshold: 50,
    subfolders: ['user-features', 'backend', 'integrations', 'aegis']
  }
};

function analyzeFolderStructure() {
  const analysis = {
    duplicates: [],
    underutilized: [],
    largeFlat: [],
    totalFolders: 0,
    totalFiles: 0
  };

  if (!fs.existsSync(DOCS_DIR)) {
    console.log('❌ docs/ directory not found');
    return analysis;
  }

  // Get all directories in docs/
  const items = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
  const folders = items.filter(i => i.isDirectory());

  analysis.totalFolders = folders.length;

  for (const folder of folders) {
    const folderPath = path.join(DOCS_DIR, folder.name);
    const fileCount = countFilesInDir(folderPath);
    analysis.totalFiles += fileCount;

    // Check for duplicate folder targets
    if (DUPLICATE_MERGES[folder.name]) {
      analysis.duplicates.push({
        source: folder.name,
        target: DUPLICATE_MERGES[folder.name],
        fileCount
      });
    }

    // Check for underutilized folders
    if (CONSOLIDATION_RULES[folder.name]) {
      analysis.underutilized.push({
        folder: folder.name,
        target: CONSOLIDATION_RULES[folder.name],
        fileCount
      });
    } else if (fileCount < 5 && !['archive', 'node_modules'].includes(folder.name)) {
      analysis.underutilized.push({
        folder: folder.name,
        target: null, // Manual review needed
        fileCount
      });
    }

    // Check for large flat folders needing sub-categorization
    if (SUBCATEGORIZATION[folder.name] && fileCount >= SUBCATEGORIZATION[folder.name].threshold) {
      analysis.largeFlat.push({
        folder: folder.name,
        fileCount,
        suggestedSubfolders: SUBCATEGORIZATION[folder.name].subfolders
      });
    }
  }

  return analysis;
}

function countFilesInDir(dir) {
  let count = 0;
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.md')) {
        count++;
      } else if (item.isDirectory() && !['archive', 'node_modules'].includes(item.name)) {
        count += countFilesInDir(path.join(dir, item.name));
      }
    }
  } catch (_e) { /* skip */ }
  return count;
}

function generateRationalizationPlan(analysis) {
  const plan = {
    merges: [],
    consolidations: [],
    subfolderCreations: [],
    estimatedFinalFolders: analysis.totalFolders
  };

  // Plan duplicate merges
  for (const dup of analysis.duplicates) {
    const sourcePath = path.join(DOCS_DIR, dup.source);
    const targetPath = path.join(DOCS_DIR, dup.target);

    if (fs.existsSync(sourcePath)) {
      plan.merges.push({
        source: dup.source,
        sourcePath,
        target: dup.target,
        targetPath,
        fileCount: dup.fileCount,
        targetExists: fs.existsSync(targetPath)
      });
      plan.estimatedFinalFolders--;
    }
  }

  // Plan consolidations
  for (const folder of analysis.underutilized) {
    if (folder.target) {
      const sourcePath = path.join(DOCS_DIR, folder.folder);
      const targetPath = path.join(DOCS_DIR, folder.target);

      if (fs.existsSync(sourcePath)) {
        plan.consolidations.push({
          source: folder.folder,
          sourcePath,
          target: folder.target,
          targetPath,
          fileCount: folder.fileCount
        });
        plan.estimatedFinalFolders--;
      }
    }
  }

  // Plan sub-folder creations
  for (const large of analysis.largeFlat) {
    for (const subfolder of large.suggestedSubfolders) {
      const subfolderPath = path.join(DOCS_DIR, large.folder, subfolder);
      if (!fs.existsSync(subfolderPath)) {
        plan.subfolderCreations.push({
          parent: large.folder,
          subfolder,
          path: subfolderPath
        });
      }
    }
  }

  return plan;
}

function mergeFolders(sourcePath, targetPath, dryRun) {
  const results = { moved: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(sourcePath)) {
    return results;
  }

  // Ensure target exists
  if (!dryRun && !fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  try {
    const items = fs.readdirSync(sourcePath, { withFileTypes: true });

    for (const item of items) {
      const sourceItem = path.join(sourcePath, item.name);
      const targetItem = path.join(targetPath, item.name);

      if (item.isDirectory()) {
        // Recursively merge subdirectories
        const subResults = mergeFolders(sourceItem, targetItem, dryRun);
        results.moved += subResults.moved;
        results.skipped += subResults.skipped;
        results.errors.push(...subResults.errors);
      } else if (item.isFile()) {
        if (fs.existsSync(targetItem)) {
          results.skipped++;
        } else {
          if (!dryRun) {
            fs.renameSync(sourceItem, targetItem);
          }
          results.moved++;
        }
      }
    }

    // Remove empty source directory
    if (!dryRun) {
      removeEmptyDirs(sourcePath);
    }
  } catch (error) {
    results.errors.push({ path: sourcePath, error: error.message });
  }

  return results;
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    // First remove empty subdirectories
    for (const item of items) {
      if (item.isDirectory()) {
        removeEmptyDirs(path.join(dir, item.name));
      }
    }

    // Then check if this directory is now empty
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch (_e) { /* skip */ }
}

function executePlan(plan, dryRun) {
  const results = {
    merges: { success: 0, failed: 0, details: [] },
    consolidations: { success: 0, failed: 0, details: [] },
    subfolders: { created: 0, existed: 0 }
  };

  // Execute merges
  for (const merge of plan.merges) {
    const mergeResult = mergeFolders(merge.sourcePath, merge.targetPath, dryRun);
    if (mergeResult.errors.length === 0) {
      results.merges.success++;
      results.merges.details.push({
        ...merge,
        filesMoved: mergeResult.moved,
        filesSkipped: mergeResult.skipped
      });
    } else {
      results.merges.failed++;
    }
  }

  // Execute consolidations
  for (const cons of plan.consolidations) {
    const consResult = mergeFolders(cons.sourcePath, cons.targetPath, dryRun);
    if (consResult.errors.length === 0) {
      results.consolidations.success++;
      results.consolidations.details.push({
        ...cons,
        filesMoved: consResult.moved,
        filesSkipped: consResult.skipped
      });
    } else {
      results.consolidations.failed++;
    }
  }

  // Create subfolders
  for (const sf of plan.subfolderCreations) {
    if (fs.existsSync(sf.path)) {
      results.subfolders.existed++;
    } else {
      if (!dryRun) {
        fs.mkdirSync(sf.path, { recursive: true });
      }
      results.subfolders.created++;
    }
  }

  return results;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const analyzeOnly = process.argv.includes('--analyze');

  console.log('📁 Documentation Folder Rationalization');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : analyzeOnly ? 'ANALYZE ONLY' : 'EXECUTE'}`);
  console.log('');

  // Analyze current structure
  console.log('📊 Analyzing folder structure...');
  const analysis = analyzeFolderStructure();

  console.log(`\n   Total folders: ${analysis.totalFolders}`);
  console.log(`   Total files: ${analysis.totalFiles}`);
  console.log(`   Duplicate folders: ${analysis.duplicates.length}`);
  console.log(`   Underutilized folders: ${analysis.underutilized.length}`);
  console.log(`   Large flat folders: ${analysis.largeFlat.length}`);

  // Show duplicates
  if (analysis.duplicates.length > 0) {
    console.log('\n🔄 Duplicate Folders (to merge):');
    for (const dup of analysis.duplicates) {
      console.log(`   ${dup.source}/ → ${dup.target}/ (${dup.fileCount} files)`);
    }
  }

  // Show underutilized
  if (analysis.underutilized.length > 0 && verbose) {
    console.log('\n📦 Underutilized Folders (<5 files):');
    for (const folder of analysis.underutilized) {
      const target = folder.target || '(needs manual review)';
      console.log(`   ${folder.folder}/ → ${target} (${folder.fileCount} files)`);
    }
  }

  // Show large flat folders
  if (analysis.largeFlat.length > 0) {
    console.log('\n📂 Large Flat Folders (need sub-categorization):');
    for (const large of analysis.largeFlat) {
      console.log(`   ${large.folder}/ (${large.fileCount} files)`);
      console.log(`      Suggested: ${large.suggestedSubfolders.join(', ')}`);
    }
  }

  if (analyzeOnly) {
    console.log('\n💡 Analysis complete. Run without --analyze to see execution plan.');
    process.exit(0);
  }

  // Generate plan
  console.log('\n📋 Generating rationalization plan...');
  const plan = generateRationalizationPlan(analysis);

  console.log(`   Merges planned: ${plan.merges.length}`);
  console.log(`   Consolidations planned: ${plan.consolidations.length}`);
  console.log(`   Subfolders to create: ${plan.subfolderCreations.length}`);
  console.log(`   Estimated final folder count: ~${plan.estimatedFinalFolders}`);

  // Show merge plan
  if (plan.merges.length > 0) {
    console.log('\n🔄 Merge Plan:');
    for (const merge of plan.merges) {
      const status = merge.targetExists ? '→' : '→ (create)';
      console.log(`   ${merge.source}/ ${status} ${merge.target}/`);
    }
  }

  // Execute
  console.log('\n🔄 Executing...');
  const results = executePlan(plan, dryRun);

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Merges: ${results.merges.success} successful, ${results.merges.failed} failed`);
  console.log(`   Consolidations: ${results.consolidations.success} successful, ${results.consolidations.failed} failed`);
  console.log(`   Subfolders: ${results.subfolders.created} created, ${results.subfolders.existed} existed`);

  if (verbose) {
    if (results.merges.details.length > 0) {
      console.log('\n   Merge Details:');
      for (const detail of results.merges.details) {
        console.log(`      ${detail.source}/ → ${detail.target}/: ${detail.filesMoved} moved, ${detail.filesSkipped} skipped`);
      }
    }
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to execute.');
  } else {
    console.log('\n✅ Rationalization complete!');
    console.log('   Run `git status` to see changes');
    console.log('   Run `npm run docs:validate-links` to check references');
  }

  // JSON output
  if (process.argv.includes('--json')) {
    console.log('\n--- JSON RESULTS ---');
    console.log(JSON.stringify({
      analysis,
      plan,
      results
    }, null, 2));
  }

  process.exit(0);
}

main();
