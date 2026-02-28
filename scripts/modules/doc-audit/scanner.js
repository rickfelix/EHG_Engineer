/**
 * Doc-Audit Scanner — Filesystem scanner for documentation files
 *
 * Recursively scans docs/, root-level .md files, and lib/[module]/README.md.
 * Parses YAML front-matter, extracts internal links, measures line counts.
 *
 * Used by:
 *   scripts/modules/doc-audit/scorer.js   (input for dimension scoring)
 *   scripts/eva/doc-health-audit.mjs      (entry point)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname, basename, dirname } from 'path';
import { execSync } from 'child_process';

// Directories to skip entirely
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'supabase', '.worktrees',
  'dist', 'build', 'coverage', '.next', '.cache',
]);

// Directories where .md files are prohibited (except README.md)
export const PROHIBITED_DIRS = ['src', 'lib', 'scripts', 'tests', 'public'];

// Allowed non-kebab filenames
const NAMING_EXCEPTIONS = new Set([
  'README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md',
]);
const NAMING_EXCEPTION_PREFIXES = ['CLAUDE', 'API_REFERENCE'];

/**
 * Scan the repository for documentation files.
 * @param {string} rootDir - Repository root directory
 * @returns {{ files: FileInfo[], directories: DirInfo[] }}
 */
export function scanDocs(rootDir) {
  const files = [];
  const directories = new Map(); // relPath → DirInfo

  // 1. Scan docs/ directory recursively
  const docsDir = join(rootDir, 'docs');
  if (existsSync(docsDir)) {
    scanDirectory(docsDir, rootDir, files, directories);
  }

  // 2. Root-level .md files
  scanRootLevel(rootDir, files, directories);

  // 3. lib/*/README.md files
  scanLibReadmes(rootDir, files, directories);

  // 4. Get git last-modified dates in bulk
  enrichWithGitDates(rootDir, files);

  return {
    files,
    directories: Array.from(directories.values()),
  };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function scanDirectory(dir, rootDir, files, directories) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const relDir = relative(rootDir, dir);
  if (!directories.has(relDir)) {
    directories.set(relDir, {
      relPath: relDir,
      hasReadme: false,
      fileCount: 0,
    });
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.claude/tmp-')) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath, rootDir, files, directories);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      const info = parseFile(fullPath, rootDir);
      files.push(info);

      const dirInfo = directories.get(relDir);
      if (dirInfo) {
        dirInfo.fileCount++;
        if (entry.name === 'README.md') dirInfo.hasReadme = true;
      }
    }
  }
}

function scanRootLevel(rootDir, files, directories) {
  let entries;
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  if (!directories.has('.')) {
    directories.set('.', { relPath: '.', hasReadme: false, fileCount: 0 });
  }

  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name) !== '.md') continue;
    const fullPath = join(rootDir, entry.name);
    const info = parseFile(fullPath, rootDir);
    files.push(info);

    const dirInfo = directories.get('.');
    dirInfo.fileCount++;
    if (entry.name === 'README.md') dirInfo.hasReadme = true;
  }
}

