import { readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseMemoryFrontmatter } from './frontmatter.js';

const INDEX_FILENAME = 'MEMORY.md';
const EXPIRED_PREFIX = '(!) ';

function buildIndexLine(parsed, filename) {
  const title = parsed.name || basename(filename, '.md');
  const desc = parsed.description || '';
  const link = `- [${title}](${filename})`;
  const descPart = desc ? ` — ${desc}` : '';
  const prefix = parsed.is_expired ? EXPIRED_PREFIX : '';
  return `${prefix}${link}${descPart}`;
}

export function generateMemoryIndex({ memoryDir, indexPath, now = new Date(), stderr = process.stderr }) {
  let entries;
  try {
    entries = readdirSync(memoryDir)
      .filter(f => f.endsWith('.md'))
      .filter(f => f !== INDEX_FILENAME)
      .sort();
  } catch (err) {
    stderr.write(`[memory/index-generator] ERROR: cannot read ${memoryDir}: ${err.message}\n`);
    return { entryCount: 0, skippedCount: 0 };
  }

  const lines = [];
  let skipped = 0;

  for (const filename of entries) {
    try {
      const parsed = parseMemoryFrontmatter(join(memoryDir, filename), { now });
      lines.push(buildIndexLine(parsed, filename));
    } catch (err) {
      stderr.write(`[memory/index-generator] WARN: skipping ${filename}: ${err.message}\n`);
      skipped++;
    }
  }

  if (lines.length === 0) {
    stderr.write(`[memory/index-generator] ERROR: zero entries produced in ${memoryDir}\n`);
    return { entryCount: 0, skippedCount: skipped };
  }

  const output = lines.join('\n') + '\n';
  writeFileSync(indexPath, output, 'utf8');
  return { entryCount: lines.length, skippedCount: skipped };
}
