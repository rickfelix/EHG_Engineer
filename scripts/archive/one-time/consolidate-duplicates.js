#!/usr/bin/env node
/**
 * Consolidate Exact Filename Duplicates
 *
 * For each duplicate group:
 * 1. Identify canonical version (by priority location, then newest, then largest)
 * 2. Check for unique content in non-canonical files
 * 3. Archive non-canonical files to docs/archive/2026/duplicates/
 * 4. Update cross-references in other files
 *
 * Usage:
 *   node scripts/consolidate-duplicates.js --analyze     # Show what would happen
 *   node scripts/consolidate-duplicates.js --execute     # Actually consolidate
 *   node scripts/consolidate-duplicates.js --dry-run     # Preview changes
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const ARCHIVE_DIR = path.join(DOCS_DIR, 'archive', '2026', 'duplicates');

// Priority order for canonical location selection (higher index = higher priority)
const LOCATION_PRIORITY = [
  'archive',           // Lowest - archived content
  'parking-lot',
  'drafts',
  'brainstorming',
  '04_features',       // Features often has duplicates from various sources
  'summaries',
  'troubleshooting',
  'operations',
  'guides',
  'vision',
  'reference',
  '05_testing',
  '03_protocols_and_standards',
  '02_api',
  '01_architecture',   // Highest - architecture docs are canonical
  'database',
  'leo'
];

// Files to skip
const SKIP_PATTERNS = [
  /^CLAUDE.*\.md$/,
  /^README\.md$/,
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

    if (item.name === 'node_modules' || item.name === '.git') continue;
    // Don't skip archive - we need to know what's already there
    if (item.name === 'archive' && dir === DOCS_DIR) continue;

    if (item.isDirectory()) {
      results.push(...findMdFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.md')) {
      if (!shouldSkipFile(item.name)) {
        results.push({
          path: fullPath,
          relativePath: path.relative(ROOT_DIR, fullPath),
          name: item.name,
          dir: path.relative(DOCS_DIR, dir)
        });
      }
    }
  }

  return results;
}

function getLocationPriority(filePath) {
  const relativePath = path.relative(DOCS_DIR, filePath);
  const firstDir = relativePath.split(path.sep)[0];

  const priority = LOCATION_PRIORITY.indexOf(firstDir);
  return priority === -1 ? 0 : priority;
}

function getFileStats(filePath) {
  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  return {
    size: stats.size,
    mtime: stats.mtime,
    content: content,
    hash: crypto.createHash('md5').update(content).digest('hex'),
    lines: content.split('\n').length,
    wordCount: content.split(/\s+/).filter(w => w).length
  };
}

function findDuplicateGroups(files) {
  const byFilename = {};

  for (const file of files) {
    if (!byFilename[file.name]) {
      byFilename[file.name] = [];
    }
    byFilename[file.name].push(file);
  }

  // Filter to only groups with duplicates
  const duplicateGroups = {};
  for (const [filename, matches] of Object.entries(byFilename)) {
    if (matches.length > 1) {
      duplicateGroups[filename] = matches;
    }
  }

  return duplicateGroups;
}

function selectCanonical(files) {
  // Sort by priority (higher is better), then by mtime (newer is better), then by size (larger is better)
  const ranked = files.map(f => ({
    ...f,
    priority: getLocationPriority(f.path),
    stats: getFileStats(f.path)
  }));

  ranked.sort((a, b) => {
    // Priority first
    if (b.priority !== a.priority) return b.priority - a.priority;
    // Then newest
    if (b.stats.mtime.getTime() !== a.stats.mtime.getTime()) {
      return b.stats.mtime.getTime() - a.stats.mtime.getTime();
    }
    // Then largest (more content)
    return b.stats.wordCount - a.stats.wordCount;
  });

  return ranked;
}

function findUniqueContent(canonical, duplicates) {
  const canonicalLines = new Set(canonical.stats.content.split('\n').map(l => l.trim()).filter(l => l));
  const uniqueContent = [];

  for (const dup of duplicates) {
    const dupLines = dup.stats.content.split('\n');
    const unique = dupLines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !canonicalLines.has(trimmed);
    });

    if (unique.length > 0) {
      // Filter out common boilerplate
      const meaningfulUnique = unique.filter(line => {
        return line.length > 10 &&
          !line.startsWith('#') &&
          !line.startsWith('---') &&
          !line.match(/^\*\*[A-Z]/); // Not just metadata
      });

      if (meaningfulUnique.length > 0) {
        uniqueContent.push({
          file: dup.relativePath,
          lines: meaningfulUnique
        });
      }
    }
  }

  return uniqueContent;
}

function archiveFile(file, dryRun = false) {
  // Create archive path preserving original directory structure
  const relativePath = path.relative(DOCS_DIR, file.path);
  const archivePath = path.join(ARCHIVE_DIR, relativePath);

  if (dryRun) {
    return { from: file.relativePath, to: path.relative(ROOT_DIR, archivePath) };
  }

  // Ensure archive directory exists
  const archiveDir = path.dirname(archivePath);
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  // Add archive header to content
  const content = fs.readFileSync(file.path, 'utf8');
  const archivedContent = `<!-- ARCHIVED: ${new Date().toISOString()}
     Reason: Duplicate of canonical file
     Original location: ${file.relativePath}
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->\n\n${content}`;

  fs.writeFileSync(archivePath, archivedContent, 'utf8');

  // Delete original
  fs.unlinkSync(file.path);

  return { from: file.relativePath, to: path.relative(ROOT_DIR, archivePath) };
}

function updateCrossReferences(allFiles, oldPath, newPath, dryRun = false) {
  const updates = [];
  const oldRelative = path.relative(ROOT_DIR, oldPath).replace(/\\/g, '/');

  for (const file of allFiles) {
    if (!fs.existsSync(file.path)) continue;

    const content = fs.readFileSync(file.path, 'utf8');

    // Check if this file references the old path
    if (content.includes(oldRelative) ||
        content.includes(path.basename(oldPath))) {

      // Calculate new relative path from this file to the canonical
      const fromDir = path.dirname(file.path);
      const newRelativePath = path.relative(fromDir, newPath).replace(/\\/g, '/');

      // Replace references
      const updated = content
        .replace(new RegExp(escapeRegExp(oldRelative), 'g'), newRelativePath)
        .replace(new RegExp(`\\(${escapeRegExp(path.basename(oldPath))}\\)`, 'g'), `(${newRelativePath})`);

      if (updated !== content) {
        updates.push({ file: file.relativePath, oldRef: oldRelative, newRef: newRelativePath });

        if (!dryRun) {
          fs.writeFileSync(file.path, updated, 'utf8');
        }
      }
    }
  }

  return updates;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateReport(consolidations) {
  const report = {
    generated: new Date().toISOString(),
    totalGroups: consolidations.length,
    totalFilesArchived: consolidations.reduce((sum, c) => sum + c.archived.length, 0),
    totalCrossRefsUpdated: consolidations.reduce((sum, c) => sum + c.crossRefUpdates.length, 0),
    consolidations: consolidations
  };

  return report;
}

function saveManifest(report) {
  const manifestPath = path.join(DOCS_DIR, 'fixes', 'duplicate-consolidation-manifest.json');
  const manifestDir = path.dirname(manifestPath);

  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(report, null, 2), 'utf8');
  return manifestPath;
}

function main() {
  const args = process.argv.slice(2);
  const analyze = args.includes('--analyze');
  const execute = args.includes('--execute');
  const dryRun = args.includes('--dry-run');

  console.log('📚 Duplicate Documentation Consolidation');
  console.log('='.repeat(50));

  // Find all markdown files
  const files = findMdFiles(DOCS_DIR);
  console.log(`📂 Found ${files.length} markdown files`);

  // Find duplicate groups
  const duplicateGroups = findDuplicateGroups(files);
  const groupCount = Object.keys(duplicateGroups).length;
  console.log(`🔍 Found ${groupCount} duplicate groups`);

  if (groupCount === 0) {
    console.log('\n✅ No duplicates found!');
    process.exit(0);
  }

  const consolidations = [];

  for (const [filename, group] of Object.entries(duplicateGroups)) {
    // Select canonical version
    const ranked = selectCanonical(group);
    const canonical = ranked[0];
    const duplicates = ranked.slice(1);

    // Check for unique content
    const uniqueContent = findUniqueContent(canonical, duplicates);

    const consolidation = {
      filename: filename,
      canonical: {
        path: canonical.relativePath,
        priority: canonical.priority,
        wordCount: canonical.stats.wordCount,
        lastModified: canonical.stats.mtime.toISOString()
      },
      duplicates: duplicates.map(d => ({
        path: d.relativePath,
        priority: d.priority,
        wordCount: d.stats.wordCount,
        sameContent: d.stats.hash === canonical.stats.hash
      })),
      uniqueContent: uniqueContent,
      archived: [],
      crossRefUpdates: []
    };

    if (execute || dryRun) {
      // Archive each duplicate
      for (const dup of duplicates) {
        const archiveResult = archiveFile(dup, dryRun);
        consolidation.archived.push(archiveResult);

        // Update cross-references
        const refUpdates = updateCrossReferences(files, dup.path, canonical.path, dryRun);
        consolidation.crossRefUpdates.push(...refUpdates);
      }
    }

    consolidations.push(consolidation);
  }

  // Print summary
  console.log('\n📊 Consolidation Plan:');
  console.log('='.repeat(50));

  for (const c of consolidations) {
    console.log(`\n📄 ${c.filename}`);
    console.log(`   Canonical: ${c.canonical.path}`);
    console.log(`   Duplicates: ${c.duplicates.length}`);

    for (const d of c.duplicates) {
      const status = d.sameContent ? '(identical)' : '(different content)';
      console.log(`      - ${d.path} ${status}`);
    }

    if (c.uniqueContent.length > 0) {
      console.log('   ⚠️  Unique content found in duplicates:');
      for (const uc of c.uniqueContent) {
        console.log(`      - ${uc.file}: ${uc.lines.length} unique lines`);
      }
    }

    if (c.archived.length > 0) {
      console.log(`   ${dryRun ? '🔍 Would archive:' : '✅ Archived:'}`);
      for (const a of c.archived) {
        console.log(`      ${a.from} → ${a.to}`);
      }
    }

    if (c.crossRefUpdates.length > 0) {
      console.log(`   ${dryRun ? '🔍 Would update refs:' : '✅ Updated refs:'} ${c.crossRefUpdates.length} files`);
    }
  }

  // Generate report
  const report = generateReport(consolidations);

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Total groups: ${report.totalGroups}`);
  console.log(`   Files to archive: ${report.totalFilesArchived}`);
  console.log(`   Cross-refs to update: ${report.totalCrossRefsUpdated}`);

  if (analyze || (!execute && !dryRun)) {
    console.log('\n💡 Next steps:');
    console.log('   node scripts/consolidate-duplicates.js --dry-run    # Preview changes');
    console.log('   node scripts/consolidate-duplicates.js --execute    # Apply changes');
  }

  if (execute && !dryRun) {
    const manifestPath = saveManifest(report);
    console.log(`\n📝 Manifest saved: ${path.relative(ROOT_DIR, manifestPath)}`);
    console.log('\n✅ Consolidation complete!');
  } else if (dryRun) {
    console.log('\n🔍 DRY RUN - no changes made');
  }

  process.exit(0);
}

main();
