#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import process from 'node:process';
import { parseMemoryFrontmatter } from './frontmatter.js';
import { clusterByPrefix, buildTopicFilename, buildTopicContent } from './clustering.mjs';
import { atomicWriteFileSync, withMemoryIndexLock } from '../../../lib/memory/atomic-write.mjs';
import { isMainModule } from '../../../lib/utils/is-main-module.js';

const INDEX_FILENAME = 'MEMORY.md';
const TOPIC_PREFIX = 'topic_';
const MAX_LINE_CHARS = 120;
const TARGET_BYTES = 15 * 1024;
const EXPIRED_PREFIX = '(!) ';

export function resolveMemoryDir(arg, opts = {}) {
  if (arg) return arg;
  const env = opts.env || process.env;
  // Explicit override wins — robust against any path-encoding edge case (SD-FDBK-INFRA-MEMORY-REINDEX-SCRIPTS-001).
  if (env.CLAUDE_MEMORY_DIR) return env.CLAUDE_MEMORY_DIR;
  const home = opts.home || env.HOME || env.USERPROFILE || '';
  const cwd = opts.cwd || process.cwd();
  // Claude Code encodes a project dir into its ~/.claude/projects/<slug> name by replacing EVERY
  // non-alphanumeric character (the drive colon, path separators, AND underscores) with a single '-',
  // preserving case and NOT collapsing consecutive hyphens. The prior code only replaced [\\/:], so an
  // underscore segment like \_EHG\EHG_Engineer encoded to '-_EHG-EHG_Engineer' instead of the real
  // '--EHG-EHG-Engineer' — the resolved dir never existed and reindex failed with missing_dir on this
  // machine, forcing a fall back to hand-editing MEMORY.md. Verified live: the real dir for
  // C:\Users\rickf\Projects\_EHG\EHG_Engineer is 'C--Users-rickf-Projects--EHG-EHG-Engineer'.
  const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  return join(home, '.claude', 'projects', encoded, 'memory');
}

function buildIndexLine(filename, parsed) {
  const title = parsed.name || basename(filename, '.md');
  const desc = parsed.description || '';
  const prefix = parsed.is_expired ? EXPIRED_PREFIX : '';
  let line = `${prefix}- [${title}](${filename})${desc ? ` — ${desc}` : ''}`;
  if (line.length > MAX_LINE_CHARS) {
    const overflow = line.length - MAX_LINE_CHARS + 1;
    const truncatedDesc = desc.slice(0, Math.max(0, desc.length - overflow)) + '…';
    line = `${prefix}- [${title}](${filename})${truncatedDesc ? ` — ${truncatedDesc}` : ''}`;
  }
  return line;
}

function buildTopicLine(prefix, filename, members) {
  const sample = members.slice(0, 2).map(m => m.parsed.name || basename(m.filename, '.md')).join(', ');
  const more = members.length > 2 ? `, +${members.length - 2} more` : '';
  let line = `- [Topic: ${prefix}](${filename}) — ${members.length} memories: ${sample}${more}`;
  if (line.length > MAX_LINE_CHARS) {
    line = `- [Topic: ${prefix}](${filename}) — ${members.length} memories`;
  }
  return line;
}

