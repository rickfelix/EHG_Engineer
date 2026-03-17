#!/usr/bin/env node
/**
 * Fix Invalid Metadata Values
 * Updates files with invalid Category/Status values to valid ones
 *
 * Mappings:
 * - Status: "Active" → "Approved"
 * - Category: Maps to closest valid category
 *
 * Usage:
 *   node scripts/fix-invalid-metadata.js              # Preview changes
 *   node scripts/fix-invalid-metadata.js --execute    # Apply changes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

// Valid values
const VALID_CATEGORIES = [
  'Architecture', 'API', 'Guide', 'Protocol', 'Report',
  'Reference', 'Database', 'Testing', 'Feature', 'Deployment'
];

const VALID_STATUSES = ['Draft', 'Review', 'Approved', 'Deprecated'];

// Mapping rules for invalid values
const STATUS_MAPPINGS = {
  'Active': 'Approved',
  'active': 'Approved',
  'ACTIVE': 'Approved',
  'Published': 'Approved',
  'published': 'Approved',
  'Complete': 'Approved',
  'complete': 'Approved',
  'Completed': 'Approved',
  'completed': 'Approved',
  'In Progress': 'Draft',
  'in progress': 'Draft',
  'WIP': 'Draft',
  'wip': 'Draft',
  'Pending': 'Review',
  'pending': 'Review',
  'Under Review': 'Review',
  'Archived': 'Deprecated',
  'archived': 'Deprecated',
  'Obsolete': 'Deprecated',
  'obsolete': 'Deprecated'
};

const CATEGORY_MAPPINGS = {
  // Direct matches (case variations)
  'architecture': 'Architecture',
  'api': 'API',
  'guide': 'Guide',
  'protocol': 'Protocol',
  'report': 'Report',
  'reference': 'Reference',
  'database': 'Database',
  'testing': 'Testing',
  'feature': 'Feature',
  'deployment': 'Deployment',

  // Common invalid values
  'Analysis': 'Report',
  'analysis': 'Report',
  'Operations': 'Deployment',
  'operations': 'Deployment',
  'Documentation': 'Guide',
  'documentation': 'Guide',
  'Docs': 'Guide',
  'docs': 'Guide',
  'Technical': 'Reference',
  'technical': 'Reference',
  'Standards': 'Protocol',
  'standards': 'Protocol',
  'Process': 'Protocol',
  'process': 'Protocol',
  'Workflow': 'Protocol',
  'workflow': 'Protocol',
  'Schema': 'Database',
  'schema': 'Database',
  'Migration': 'Database',
  'migration': 'Database',
  'Test': 'Testing',
  'test': 'Testing',
  'QA': 'Testing',
  'qa': 'Testing',
  'Implementation': 'Feature',
  'implementation': 'Feature',
  'Development': 'Feature',
  'development': 'Feature',
  'Infrastructure': 'Deployment',
  'infrastructure': 'Deployment',
  'DevOps': 'Deployment',
  'devops': 'Deployment',
  'Summary': 'Report',
  'summary': 'Report',
  'Overview': 'Reference',
  'overview': 'Reference',
  'Specification': 'API',
  'specification': 'API',
  'Spec': 'API',
  'spec': 'API',

  // Template placeholders - map based on file path or default
  '[Architecture|API|Guide|Protocol|Report]': null, // Will be inferred
  'TBD': null
};

function inferCategoryFromPath(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath).toLowerCase();

  if (relativePath.includes('architecture') || relativePath.includes('01_architecture')) {
    return 'Architecture';
  }
  if (relativePath.includes('api') || relativePath.includes('02_api')) {
    return 'API';
  }
  if (relativePath.includes('protocol') || relativePath.includes('03_protocols')) {
    return 'Protocol';
  }
  if (relativePath.includes('feature') || relativePath.includes('04_features')) {
    return 'Feature';
  }
  if (relativePath.includes('testing') || relativePath.includes('05_testing')) {
    return 'Testing';
  }
  if (relativePath.includes('deployment') || relativePath.includes('06_deployment')) {
    return 'Deployment';
  }
  if (relativePath.includes('database') || relativePath.includes('db')) {
    return 'Database';
  }
  if (relativePath.includes('guide')) {
    return 'Guide';
  }
  if (relativePath.includes('reference')) {
    return 'Reference';
  }
  if (relativePath.includes('summaries') || relativePath.includes('report')) {
    return 'Report';
  }

  // Default to Guide for docs
  return 'Guide';
}

function inferStatusFromContent(content) {
  // Check for deprecation indicators
  if (content.toLowerCase().includes('deprecated') ||
      content.toLowerCase().includes('obsolete') ||
      content.toLowerCase().includes('no longer used')) {
    return 'Deprecated';
  }

  // Check for draft indicators
  if (content.toLowerCase().includes('work in progress') ||
      content.toLowerCase().includes('todo:') ||
      content.toLowerCase().includes('draft')) {
    return 'Draft';
  }

  // Default to Approved for existing docs
  return 'Approved';
}

function findMdFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'node_modules' || item.name === '.git' || item.name === 'archive') continue;
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        findMdFiles(fullPath, results);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (_e) { /* skip */ }
  return results;
}

