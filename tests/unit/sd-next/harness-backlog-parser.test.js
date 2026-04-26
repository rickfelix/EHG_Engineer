/**
 * Unit tests for SD-LEO-INFRA-SURFACE-HARNESS-BACKLOG-001 (FR-1, FR-5).
 * Covers parseHarnessBacklog + loadHarnessBacklog cache behavior.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  parseHarnessBacklog,
} from '../../../scripts/modules/sd-next/harness-backlog-parser.js';
import {
  loadHarnessBacklog,
  _clearHarnessBacklogCache,
} from '../../../scripts/modules/sd-next/data-loaders.js';

// Pin "now" so ageDays calculations are deterministic.
const NOW_MS = Date.parse('2026-04-30T12:00:00Z');

const GOLDEN_FIXTURE = `# Harness Backlog

Some intro paragraph that should be ignored.

\`\`\`
2026-04-01 | should-be-ignored-inside-fence | scripts/foo.js | deferred from SD-EXAMPLE
\`\`\`

## Items

<!-- comment block ignored -->
2026-04-30 | Latest issue surfaced today | scripts/sd-next.js:200 | deferred from SD-X-001
2026-04-23 | Week-old issue | lib/foo.js | deferred from SD-Y-002
2026-04-01 | Month-old recurrence flag | scripts/handoff.js | deferred from SD-Z-003
`;

const EMPTY_FIXTURE = `# Harness Backlog

## Items

<!-- Append below. -->
`;

const MALFORMED_FIXTURE = `# Harness Backlog

## Items

2026-04-26 | only one symptom field, no source pipe
2026-04-25 | well-formed | path/to/file.js | deferred from SD-OK-001
`;

describe('parseHarnessBacklog — FR-1', () => {
  it('parses 3 well-formed entries with correct shape and ageDays', () => {
    const result = parseHarnessBacklog(GOLDEN_FIXTURE, { nowMs: NOW_MS });
    expect(result.count).toBe(3);
    expect(result.oldestAgeDays).toBe(29); // 2026-04-30 - 2026-04-01
    expect(result.items).toEqual([
      {
        date: '2026-04-30',
        symptom: 'Latest issue surfaced today',
        source: 'scripts/sd-next.js:200',
        ageDays: 0,
      },
      {
        date: '2026-04-23',
        symptom: 'Week-old issue',
        source: 'lib/foo.js',
        ageDays: 7,
      },
      {
        date: '2026-04-01',
        symptom: 'Month-old recurrence flag',
        source: 'scripts/handoff.js',
        ageDays: 29,
      },
    ]);
  });

  it('skips lines inside fenced code blocks', () => {
    const result = parseHarnessBacklog(GOLDEN_FIXTURE, { nowMs: NOW_MS });
    const symptoms = result.items.map((i) => i.symptom);
    expect(symptoms).not.toContain('should-be-ignored-inside-fence');
  });

  it('returns count=0/oldestAgeDays=0/items=[] for empty content', () => {
    const result = parseHarnessBacklog(EMPTY_FIXTURE, { nowMs: NOW_MS });
    expect(result).toEqual({ count: 0, oldestAgeDays: 0, items: [] });
  });

  it('returns empty result for null/undefined/non-string input', () => {
    expect(parseHarnessBacklog(null).count).toBe(0);
    expect(parseHarnessBacklog(undefined).count).toBe(0);
    expect(parseHarnessBacklog(42).count).toBe(0);
  });

  it('lenient parse: malformed line still captured with source=null', () => {
    const result = parseHarnessBacklog(MALFORMED_FIXTURE, { nowMs: NOW_MS });
    expect(result.count).toBe(2);
    expect(result.items[0]).toMatchObject({
      date: '2026-04-26',
      symptom: 'only one symptom field, no source pipe',
      source: null,
    });
    expect(result.items[1].source).toBe('path/to/file.js');
  });
});

describe('loadHarnessBacklog — FR-2 (cache + fileMissing)', () => {
  let tmpDir;
  let tmpPath;

  beforeEach(async () => {
    _clearHarnessBacklogCache();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-backlog-test-'));
    tmpPath = path.join(tmpDir, 'harness-backlog.md');
  });
  afterEach(async () => {
    _clearHarnessBacklogCache();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('fileMissing branch returns shape with fileMissing=true', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.md');
    const result = await loadHarnessBacklog(missing);
    expect(result).toEqual({
      count: 0,
      oldestAgeDays: 0,
      items: [],
      fileMissing: true,
      error: null,
    });
  });

  it('cache hit returns same object reference on repeated call', async () => {
    await fs.writeFile(tmpPath, GOLDEN_FIXTURE);
    const a = await loadHarnessBacklog(tmpPath);
    const b = await loadHarnessBacklog(tmpPath);
    expect(b).toBe(a);
    expect(a.count).toBeGreaterThan(0);
    expect(a.fileMissing).toBe(false);
  });

  it('mtime change invalidates cache', async () => {
    await fs.writeFile(tmpPath, GOLDEN_FIXTURE);
    const first = await loadHarnessBacklog(tmpPath);
    expect(first.count).toBe(3);

    // Force mtime advance (some filesystems have second-resolution mtime).
    await new Promise((r) => setTimeout(r, 1100));
    await fs.writeFile(tmpPath, EMPTY_FIXTURE);
    const second = await loadHarnessBacklog(tmpPath);
    expect(second).not.toBe(first);
    expect(second.count).toBe(0);
  });
});