export function reindex({ memoryDir, dryRun = false, stderr = process.stderr } = {}) {
  const dir = resolveMemoryDir(memoryDir);
  if (!existsSync(dir)) {
    stderr.write(`[memory/reindex] ERROR: memory directory not found: ${dir}\n`);
    return { ok: false, reason: 'missing_dir', dir };
  }

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .filter(f => f !== INDEX_FILENAME)
    .filter(f => !f.startsWith(TOPIC_PREFIX))
    .sort();

  const entries = [];
  let parseFailures = 0;
  for (const filename of files) {
    try {
      entries.push({ filename, parsed: parseMemoryFrontmatter(join(dir, filename)) });
    } catch (err) {
      // A read/parse THROW (file vanished mid-loop, EISDIR, permission) means we
      // cannot trust this snapshot's completeness — track it for the lost-update
      // guard so a transient error can't silently shrink the index.
      parseFailures++;
      stderr.write(`[memory/reindex] WARN: skipping ${filename}: ${err.message}\n`);
    }
  }

  const { topics, standalone } = clusterByPrefix(entries);

  const indexLines = [];
  for (const t of topics) {
    indexLines.push(buildTopicLine(t.prefix, buildTopicFilename(t.prefix), t.members));
  }
  for (const s of standalone) {
    indexLines.push(buildIndexLine(s.filename, s.parsed));
  }

  const indexOutput = indexLines.join('\n') + '\n';
  const indexBytes = Buffer.byteLength(indexOutput, 'utf8');
  const overBudget = indexBytes > TARGET_BYTES;

  if (dryRun) {
    process.stdout.write(`# Preview: MEMORY.md (${indexBytes} bytes, ${indexLines.length} lines)\n`);
    process.stdout.write(`# Topic files to create: ${topics.length}\n`);
    process.stdout.write(`# Budget: ${TARGET_BYTES} bytes; over budget: ${overBudget}\n\n`);
    process.stdout.write(indexOutput);
    return { ok: !overBudget, dryRun: true, indexBytes, lineCount: indexLines.length, topicCount: topics.length, overBudget };
  }

  // FR-3 lost-update guard: never replace a populated index with a degenerate
  // (zero-line) one produced by a transient readdir/parse error. If we computed
  // zero entries but pointer files exist on disk OR a non-empty index already
  // exists, refuse the write and fail safe — a real wipe only happens when the
  // memory dir is genuinely empty (no eligible pointer files).
  if (indexLines.length === 0 && files.length > 0) {
    stderr.write(`[memory/reindex] GUARD: refusing to overwrite the index with 0 entries while ${files.length} pointer file(s) exist (lost-update guard)\n`);
    return { ok: false, reason: 'lost_update_guard', dryRun: false, lineCount: 0, fileCount: files.length };
  }
  if (indexLines.length === 0 && indexFileNonEmpty(join(dir, INDEX_FILENAME))) {
    stderr.write(`[memory/reindex] GUARD: refusing to overwrite a populated MEMORY.md with an empty index (lost-update guard)\n`);
    return { ok: false, reason: 'lost_update_guard', dryRun: false, lineCount: 0, fileCount: files.length };
  }
  // FR-3 (partial): if SOME pointer files failed to read this run AND the result
  // would SHRINK an existing index, the snapshot is untrustworthy — refuse and
  // self-heal on the next clean run. A shrink with NO read errors is a legitimate
  // removal and is allowed through.
  if (parseFailures > 0) {
    const existingCount = indexFileLineCount(join(dir, INDEX_FILENAME));
    if (existingCount > indexLines.length) {
      stderr.write(`[memory/reindex] GUARD: ${parseFailures} pointer file(s) failed to read and the index would shrink ${existingCount}->${indexLines.length}; refusing to drop lines (partial lost-update guard)\n`);
      return { ok: false, reason: 'partial_lost_update_guard', dryRun: false, lineCount: indexLines.length, existingCount, parseFailures };
    }
  }

  // FR-1/FR-2: serialize concurrent regenerators with an atomic lock, and write
  // every file atomically (temp + rename) so a concurrent reader/writer never
  // observes a torn or partially-written index. Lock fails open after its retry
  // budget; the atomic writes still guarantee tear-free output.
  const { acquired } = withMemoryIndexLock(dir, () => {
    for (const t of topics) {
      const path = join(dir, buildTopicFilename(t.prefix));
      atomicWriteFileSync(path, buildTopicContent(t.prefix, t.members), { encoding: 'utf8' });
    }
    atomicWriteFileSync(join(dir, INDEX_FILENAME), indexOutput, { encoding: 'utf8' });
  });

  return { ok: !overBudget, dryRun: false, indexBytes, lineCount: indexLines.length, topicCount: topics.length, overBudget, lockAcquired: acquired };
}

/** @returns {boolean} true if the index file exists and has non-whitespace content. */
function indexFileNonEmpty(indexPath) {
  try {
    if (!existsSync(indexPath)) return false;
    if (statSync(indexPath).size === 0) return false;
    return readFileSync(indexPath, 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

/** @returns {number} count of non-empty lines in the existing index (0 if absent/unreadable). */
function indexFileLineCount(indexPath) {
  try {
    if (!existsSync(indexPath)) return 0;
    return readFileSync(indexPath, 'utf8').split('\n').filter(l => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--preview') || args.includes('--dry-run');
  const dirArg = args.find(a => !a.startsWith('--'));
  const result = reindex({ memoryDir: dirArg, dryRun });
  if (!result.ok) {
    process.stderr.write(`[memory/reindex] FAIL: ${JSON.stringify(result)}\n`);
    process.exit(1);
  }
  if (!dryRun) {
    process.stdout.write(`[memory/reindex] OK: ${result.lineCount} lines, ${result.indexBytes} bytes, ${result.topicCount} topic files\n`);
  }
}
