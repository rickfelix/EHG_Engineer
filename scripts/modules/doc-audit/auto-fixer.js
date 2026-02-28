/**
 * Doc-Audit Auto-Fixer — Automatically fixes trivially correctable documentation gaps
 *
 * Fixes three dimension categories:
 *   D02: Missing YAML front-matter → inject stub metadata
 *   D06: Missing README.md index   → create directory listing README
 *   D07: Missing TOC in long docs  → insert generated TOC after title
 *
 * Safety guarantees:
 *   - Never overwrites existing front-matter, README, or TOC
 *   - Only operates on gaps detected by the scorer
 *   - All changes are additive (prepend/insert/create), never destructive
 *
 * Used by:
 *   scripts/eva/doc-health-audit.mjs  (cmdRun step 2)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

// ─── Category inference from directory path ─────────────────────────────────

const CATEGORY_MAP = {
  '01_architecture': 'architecture',
  '02_api': 'api',
  '03_protocols_and_standards': 'protocol',
  '04_features': 'feature',
  '05_testing': 'testing',
  '06_deployment': 'deployment',
  'guides': 'guide',
  'reference': 'reference',
  'database': 'database',
  'leo': 'protocol',
  'plans': 'architecture',
};

function inferCategory(relPath) {
  const parts = relPath.replace(/\\/g, '/').split('/');
  // Check docs/XXX segment
  if (parts[0] === 'docs' && parts.length > 1) {
    const subdir = parts[1];
    if (CATEGORY_MAP[subdir]) return CATEGORY_MAP[subdir];
  }
  return 'general';
}

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Auto-fix trivial documentation gaps (D02, D06, D07).
 * @param {{ files: object[], directories: object[] }} scanResult
 * @param {string} rootDir
 * @param {{ dimensions: object[] }} scoreResult
 * @returns {{ fixed: Array<{dimension: string, file: string, action: string}>, skipped: string[] }}
 */
export function autoFixAll(scanResult, rootDir, scoreResult) {
  const fixed = [];
  const skipped = [];

  const d02 = scoreResult.dimensions.find(d => d.id === 'D02');
  const d06 = scoreResult.dimensions.find(d => d.id === 'D06');
  const d07 = scoreResult.dimensions.find(d => d.id === 'D07');

  // Build date index from scan data (already enriched with git dates)
  const dateIndex = new Map();
  for (const f of scanResult.files) {
    const normalized = f.relPath.replace(/\\/g, '/');
    if (f.gitLastModified) {
      dateIndex.set(normalized, f.gitLastModified.toISOString().slice(0, 10));
    }
  }

  if (d02 && d02.gaps.length > 0) {
    const result = fixD02Metadata(scanResult.files, d02.gaps, rootDir, dateIndex);
    fixed.push(...result.fixed);
    skipped.push(...result.skipped);
  }

  if (d06 && d06.gaps.length > 0) {
    const result = fixD06IndexCoverage(scanResult.directories, d06.gaps, rootDir);
    fixed.push(...result.fixed);
    skipped.push(...result.skipped);
  }

  if (d07 && d07.gaps.length > 0) {
    const result = fixD07Toc(scanResult.files, d07.gaps, rootDir);
    fixed.push(...result.fixed);
    skipped.push(...result.skipped);
  }

  return { fixed, skipped };
}

// ─── D02: Inject front-matter ────────────────────────────────────────────────

function fixD02Metadata(files, gaps, rootDir, dateIndex) {
  const fixed = [];
  const skipped = [];

  // Only auto-fix files that are missing front-matter entirely
  const missingFMGaps = gaps.filter(g => g.includes('missing YAML front-matter entirely'));

  for (const gap of missingFMGaps) {
    // Parse: "relPath — missing YAML front-matter entirely"
    const match = gap.match(/^(.+?)\s+—\s+missing YAML front-matter entirely/);
    if (!match) {
      skipped.push(`D02: Could not parse gap: ${gap}`);
      continue;
    }

    const relPath = match[1].trim();
    const fullPath = join(rootDir, relPath);

    if (!existsSync(fullPath)) {
      skipped.push(`D02: File not found: ${relPath}`);
      continue;
    }

    let content;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      skipped.push(`D02: Could not read: ${relPath}`);
      continue;
    }

    // Safety: double-check no existing front-matter
    if (content.startsWith('---')) {
      skipped.push(`D02: Already has front-matter: ${relPath}`);
      continue;
    }

    const category = inferCategory(relPath);
    const normalizedRel = relPath.replace(/\\/g, '/');
    const lastUpdated = dateIndex.get(normalizedRel) || TODAY;

    const frontMatter = [
      '---',
      `category: ${category}`,
      'status: draft',
      'version: 1.0.0',
      'author: auto-fixer',
      `last_updated: ${lastUpdated}`,
      `tags: [${category}, auto-generated]`,
      '---',
      '',
    ].join('\n');

    writeFileSync(fullPath, frontMatter + content, 'utf-8');
    fixed.push({ dimension: 'D02', file: relPath, action: 'Injected YAML front-matter' });
  }

  return { fixed, skipped };
}

// ─── D06: Create stub README.md ──────────────────────────────────────────────

