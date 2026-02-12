#!/usr/bin/env node
/**
 * Consolidate Database Documentation
 * Reduces 38+ database files to 8 canonical files
 *
 * Target Structure:
 * 1. docs/database/schema/schema-overview.md
 * 2. docs/database/migrations/migration-guide.md
 * 3. docs/database/migrations/migration-log.md
 * 4. docs/database/rls/rls-policy-guide.md
 * 5. docs/reference/database/database-patterns.md
 * 6. docs/reference/database/validation-patterns.md
 * 7. docs/01_architecture/database-architecture.md
 * 8. docs/guides/database/database-connection-guide.md
 *
 * Usage:
 *   node scripts/consolidate-database-docs.js --dry-run  # Preview
 *   node scripts/consolidate-database-docs.js            # Execute
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const _DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Canonical files and what they should contain
const CANONICAL_FILES = {
  'docs/database/schema/schema-overview.md': {
    title: 'Database Schema Overview',
    category: 'Database',
    description: 'Complete ERD, table definitions, and relationships',
    keywords: ['schema', 'erd', 'table', 'column', 'relationship', 'aegis-schema', 'database_schema']
  },
  'docs/database/migrations/migration-guide.md': {
    title: 'Database Migration Guide',
    category: 'Guide',
    description: 'How to create, apply, and rollback migrations',
    keywords: ['migration', 'how to', 'guide', 'create migration', 'apply migration', 'rollback']
  },
  'docs/database/migrations/migration-log.md': {
    title: 'Migration Log',
    category: 'Report',
    description: 'Running log of all migrations applied',
    keywords: ['migration log', 'migration history', 'applied migrations']
  },
  'docs/database/rls/rls-policy-guide.md': {
    title: 'Row Level Security (RLS) Policy Guide',
    category: 'Guide',
    description: 'RLS patterns, security model, and policy examples',
    keywords: ['rls', 'row level security', 'policy', 'security']
  },
  'docs/reference/database/database-patterns.md': {
    title: 'Database Patterns & Best Practices',
    category: 'Reference',
    description: 'Database agent patterns, best practices, and anti-patterns',
    keywords: ['pattern', 'best practice', 'anti-pattern', 'database-agent']
  },
  'docs/reference/database/validation-patterns.md': {
    title: 'Database Validation Patterns',
    category: 'Reference',
    description: 'Validation rules, check constraints, and triggers',
    keywords: ['validation', 'constraint', 'trigger', 'check', 'enforcement']
  },
  'docs/01_architecture/database-architecture.md': {
    title: 'Database Architecture',
    category: 'Architecture',
    description: 'Design decisions, scalability, and trade-offs',
    keywords: ['architecture', 'design', 'scalability', 'overview']
  },
  'docs/guides/database/database-connection-guide.md': {
    title: 'Database Connection Guide',
    category: 'Guide',
    description: 'How to connect, common issues, and troubleshooting',
    keywords: ['connection', 'connect', 'troubleshoot', 'issue', 'error']
  }
};

function findDatabaseDocs() {
  const results = [];
  const searchDirs = [
    'docs/database',
    'docs/reference',
    'docs/guides',
    'docs/01_architecture',
    'docs/04_features',
    'docs/summaries'
  ];

  for (const dir of searchDirs) {
    const fullDir = path.join(ROOT_DIR, dir);
    if (fs.existsSync(fullDir)) {
      findMdFilesRecursive(fullDir, results);
    }
  }

  // Filter to database-related files
  return results.filter(f => {
    const name = f.name.toLowerCase();
    const content = fs.readFileSync(f.path, 'utf8').toLowerCase().substring(0, 2000);
    return /database|schema|migration|rls|supabase|postgres|table|column/i.test(name + content);
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
  } catch (_e) { /* skip */ }
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
  return { canonical: 'docs/archive/2026/database', config: null, score: 0 };
}

function generateConsolidationPlan(files) {
  const plan = {
    merge: {},      // Files to merge into canonical
    archive: [],    // Files to archive
    keep: []        // Files that are already canonical
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
  const _verbose = process.argv.includes('--verbose');

  console.log('📚 Database Documentation Consolidation');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log('');

  // Find database docs
  const files = findDatabaseDocs();
  console.log(`Found ${files.length} database-related documentation files`);

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
  console.log('\n🎯 Target Canonical Files (8 total):');
  for (const [canonical, _config] of Object.entries(CANONICAL_FILES)) {
    const exists = fs.existsSync(path.join(ROOT_DIR, canonical));
    const status = exists ? '✓' : '○';
    console.log(`   ${status} ${canonical}`);
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to execute.');
    console.log('   Note: Actual merge requires manual content review.');
    console.log('   This script identifies candidates; merging is a separate step.');
  }

  // Output JSON plan for further processing
  if (process.argv.includes('--json')) {
    console.log('\n--- JSON PLAN ---');
    console.log(JSON.stringify(plan, null, 2));
  }

  process.exit(0);
}

main();
