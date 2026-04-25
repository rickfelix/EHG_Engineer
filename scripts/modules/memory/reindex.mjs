#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import process from 'node:process';
import { parseMemoryFrontmatter } from './frontmatter.js';
import { clusterByPrefix, buildTopicFilename, buildTopicContent } from './clustering.mjs';

const INDEX_FILENAME = 'MEMORY.md';
const TOPIC_PREFIX = 'topic_';
const MAX_LINE_CHARS = 120;
const TARGET_BYTES = 15 * 1024;
const EXPIRED_PREFIX = '(!) ';

function resolveMemoryDir(arg) {
  if (arg) return arg;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const cwd = process.cwd();
  const encoded = cwd.replace(/[\\/:]/g, '-').replace(/^-+/, '');
  return join(home, '.claude', 'projects', `C--${encoded.replace(/^C--/, '')}`, 'memory');
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
  for (const filename of files) {
    try {
      entries.push({ filename, parsed: parseMemoryFrontmatter(join(dir, filename)) });
    } catch (err) {
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

  for (const t of topics) {
    const path = join(dir, buildTopicFilename(t.prefix));
    writeFileSync(path, buildTopicContent(t.prefix, t.members), 'utf8');
  }
  writeFileSync(join(dir, INDEX_FILENAME), indexOutput, 'utf8');

  return { ok: !overBudget, dryRun: false, indexBytes, lineCount: indexLines.length, topicCount: topics.length, overBudget };
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
               import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/'));
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