function fixD06IndexCoverage(directories, gaps, rootDir) {
  const fixed = [];
  const skipped = [];

  for (const gap of gaps) {
    // Parse: "relPath/ — missing README.md index"
    const match = gap.match(/^(.+?)\/?\s+—\s+missing README\.md index/);
    if (!match) {
      skipped.push(`D06: Could not parse gap: ${gap}`);
      continue;
    }

    const relPath = match[1].trim();
    const dirPath = join(rootDir, relPath);
    const readmePath = join(dirPath, 'README.md');

    // Safety: never overwrite existing README
    if (existsSync(readmePath)) {
      skipped.push(`D06: README already exists: ${relPath}/README.md`);
      continue;
    }

    if (!existsSync(dirPath)) {
      skipped.push(`D06: Directory not found: ${relPath}`);
      continue;
    }

    // List .md files in the directory
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      skipped.push(`D06: Could not read directory: ${relPath}`);
      continue;
    }

    const mdFiles = entries
      .filter(e => e.isFile() && extname(e.name) === '.md' && e.name !== 'README.md')
      .map(e => e.name)
      .sort();

    const subdirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort();

    // Build title from directory name
    const dirName = basename(relPath)
      .replace(/^\d+[-_]/, '') // strip leading numbers
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const lines = [
      `# ${dirName}`,
      '',
    ];

    if (mdFiles.length > 0) {
      lines.push('## Documents', '');
      for (const f of mdFiles) {
        const label = f.replace(/\.md$/, '').replace(/[-_]/g, ' ');
        lines.push(`- [${label}](./${f})`);
      }
      lines.push('');
    }

    if (subdirs.length > 0) {
      lines.push('## Subdirectories', '');
      for (const d of subdirs) {
        lines.push(`- [${d}](./${d}/)`);
      }
      lines.push('');
    }

    if (mdFiles.length === 0 && subdirs.length === 0) {
      lines.push('*No documents yet.*', '');
    }

    writeFileSync(readmePath, lines.join('\n'), 'utf-8');
    fixed.push({ dimension: 'D06', file: `${relPath}/README.md`, action: 'Created stub README' });
  }

  return { fixed, skipped };
}

// ─── D07: Generate and insert TOC ────────────────────────────────────────────

function fixD07Toc(files, gaps, rootDir) {
  const fixed = [];
  const skipped = [];

  // Only fix "N lines but no TOC" gaps (not "missing # title heading")
  const tocGaps = gaps.filter(g => g.includes('lines but no TOC'));

  for (const gap of tocGaps) {
    // Parse: "relPath — 250 lines but no TOC"
    const match = gap.match(/^(.+?)\s+—\s+\d+ lines but no TOC/);
    if (!match) {
      skipped.push(`D07: Could not parse gap: ${gap}`);
      continue;
    }

    const relPath = match[1].trim();
    const fullPath = join(rootDir, relPath);

    if (!existsSync(fullPath)) {
      skipped.push(`D07: File not found: ${relPath}`);
      continue;
    }

    let content;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      skipped.push(`D07: Could not read: ${relPath}`);
      continue;
    }

    // Safety: check for existing TOC
    if (/^\s*[-*]\s+\[.*\]\(#/m.test(content)) {
      skipped.push(`D07: Already has TOC: ${relPath}`);
      continue;
    }

    // Extract ## and ### headings for TOC
    const lines = content.split('\n');
    const headings = [];
    for (const line of lines) {
      const h2 = line.match(/^##\s+(.+)/);
      if (h2) {
        headings.push({ level: 2, text: h2[1].trim() });
        continue;
      }
      const h3 = line.match(/^###\s+(.+)/);
      if (h3) {
        headings.push({ level: 3, text: h3[1].trim() });
      }
    }

    if (headings.length < 2) {
      skipped.push(`D07: Too few headings for TOC (${headings.length}): ${relPath}`);
      continue;
    }

    // Build TOC
    const tocLines = ['## Table of Contents', ''];
    for (const h of headings) {
      // Skip the TOC heading itself if somehow present
      if (h.text === 'Table of Contents') continue;

      const anchor = h.text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      const indent = h.level === 3 ? '  ' : '';
      tocLines.push(`${indent}- [${h.text}](#${anchor})`);
    }
    tocLines.push('');

    // Find insertion point: after front-matter + first # title line + blank line
    let insertIdx = 0;

    // Skip front-matter
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
          insertIdx = i + 1;
          break;
        }
      }
    }

    // Skip blank lines after front-matter
    while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
      insertIdx++;
    }

    // Skip first # title heading
    if (insertIdx < lines.length && /^#\s+/.test(lines[insertIdx])) {
      insertIdx++;
    }

    // Skip blank line after title
    while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
      insertIdx++;
    }

    // Insert TOC
    const before = lines.slice(0, insertIdx);
    const after = lines.slice(insertIdx);
    const newContent = [...before, '', ...tocLines, ...after].join('\n');

    writeFileSync(fullPath, newContent, 'utf-8');
    fixed.push({ dimension: 'D07', file: relPath, action: `Inserted TOC (${headings.length} headings)` });
  }

  return { fixed, skipped };
}
