#!/usr/bin/env node
/**
 * Inject Documentation Metadata
 * Automatically adds metadata headers to files missing them
 *
 * Detects appropriate values based on:
 * - File path (for category)
 * - File modification date (for last updated)
 * - Content analysis (for tags)
 *
 * Usage:
 *   node scripts/inject-doc-metadata.js --dry-run     # Preview changes
 *   node scripts/inject-doc-metadata.js               # Execute injection
 *   node scripts/inject-doc-metadata.js --file <path> # Single file
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Category mappings based on path patterns
const CATEGORY_MAPPINGS = [
  { pattern: /01_architecture|architecture/i, category: 'Architecture' },
  { pattern: /02_api|api/i, category: 'API' },
  { pattern: /03_protocol|protocol|standards/i, category: 'Protocol' },
  { pattern: /04_feature|feature/i, category: 'Feature' },
  { pattern: /05_testing|testing|test/i, category: 'Testing' },
  { pattern: /06_deployment|deployment|deploy/i, category: 'Deployment' },
  { pattern: /guide/i, category: 'Guide' },
  { pattern: /reference/i, category: 'Reference' },
  { pattern: /database|db|schema|migration/i, category: 'Database' },
  { pattern: /summar|report|analysis/i, category: 'Report' }
];

// Tag keywords to detect
const TAG_KEYWORDS = [
  'database', 'api', 'testing', 'e2e', 'unit', 'migration', 'schema',
  'rls', 'security', 'authentication', 'authorization', 'feature',
  'guide', 'protocol', 'leo', 'sd', 'directive', 'handoff', 'validation',
  'deployment', 'infrastructure', 'documentation', 'reference', 'architecture',
  'supabase', 'postgres', 'react', 'nextjs', 'typescript', 'javascript',
  'frontend', 'backend', 'workflow', 'automation', 'ci', 'cd', 'pipeline',
  'monitoring', 'logging', 'performance', 'optimization', 'refactor',
  'component', 'service', 'module', 'hook', 'context', 'state',
  'aegis', 'cxp', 'mcp', 'agent', 'sub-agent', 'retrieval'
];

// Files to skip (auto-generated or special)
const SKIP_PATTERNS = [
  /^CLAUDE.*\.md$/,
  /^README\.md$/,
  /^CHANGELOG\.md$/,
  /session-state\.md$/,
  /compaction-snapshot\.md$/
];

function shouldSkipFile(filename) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filename));
}

function findMdFiles(dir) {
  const results = [];

  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.name === 'node_modules' || item.name === '.git' || item.name === 'archive') continue;

    if (item.isDirectory()) {
      results.push(...findMdFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.md')) {
      if (!shouldSkipFile(item.name)) {
        results.push({
          name: item.name,
          path: fullPath,
          relativePath: path.relative(ROOT_DIR, fullPath)
        });
      }
    }
  }

  return results;
}

function hasMetadata(content) {
  return /##\s*Metadata\s*\n/i.test(content);
}

function detectCategory(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath);

  for (const { pattern, category } of CATEGORY_MAPPINGS) {
    if (pattern.test(relativePath)) {
      return category;
    }
  }

  return 'Documentation';
}

function detectTags(content, filePath) {
  const contentLower = content.toLowerCase();
  const pathLower = filePath.toLowerCase();
  const combined = contentLower + ' ' + pathLower;

  const detectedTags = [];

  for (const keyword of TAG_KEYWORDS) {
    if (combined.includes(keyword) && !detectedTags.includes(keyword)) {
      detectedTags.push(keyword);
    }
  }

  // Return at least 2 tags
  if (detectedTags.length < 2) {
    detectedTags.push('documentation');
    if (detectedTags.length < 2) {
      detectedTags.push('general');
    }
  }

  // Return top 4 tags
  return detectedTags.slice(0, 4);
}

function getLastModified(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime.toISOString().split('T')[0];
  } catch (_e) {
    return new Date().toISOString().split('T')[0];
  }
}

function generateMetadataBlock(file, content) {
  const category = detectCategory(file.path);
  const tags = detectTags(content, file.path);
  const lastUpdated = getLastModified(file.path);

  return `## Metadata
- **Category**: ${category}
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: ${lastUpdated}
- **Tags**: ${tags.join(', ')}
`;
}

function findInsertPosition(content) {
  // Find the first heading (title)
  const titleMatch = content.match(/^#\s+.+$/m);

  if (titleMatch) {
    // Insert after title and any immediate blank lines
    const titleEnd = titleMatch.index + titleMatch[0].length;
    const afterTitle = content.substring(titleEnd);
    const blankLines = afterTitle.match(/^\s*\n/);
    const position = titleEnd + (blankLines ? blankLines[0].length : 0);
    return position;
  }

  // No title found, insert at beginning
  return 0;
}

function injectMetadata(file, dryRun = true) {
  const content = fs.readFileSync(file.path, 'utf8');

  // Skip if already has metadata
  if (hasMetadata(content)) {
    return { file: file.relativePath, status: 'skipped', reason: 'Already has metadata' };
  }

  // Generate metadata block
  const metadataBlock = generateMetadataBlock(file, content);

  // Find position to insert
  const position = findInsertPosition(content);

  // Build new content
  const newContent =
    content.substring(0, position) +
    '\n' + metadataBlock + '\n' +
    content.substring(position);

  if (!dryRun) {
    fs.writeFileSync(file.path, newContent, 'utf8');
  }

  return {
    file: file.relativePath,
    status: 'injected',
    metadata: metadataBlock.split('\n').slice(1, -1).map(l => l.trim())
  };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');
  const singleFileArg = process.argv.indexOf('--file');
  const singleFile = singleFileArg > -1 ? process.argv[singleFileArg + 1] : null;

  console.log('📝 Documentation Metadata Injection');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log('');

  let files;
  if (singleFile) {
    const fullPath = path.resolve(ROOT_DIR, singleFile);
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ File not found: ${singleFile}`);
      process.exit(1);
    }
    files = [{
      name: path.basename(fullPath),
      path: fullPath,
      relativePath: path.relative(ROOT_DIR, fullPath)
    }];
    console.log(`Processing single file: ${singleFile}`);
  } else {
    files = findMdFiles(DOCS_DIR);
    console.log(`Found ${files.length} markdown files`);
  }

  // Process files
  console.log('\n📋 Processing files...');
  const results = {
    injected: [],
    skipped: [],
    errors: []
  };

  for (const file of files) {
    try {
      const result = injectMetadata(file, dryRun);
      if (result.status === 'injected') {
        results.injected.push(result);
      } else {
        results.skipped.push(result);
      }
    } catch (error) {
      results.errors.push({ file: file.relativePath, error: error.message });
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total files: ${files.length}`);
  console.log(`   Injected: ${results.injected.length}`);
  console.log(`   Skipped (has metadata): ${results.skipped.length}`);
  console.log(`   Errors: ${results.errors.length}`);

  // Show injected files
  if (results.injected.length > 0) {
    console.log(`\n✅ ${dryRun ? 'Would inject' : 'Injected'} metadata into:`);
    for (const r of results.injected.slice(0, 10)) {
      console.log(`   ${r.file}`);
      if (verbose) {
        for (const line of r.metadata) {
          console.log(`      ${line}`);
        }
      }
    }
    if (results.injected.length > 10) {
      console.log(`   ... and ${results.injected.length - 10} more`);
    }
  }

  // Show errors
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const e of results.errors) {
      console.log(`   ${e.file}: ${e.error}`);
    }
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to inject metadata.');
  } else {
    console.log('\n✅ Metadata injection complete!');
    console.log('   Run `npm run docs:validate-metadata` to verify');
  }

  // JSON output
  if (process.argv.includes('--json')) {
    console.log('\n--- JSON RESULTS ---');
    console.log(JSON.stringify(results, null, 2));
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
