/**
 * Unit tests for SD-LEO-INFRA-SURFACE-HARNESS-BACKLOG-001 (FR-1, FR-5)
 * + QF-20260509-818 (DB-canonical reader, 14th-witness writer/consumer asymmetry).
 *
 * Covers:
 *   - parseHarnessBacklog (pure markdown parser)
 *   - _loadHarnessBacklogFromMarkdown (legacy fallback path, cache + fileMissing)
 *   - loadHarnessBacklog (DB-canonical default + LEGACY_HARNESS_BACKLOG_FALLBACK gate)
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
  _loadHarnessBacklogFromMarkdown,
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

describe('_loadHarnessBacklogFromMarkdown — FR-2 (legacy fallback: cache + fileMissing)', () => {
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
    const result = await _loadHarnessBacklogFromMarkdown(missing);
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
    const a = await _loadHarnessBacklogFromMarkdown(tmpPath);
    const b = await _loadHarnessBacklogFromMarkdown(tmpPath);
    expect(b).toBe(a);
    expect(a.count).toBeGreaterThan(0);
    expect(a.fileMissing).toBe(false);
  });

  it('mtime change invalidates cache', async () => {
    await fs.writeFile(tmpPath, GOLDEN_FIXTURE);
    const first = await _loadHarnessBacklogFromMarkdown(tmpPath);
    expect(first.count).toBe(3);

    // Force mtime advance (some filesystems have second-resolution mtime).
    await new Promise((r) => setTimeout(r, 1100));
    await fs.writeFile(tmpPath, EMPTY_FIXTURE);
    const second = await _loadHarnessBacklogFromMarkdown(tmpPath);
    expect(second).not.toBe(first);
    expect(second.count).toBe(0);
  });
});

/**
 * QF-20260509-818 — DB-canonical reader (default path).
 *
 * Asserts the new behavior: when supabase is supplied AND
 * LEGACY_HARNESS_BACKLOG_FALLBACK is unset, loadHarnessBacklog queries the
 * `feedback` table for `category='harness_backlog' AND status='new'`.
 *
 * Closes 14th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 by pinning
 * the new contract to a regression-resistant assertion shape.
 */
describe('loadHarnessBacklog — QF-20260509-818 (DB-canonical default)', () => {
  let savedFallback;
  beforeEach(() => {
    savedFallback = process.env.LEGACY_HARNESS_BACKLOG_FALLBACK;
    delete process.env.LEGACY_HARNESS_BACKLOG_FALLBACK;
  });
  afterEach(() => {
    if (savedFallback === undefined) delete process.env.LEGACY_HARNESS_BACKLOG_FALLBACK;
    else process.env.LEGACY_HARNESS_BACKLOG_FALLBACK = savedFallback;
  });

  function makeSupabaseStub(rows, error = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: rows, error }),
      }),
    };
  }

  it('queries feedback table and maps rows into items shape', async () => {
    const rows = [
      { id: 'a', title: 'oldest item', created_at: '2026-04-01T10:00:00Z', metadata: { source_location: 'scripts/a.js' } },
      { id: 'b', title: 'middle item', created_at: '2026-04-15T10:00:00Z', metadata: null },
      { id: 'c', title: 'newest item', created_at: '2026-05-09T10:00:00Z', metadata: { source_location: 'lib/c.js' } },
    ];
    const supabase = makeSupabaseStub(rows);
    const result = await loadHarnessBacklog(supabase);

    expect(supabase.from).toHaveBeenCalledWith('feedback');
    expect(result.count).toBe(3);
    expect(result.fileMissing).toBe(false);
    expect(result.error).toBe(null);
    expect(result.items[0]).toMatchObject({ date: '2026-04-01', symptom: 'oldest item', source: 'scripts/a.js' });
    expect(result.items[1]).toMatchObject({ date: '2026-04-15', symptom: 'middle item', source: null });
    expect(result.items[2]).toMatchObject({ date: '2026-05-09', symptom: 'newest item', source: 'lib/c.js' });
    expect(result.oldestAgeDays).toBeGreaterThanOrEqual(result.items[1].ageDays);
  });

  it('empty DB returns count=0 / oldestAgeDays=0 / items=[] / fileMissing=false', async () => {
    const supabase = makeSupabaseStub([]);
    const result = await loadHarnessBacklog(supabase);
    expect(result).toEqual({ count: 0, oldestAgeDays: 0, items: [], fileMissing: false, error: null });
  });

  it('DB error returns error string and empty items (does not throw)', async () => {
    const supabase = makeSupabaseStub(null, { message: 'pg_error: relation feedback does not exist', code: '42P01' });
    const result = await loadHarnessBacklog(supabase);
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.fileMissing).toBe(false);
    expect(result.error).toMatch(/relation feedback/);
  });

  it('LEGACY_HARNESS_BACKLOG_FALLBACK=1 routes to markdown path even when supabase is provided', async () => {
    process.env.LEGACY_HARNESS_BACKLOG_FALLBACK = '1';
    const supabase = makeSupabaseStub([{ id: 'x', title: 'should-not-be-read', created_at: '2026-05-09T10:00:00Z' }]);
    // Point markdown loader at a missing file so we can detect it ran without colliding with the cache.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-fallback-test-'));
    try {
      const result = await loadHarnessBacklog(supabase, { filePath: path.join(tmpDir, 'absent.md') });
      expect(supabase.from).not.toHaveBeenCalled();
      expect(result.fileMissing).toBe(true);
      expect(result.count).toBe(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('null/undefined supabase falls through to markdown path (graceful degradation)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-nullsb-test-'));
    try {
      const result = await loadHarnessBacklog(null, { filePath: path.join(tmpDir, 'absent.md') });
      expect(result.fileMissing).toBe(true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