function parseMetadata(content) {
  const metadataMatch = content.match(/## Metadata\s*\n([\s\S]*?)(?=\n##|\n---|\n\n[^-*]|$)/);
  if (!metadataMatch) return null;

  const metadata = {};
  const lines = metadataMatch[1].split('\n');

  for (const line of lines) {
    const match = line.match(/^-\s*\*\*([^*]+)\*\*:\s*(.+)$/);
    if (match) {
      metadata[match[1].trim()] = match[2].trim();
    }
  }

  return metadata;
}

function fixMetadataInContent(content, filePath, _dryRun) {
  const changes = [];

  // Fix Category
  const categoryMatch = content.match(/(-\s*\*\*Category\*\*:\s*)([^\n]+)/);
  if (categoryMatch) {
    const currentCategory = categoryMatch[2].trim();
    let newCategory = null;

    // Check if it's already valid
    if (VALID_CATEGORIES.includes(currentCategory)) {
      // Already valid
    } else if (CATEGORY_MAPPINGS[currentCategory] !== undefined) {
      newCategory = CATEGORY_MAPPINGS[currentCategory];
      if (newCategory === null) {
        // Infer from path
        newCategory = inferCategoryFromPath(filePath);
      }
    } else {
      // Try case-insensitive match
      const lowerCategory = currentCategory.toLowerCase();
      for (const valid of VALID_CATEGORIES) {
        if (valid.toLowerCase() === lowerCategory) {
          newCategory = valid;
          break;
        }
      }
      if (!newCategory) {
        // Infer from path
        newCategory = inferCategoryFromPath(filePath);
      }
    }

    if (newCategory && newCategory !== currentCategory) {
      changes.push({ field: 'Category', from: currentCategory, to: newCategory });
      content = content.replace(categoryMatch[0], `${categoryMatch[1]}${newCategory}`);
    }
  }

  // Fix Status
  const statusMatch = content.match(/(-\s*\*\*Status\*\*:\s*)([^\n]+)/);
  if (statusMatch) {
    const currentStatus = statusMatch[2].trim();
    let newStatus = null;

    // Check if it's already valid
    if (VALID_STATUSES.includes(currentStatus)) {
      // Already valid
    } else if (STATUS_MAPPINGS[currentStatus] !== undefined) {
      newStatus = STATUS_MAPPINGS[currentStatus];
    } else {
      // Try case-insensitive match
      const lowerStatus = currentStatus.toLowerCase();
      for (const valid of VALID_STATUSES) {
        if (valid.toLowerCase() === lowerStatus) {
          newStatus = valid;
          break;
        }
      }
      if (!newStatus) {
        // Infer from content
        newStatus = inferStatusFromContent(content);
      }
    }

    if (newStatus && newStatus !== currentStatus) {
      changes.push({ field: 'Status', from: currentStatus, to: newStatus });
      content = content.replace(statusMatch[0], `${statusMatch[1]}${newStatus}`);
    }
  }

  return { content, changes };
}

function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const verbose = args.includes('--verbose') || args.includes('-v');

  console.log('🔧 Fix Invalid Metadata Values');
  console.log('='.repeat(50));
  console.log(`Mode: ${execute ? 'EXECUTE (will modify files)' : 'PREVIEW (dry run)'}`);
  console.log('');

  const files = findMdFiles(DOCS_DIR);
  console.log(`Found ${files.length} markdown files to check...`);
  console.log('');

  let totalFixed = 0;
  let totalChanges = 0;
  const fixedFiles = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const metadata = parseMetadata(content);

      if (!metadata) continue;

      const { content: newContent, changes } = fixMetadataInContent(content, filePath, !execute);

      if (changes.length > 0) {
        totalFixed++;
        totalChanges += changes.length;

        const relativePath = path.relative(ROOT_DIR, filePath);
        fixedFiles.push({ path: relativePath, changes });

        if (verbose || !execute) {
          console.log(`📝 ${relativePath}`);
          for (const change of changes) {
            console.log(`   ${change.field}: "${change.from}" → "${change.to}"`);
          }
        }

        if (execute) {
          fs.writeFileSync(filePath, newContent, 'utf8');
        }
      }
    } catch (e) {
      if (verbose) {
        console.error(`Error processing ${filePath}: ${e.message}`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Files checked: ${files.length}`);
  console.log(`   Files with fixes: ${totalFixed}`);
  console.log(`   Total changes: ${totalChanges}`);

  if (!execute && totalFixed > 0) {
    console.log('');
    console.log('💡 Run with --execute to apply changes:');
    console.log('   node scripts/fix-invalid-metadata.js --execute');
  }

  if (execute && totalFixed > 0) {
    console.log('');
    console.log('✅ Changes applied successfully!');
    console.log('   Run npm run docs:validate-metadata to verify.');
  }

  // Output JSON for programmatic use
  if (args.includes('--json')) {
    console.log('\n--- JSON RESULTS ---');
    console.log(JSON.stringify({
      filesChecked: files.length,
      filesFixed: totalFixed,
      totalChanges,
      execute,
      fixes: fixedFiles
    }, null, 2));
  }
}

main();
