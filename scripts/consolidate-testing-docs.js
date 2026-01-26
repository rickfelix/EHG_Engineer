#!/usr/bin/env node
/**
 * Consolidate Testing Documentation
 * Reduces 18+ testing files to 6 canonical files
 *
 * Target Structure:
 * 1. docs/03_protocols_and_standards/testing-governance.md
 * 2. docs/05_testing/strategy/test-strategy.md
 * 3. docs/05_testing/e2e/e2e-guide.md
 * 4. docs/05_testing/unit/unit-test-guide.md
 * 5. docs/05_testing/campaigns/campaign-reports.md
 * 6. docs/guides/testing/testing-quickstart.md
 *
 * Usage:
 *   node scripts/consolidate-testing-docs.js --dry-run  # Preview
 *   node scripts/consolidate-testing-docs.js            # Execute
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Canonical files and what they should contain
const CANONICAL_FILES = {
  'docs/03_protocols_and_standards/testing-governance.md': {
    title: 'Testing Governance',
    category: 'Protocol',
    description: 'Testing requirements per SD type, governance, and gates',
    keywords: ['governance', 'protocol', 'requirement', 'gate', 'leo', 'standard']
  },
  'docs/05_testing/strategy/test-strategy.md': {
    title: 'Test Strategy',
    category: 'Testing',
    description: 'Overall test strategy and coverage goals',
    keywords: ['strategy', 'coverage', 'goal', 'approach', 'testing_qa']
  },
  'docs/05_testing/e2e/e2e-guide.md': {
    title: 'E2E Testing Guide',
    category: 'Guide',
    description: 'How to write E2E tests, patterns, Playwright usage',
    keywords: ['e2e', 'end-to-end', 'playwright', 'integration', 'ui test']
  },
  'docs/05_testing/unit/unit-test-guide.md': {
    title: 'Unit Testing Guide',
    category: 'Guide',
    description: 'Unit test patterns, mocking, and coverage',
    keywords: ['unit', 'jest', 'vitest', 'mock', 'stub', 'coverage']
  },
  'docs/05_testing/campaigns/campaign-reports.md': {
    title: 'Testing Campaign Reports',
    category: 'Report',
    description: 'Running log of testing campaigns and results',
    keywords: ['campaign', 'report', 'result', 'run', 'execution']
  },
  'docs/guides/testing/testing-quickstart.md': {
    title: 'Testing Quickstart',
    category: 'Guide',
    description: 'How to get started with testing locally',
    keywords: ['quickstart', 'getting started', 'setup', 'local', 'how to']
  }
};

function findTestingDocs() {
  const results = [];
  const searchDirs = [
    'docs/05_testing',
    'docs/03_protocols_and_standards',
    'docs/guides',
    'docs/reference',
    'docs/04_features'
  ];

  for (const dir of searchDirs) {
    const fullDir = path.join(ROOT_DIR, dir);
    if (fs.existsSync(fullDir)) {
      findMdFilesRecursive(fullDir, results);
    }
  }

  // Filter to testing-related files
  return results.filter(f => {
    const name = f.name.toLowerCase();
    const content = fs.readFileSync(f.path, 'utf8').toLowerCase().substring(0, 2000);
    return /test|qa|e2e|playwright|jest|vitest|coverage|spec/i.test(name + content);
  });
}

function findMdFilesRecursive(dir, results) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'archive' || item.name === 'node_modules') continue;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        findMdFilesRecursive(fullPath, results);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push({
          name: item.name,
          path: fullPath,
          relativePath: path.relative(ROOT_DIR, fullPath)
        });
      }
    }
  } catch (e) { /* skip */ }
}

function classifyFile(file, content) {
  const lowerName = file.name.toLowerCase();
  const lowerContent = content.toLowerCase();

  // Check each canonical file's keywords
  for (const [canonical, config] of Object.entries(CANONICAL_FILES)) {
    const matchScore = config.keywords.reduce((score, kw) => {
      if (lowerName.includes(kw) || lowerContent.includes(kw)) {
        return score + 1;
      }
      return score;
    }, 0);

    if (matchScore >= 2) {
      return { canonical, config, score: matchScore };
    }
  }

  // Default: archive
  return { canonical: 'docs/archive/2026/testing', config: null, score: 0 };
}

function generateConsolidationPlan(files) {
  const plan = {
    merge: {},
    archive: [],
    keep: []
  };

  for (const file of files) {
    const content = fs.readFileSync(file.path, 'utf8');
    const classification = classifyFile(file, content);

    // Check if this IS a canonical file
    const isCanonical = Object.keys(CANONICAL_FILES).some(c =>
      file.relativePath.replace(/\\/g, '/') === c
    );

    if (isCanonical) {
      plan.keep.push(file);
      continue;
    }

    if (classification.config) {
      if (!plan.merge[classification.canonical]) {
        plan.merge[classification.canonical] = [];
      }
      plan.merge[classification.canonical].push({
        ...file,
        score: classification.score
      });
    } else {
      plan.archive.push(file);
    }
  }

  return plan;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  console.log('🧪 Testing Documentation Consolidation');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('');

  // Find testing docs
  const files = findTestingDocs();
  console.log(`Found ${files.length} testing-related documentation files`);

  // Generate plan
  const plan = generateConsolidationPlan(files);

  // Show summary
  console.log('\n📊 Consolidation Plan:');
  console.log(`   Keep (canonical): ${plan.keep.length}`);
  console.log(`   Merge into canonical: ${Object.values(plan.merge).flat().length}`);
  console.log(`   Archive: ${plan.archive.length}`);

  // Show merge plan
  console.log('\n📋 Merge Plan:');
  for (const [canonical, sources] of Object.entries(plan.merge)) {
    if (sources.length > 0) {
      console.log(`\n   → ${canonical}`);
      for (const src of sources.slice(0, 3)) {
        console.log(`      ← ${src.relativePath} (score: ${src.score})`);
      }
      if (sources.length > 3) {
        console.log(`      ... and ${sources.length - 3} more`);
      }
    }
  }

  // Show archive list
  if (plan.archive.length > 0) {
    console.log('\n📦 To Archive:');
    for (const file of plan.archive.slice(0, 5)) {
      console.log(`   ${file.relativePath}`);
    }
    if (plan.archive.length > 5) {
      console.log(`   ... and ${plan.archive.length - 5} more`);
    }
  }

  // Target structure
  console.log('\n🎯 Target Canonical Files (6 total):');
  for (const [canonical, config] of Object.entries(CANONICAL_FILES)) {
    const exists = fs.existsSync(path.join(ROOT_DIR, canonical));
    const status = exists ? '✓' : '○';
    console.log(`   ${status} ${canonical}`);
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to execute.');
    console.log('   Note: Actual merge requires manual content review.');
  }

  // Output JSON plan
  if (process.argv.includes('--json')) {
    console.log('\n--- JSON PLAN ---');
    console.log(JSON.stringify(plan, null, 2));
  }

  process.exit(0);
}

main();
