/**
 * Update Refs Operation Adapter
 * Finds and replaces SD key references across codebase files.
 *
 * SD: SD-LEO-SIMPLIFY-ENFORCEMENT-AND-ORCH-001-C (FR-001)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SCAN_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.json', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'build', '.next']);

export default {
  key: 'update-refs',
  description: 'Find and update SD key references across codebase',
  supportsDryRun: true,
  requiresServiceRole: false,
  flags: [
    { name: 'from', description: 'SD key to find (required)', values: [] },
    { name: 'to', description: 'SD key to replace with (required)', values: [] },
    { name: 'path', description: 'Root path to scan (default: cwd)', values: [] }
  ],
  async execute(_supabase, { dryRun, flags = {} }) {
    const fromKey = flags.from;
    const toKey = flags.to;
    const rootPath = flags.path || process.cwd();

    if (!fromKey || !toKey) {
      return {
        total: 0, processed: 0, skipped: 0, failed: 0,
        details: [{ error: 'Missing required flags: --from <SD-KEY> --to <SD-KEY>' }]
      };
    }

    if (fromKey === toKey) {
      return {
        total: 0, processed: 0, skipped: 0, failed: 0,
        details: [{ error: '--from and --to must be different' }]
      };
    }

    const result = { total: 0, processed: 0, skipped: 0, failed: 0, details: [] };
    const matches = [];

    // Scan for files containing the fromKey
    scanDirectory(rootPath, fromKey, matches);

    result.total = matches.length;

    if (result.total === 0) {
      result.details.push({ status: 'no_references_found', from: fromKey });
      return result;
    }

    for (const match of matches) {
      if (dryRun) {
        result.processed++;
        result.details.push({
          file: match.file,
          occurrences: match.count,
          status: 'would_replace',
          from: fromKey,
          to: toKey,
          preview: match.lines.slice(0, 3).map(l => l.trim()).join(' | ')
        });
      } else {
        try {
          const content = readFileSync(match.file, 'utf8');
          const updated = content.replaceAll(fromKey, toKey);
          writeFileSync(match.file, updated, 'utf8');

          // Read-back verification
          const verify = readFileSync(match.file, 'utf8');
          if (verify.includes(fromKey)) {
            result.failed++;
            result.details.push({
              file: match.file, status: 'failed',
              error: 'Read-back verification failed: old reference still present'
            });
          } else {
            result.processed++;
            result.details.push({
              file: match.file, occurrences: match.count,
              status: 'replaced', from: fromKey, to: toKey
            });
          }
        } catch (err) {
          result.failed++;
          result.details.push({
            file: match.file, status: 'failed', error: err.message
          });
        }
      }
    }

    return result;
  }
};

function scanDirectory(dir, searchKey, matches) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      scanDirectory(fullPath, searchKey, matches);
    } else if (stat.isFile() && SCAN_EXTENSIONS.has(extname(entry))) {
      try {
        const content = readFileSync(fullPath, 'utf8');
        if (content.includes(searchKey)) {
          const lines = content.split('\n').filter(l => l.includes(searchKey));
          const count = (content.match(new RegExp(escapeRegex(searchKey), 'g')) || []).length;
          matches.push({ file: fullPath, count, lines });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
