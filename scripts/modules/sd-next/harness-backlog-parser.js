/**
 * Harness Backlog Parser — SD-LEO-INFRA-SURFACE-HARNESS-BACKLOG-001
 *
 * Pure function: parses docs/harness-backlog.md content into a structured
 * shape consumed by the sd:next HARNESS BACKLOG section renderer.
 *
 * Format expected (one item per line):
 *   YYYY-MM-DD | <symptom> | <file or command> | deferred from SD-...
 *
 * Lenient: any line starting with YYYY-MM-DD is captured as an item even
 * if pipe-split returns fewer than 4 fields. Unrecognised lines are skipped
 * (header text, code blocks, comments).
 */

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})\b/;

/**
 * @typedef {Object} HarnessBacklogItem
 * @property {string} date         YYYY-MM-DD as captured
 * @property {string} symptom      Human-readable description
 * @property {string|null} source  File or command where it surfaced (null if missing)
 * @property {number} ageDays      Days from item date to nowMs (rounded down)
 */

/**
 * @typedef {Object} HarnessBacklogParseResult
 * @property {number} count                Number of valid items
 * @property {number} oldestAgeDays        Max ageDays across items (0 when count===0)
 * @property {HarnessBacklogItem[]} items  Items in original file order
 */

/**
 * Parse a harness-backlog.md markdown body.
 *
 * @param {string} content  Raw file contents
 * @param {Object} [opts]
 * @param {number} [opts.nowMs=Date.now()]  Override "now" for testing
 * @returns {HarnessBacklogParseResult}
 */
export function parseHarnessBacklog(content, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  if (!content || typeof content !== 'string') {
    return { count: 0, oldestAgeDays: 0, items: [] };
  }

  const lines = content.split(/\r?\n/);
  const items = [];
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (!line) continue;
    if (line.startsWith('<!--') || line.startsWith('-->')) continue;
    if (line.startsWith('#')) continue;

    const dateMatch = line.match(DATE_PREFIX_RE);
    if (!dateMatch) continue;

    const date = dateMatch[1];
    const remainder = line.slice(date.length).replace(/^\s*\|?\s*/, '');
    const fields = remainder.split(' | ').map((f) => f.trim());
    const symptom = fields[0] || '';
    let source = null;
    if (fields.length >= 2) {
      source = fields[1] || null;
    }
    if (!symptom) {
      process.stderr.write(
        `[harness-backlog-parser] WARN: line starting with ${date} has no symptom field — captured with empty symptom\n`,
      );
    }

    const itemMs = Date.parse(`${date}T00:00:00Z`);
    const ageDays = Number.isFinite(itemMs)
      ? Math.max(0, Math.floor((nowMs - itemMs) / 86400000))
      : 0;

    items.push({ date, symptom, source, ageDays });
  }

  const oldestAgeDays = items.reduce((max, item) => Math.max(max, item.ageDays), 0);
  return { count: items.length, oldestAgeDays, items };
}