function scanLibReadmes(rootDir, files, directories) {
  const libDir = join(rootDir, 'lib');
  if (!existsSync(libDir)) return;

  let entries;
  try {
    entries = readdirSync(libDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const readmePath = join(libDir, entry.name, 'README.md');
    if (existsSync(readmePath)) {
      files.push(parseFile(readmePath, rootDir));
    }
  }
}

/**
 * Parse a single markdown file for metadata, links, and structure.
 */
function parseFile(fullPath, rootDir) {
  const relPath = relative(rootDir, fullPath);
  const name = basename(fullPath);
  const dir = relative(rootDir, dirname(fullPath));
  let content;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch {
    return {
      relPath, name, dir, lineCount: 0, hasMetadata: false,
      metadata: {}, links: [], hasTitle: false, hasToc: false,
      isProhibitedLocation: false, isNamingCompliant: true,
    };
  }

  const lines = content.split('\n');
  const lineCount = lines.length;

  // Parse YAML front-matter
  const { hasMetadata, metadata } = parseFrontMatter(content);

  // Extract internal markdown links
  const links = extractLinks(content, relPath);

  // Check for title (first # heading)
  const hasTitle = lines.some(l => /^#\s+\S/.test(l));

  // Check for TOC (look for markdown links to anchors)
  const hasToc = lines.some(l => /^\s*[-*]\s+\[.*\]\(#/.test(l));

  // Check prohibited location
  const topDir = relPath.split(/[/\\]/)[0];
  const isProhibitedLocation = PROHIBITED_DIRS.includes(topDir) && name !== 'README.md';

  // Check naming convention
  const isNamingCompliant = checkNamingConvention(name);

  return {
    relPath, name, dir, lineCount, hasMetadata, metadata,
    links, hasTitle, hasToc, isProhibitedLocation, isNamingCompliant,
    gitLastModified: null, // filled by enrichWithGitDates
  };
}

function parseFrontMatter(content) {
  const REQUIRED_FIELDS = ['category', 'status', 'version', 'author', 'last_updated', 'tags'];
  const metadata = {};
  let hasMetadata = false;

  // Check for YAML front-matter (---\n...\n---)
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (match) {
    hasMetadata = true;
    const yamlContent = match[1];
    for (const line of yamlContent.split('\n')) {
      const kv = line.match(/^(\w[\w_-]*)\s*:\s*(.+)/);
      if (kv) {
        metadata[kv[1].toLowerCase().replace(/-/g, '_')] = kv[2].trim();
      }
    }
  }

  // Count how many required fields are present
  const presentFields = REQUIRED_FIELDS.filter(f => metadata[f]);
  metadata._requiredPresent = presentFields.length;
  metadata._requiredTotal = REQUIRED_FIELDS.length;
  metadata._requiredFields = REQUIRED_FIELDS;

  return { hasMetadata, metadata };
}

function extractLinks(content, sourceRelPath) {
  const links = [];
  // Match [text](path) but not [text](http...) or [text](#anchor)
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const target = match[2];
    if (target.startsWith('http://') || target.startsWith('https://')) continue;
    if (target.startsWith('#')) continue; // anchor-only
    links.push({
      text: match[1],
      target: target.split('#')[0], // strip anchor
      source: sourceRelPath,
    });
  }
  return links;
}

function checkNamingConvention(filename) {
  // Allowed exceptions
  if (NAMING_EXCEPTIONS.has(filename)) return true;
  if (NAMING_EXCEPTION_PREFIXES.some(p => filename.startsWith(p))) return true;

  // Must be kebab-case: lowercase letters, digits, hyphens, underscores (lenient)
  const nameWithoutExt = filename.replace(/\.md$/, '');
  // Allow: kebab-case with optional underscores (some legacy)
  return /^[a-z0-9][a-z0-9_-]*$/.test(nameWithoutExt);
}

/**
 * Bulk-fetch git last-modified dates for all files using a single git command.
 */
function enrichWithGitDates(rootDir, files) {
  // Build list of paths, then use git log with --name-only to get dates in bulk
  const paths = files.map(f => f.relPath.replace(/\\/g, '/'));
  if (paths.length === 0) return;

  try {
    // Single git command: get author date + filename for all tracked files
    const result = execSync(
      'git log --all --format="GIT_DATE:%aI" --name-only --diff-filter=ACMR -- ' +
        paths.map(p => `"${p}"`).join(' '),
      { cwd: rootDir, encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );

    // Parse: find most recent date for each file
    const dateMap = new Map();
    let currentDate = null;
    for (const line of result.split('\n')) {
      if (line.startsWith('GIT_DATE:')) {
        currentDate = line.slice(9).trim();
      } else if (line.trim() && currentDate) {
        const normalized = line.trim().replace(/\\/g, '/');
        // Only keep the most recent date (first occurrence)
        if (!dateMap.has(normalized)) {
          dateMap.set(normalized, currentDate);
        }
      }
    }

    for (const file of files) {
      const normalizedPath = file.relPath.replace(/\\/g, '/');
      const dateStr = dateMap.get(normalizedPath);
      if (dateStr) {
        file.gitLastModified = new Date(dateStr);
      }
    }
  } catch {
    // git dates unavailable - leave all null
  }
}
