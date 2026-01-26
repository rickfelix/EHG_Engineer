#!/usr/bin/env node
/**
 * Cleanup Root Documentation Files
 * Moves .md files from root directory to correct docs/ locations using placement rubric
 *
 * Usage:
 *   node scripts/cleanup-root-docs.js --dry-run  # Preview changes
 *   node scripts/cleanup-root-docs.js            # Execute moves
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Files that are ALLOWED to remain in root
const ALLOWED_ROOT_FILES = [
  'CLAUDE.md',
  'CLAUDE_CORE.md',
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE.md',
  'CODE_OF_CONDUCT.md'
];

// File placement rubric
function classifyFile(filename, content) {
  const lowerName = filename.toLowerCase();
  const lowerContent = content.toLowerCase();

  // SD completion/status reports
  if (/^(sd-|SD-)/.test(filename) ||
      /completion|status|approved|rejected|complete/i.test(filename) ||
      /LEAD_APPROVAL|EXEC_COMPLETE|handoff/i.test(content.substring(0, 500))) {
    // Determine SD type from filename or content
    let sdType = 'general';
    if (/database|db|schema|migration|rls/i.test(filename + content.substring(0, 500))) {
      sdType = 'database';
    } else if (/feature|feat/i.test(filename)) {
      sdType = 'feature';
    } else if (/infra|infrastructure|tooling/i.test(filename + content.substring(0, 500))) {
      sdType = 'infrastructure';
    } else if (/doc|documentation/i.test(filename)) {
      sdType = 'documentation';
    }
    return `docs/summaries/sd-sessions/${sdType}`;
  }

  // Retrospectives
  if (/retro|retrospective|lessons/i.test(filename)) {
    return 'docs/retrospectives';
  }

  // Database-related
  if (/database|schema|migration|rls|supabase/i.test(filename)) {
    if (/pattern|best.?practice/i.test(filename)) {
      return 'docs/reference/database';
    }
    if (/migration/i.test(filename)) {
      return 'docs/database/migrations';
    }
    if (/schema/i.test(filename)) {
      return 'docs/database/schema';
    }
    return 'docs/database';
  }

  // Testing-related
  if (/test|testing|qa|e2e|playwright/i.test(filename)) {
    if (/guide|how/i.test(filename)) {
      return 'docs/guides/testing';
    }
    return 'docs/05_testing';
  }

  // Protocols/Standards
  if (/protocol|standard|governance|leo_v/i.test(filename)) {
    return 'docs/03_protocols_and_standards';
  }

  // API documentation
  if (/api|endpoint|route|rest|graphql/i.test(filename)) {
    return 'docs/02_api';
  }

  // Guides/How-to
  if (/guide|how.?to|tutorial|getting.?started|setup|install/i.test(filename)) {
    return 'docs/guides';
  }

  // Reference/Patterns
  if (/reference|pattern|cheatsheet|quick/i.test(filename)) {
    return 'docs/reference';
  }

  // Architecture
  if (/architect|design|system|overview/i.test(filename)) {
    return 'docs/01_architecture';
  }

  // Deployment/Operations
  if (/deploy|ops|operation|devops|ci|cd/i.test(filename)) {
    return 'docs/06_deployment';
  }

  // Feature documentation
  if (/feature|feat|implement/i.test(filename)) {
    return 'docs/04_features';
  }

  // Default: summaries for unclassified
  return 'docs/summaries';
}

function findRootMdFiles() {
  const items = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
  const mdFiles = [];

  for (const item of items) {
    if (item.isFile() && item.name.endsWith('.md')) {
      if (!ALLOWED_ROOT_FILES.includes(item.name)) {
        mdFiles.push(item.name);
      }
    }
  }

  return mdFiles;
}

function generateMovePlan(files) {
  const plan = [];

  for (const filename of files) {
    const sourcePath = path.join(ROOT_DIR, filename);
    const content = fs.readFileSync(sourcePath, 'utf8');
    const targetDir = classifyFile(filename, content);
    const targetPath = path.join(ROOT_DIR, targetDir, filename);

    plan.push({
      filename,
      source: filename,
      targetDir,
      target: path.relative(ROOT_DIR, targetPath),
      exists: fs.existsSync(targetPath)
    });
  }

  return plan;
}

function executeMove(plan, dryRun = true) {
  const results = { moved: [], skipped: [], errors: [] };

  for (const item of plan) {
    if (item.exists) {
      results.skipped.push({ ...item, reason: 'Target already exists' });
      continue;
    }

    if (dryRun) {
      results.moved.push(item);
      continue;
    }

    try {
      // Ensure target directory exists
      const targetDir = path.join(ROOT_DIR, item.targetDir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Move file
      const sourcePath = path.join(ROOT_DIR, item.source);
      const targetPath = path.join(ROOT_DIR, item.target);
      fs.renameSync(sourcePath, targetPath);

      results.moved.push(item);
    } catch (error) {
      results.errors.push({ ...item, error: error.message });
    }
  }

  return results;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  console.log('🧹 Root Directory Documentation Cleanup');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log('');

  // Find files to move
  const files = findRootMdFiles();
  console.log(`Found ${files.length} .md files in root (excluding allowed files)`);

  if (files.length === 0) {
    console.log('✅ No files to move');
    process.exit(0);
  }

  // Generate move plan
  const plan = generateMovePlan(files);

  // Show plan
  console.log('\n📋 Move Plan:');
  for (const item of plan) {
    const status = item.exists ? '⚠️  SKIP (exists)' : '→';
    console.log(`   ${item.source} ${status} ${item.target}`);
  }

  // Execute or simulate
  console.log('\n🔄 Executing...');
  const results = executeMove(plan, dryRun);

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Moved: ${results.moved.length}`);
  console.log(`   Skipped: ${results.skipped.length}`);
  console.log(`   Errors: ${results.errors.length}`);

  if (results.skipped.length > 0 && verbose) {
    console.log('\n⚠️  Skipped files:');
    for (const item of results.skipped) {
      console.log(`   ${item.filename}: ${item.reason}`);
    }
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const item of results.errors) {
      console.log(`   ${item.filename}: ${item.error}`);
    }
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to execute moves.');
  } else {
    console.log('\n✅ Cleanup complete!');
    console.log('   Run `git status` to see moved files');
    console.log('   Run `npm run docs:validate-links` to check for broken references');
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
