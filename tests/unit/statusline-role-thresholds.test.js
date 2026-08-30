// Unit tests for role-aware context-compaction thresholds.
// SD-LEO-INFRA-COORDINATOR-CRON-LIFECYCLE-001
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const MOD_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.claude/compaction-thresholds.cjs');
const ct = require(MOD_PATH);

describe('compaction-thresholds: flag parser (isCompactionThresholdV2Enabled)', () => {
  it('is ON only for 1/true/on/yes (case-insensitive)', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'TRUE', 'On', ' yes ']) {
      expect(ct.isCompactionThresholdV2Enabled({ COORD_COMPACTION_THRESHOLD_V2: v })).toBe(true);
    }
  });
  it('is OFF for unset / empty / falsey / arbitrary values', () => {
    for (const v of [undefined, null, '', '0', 'false', 'off', 'no', 'maybe', 'enabled']) {
      expect(ct.isCompactionThresholdV2Enabled({ COORD_COMPACTION_THRESHOLD_V2: v })).toBe(false);
    }
    expect(ct.isCompactionThresholdV2Enabled({})).toBe(false);
  });
});

describe('compaction-thresholds: TS-1 flag OFF => global thresholds for ALL roles', () => {
  it('coordinator, worker, and solo all get GLOBAL when flag off', () => {
    for (const role of ['coordinator', 'worker', 'solo', 'unknown']) {
      expect(ct.selectThresholds(role, false)).toBe(ct.GLOBAL_THRESHOLDS);
    }
    expect(ct.GLOBAL_THRESHOLDS).toEqual({ warning: 80, critical: 93, emergency: 97 });
  });
});

describe('compaction-thresholds: TS-2 flag ON => coordinator nudged earlier than worker', () => {
  it('coordinator critical/emergency are strictly lower than worker', () => {
    const coord = ct.selectThresholds('coordinator', true);
    const worker = ct.selectThresholds('worker', true);
    expect(coord.critical).toBeLessThan(worker.critical);
    expect(coord.emergency).toBeLessThan(worker.emergency);
  });
  it('worker and solo still get GLOBAL when flag on', () => {
    expect(ct.selectThresholds('worker', true)).toBe(ct.GLOBAL_THRESHOLDS);
    expect(ct.selectThresholds('solo', true)).toBe(ct.GLOBAL_THRESHOLDS);
  });
  it('COORDINATOR_THRESHOLDS are the expected 85/92', () => {
    expect(ct.COORDINATOR_THRESHOLDS).toEqual({ warning: 80, critical: 85, emergency: 92 });
  });
});

describe('compaction-thresholds: TS-3 classifyStatus differentiates by role at a boundary', () => {
  it('at 88% a coordinator is CRITICAL but a worker is HEALTHY (flag on)', () => {
    const coord = ct.selectThresholds('coordinator', true);
    const worker = ct.selectThresholds('worker', true);
    expect(ct.classifyStatus(88, coord)).toBe('CRITICAL');
    expect(ct.classifyStatus(88, worker)).toBe('HEALTHY');
  });
  it('classifyStatus boundaries: >= emergency => EMERGENCY, >= critical => CRITICAL, else HEALTHY', () => {
    expect(ct.classifyStatus(97, ct.GLOBAL_THRESHOLDS)).toBe('EMERGENCY');
    expect(ct.classifyStatus(93, ct.GLOBAL_THRESHOLDS)).toBe('CRITICAL');
    expect(ct.classifyStatus(92, ct.GLOBAL_THRESHOLDS)).toBe('HEALTHY');
    expect(ct.classifyStatus(0, ct.GLOBAL_THRESHOLDS)).toBe('HEALTHY');
  });
});

describe('compaction-thresholds: TS-4 AUTOCOMPACT_PCT invariant', () => {
  it('AUTOCOMPACT_PCT is 80 (mirrors the real harness trigger, never role-aware)', () => {
    expect(ct.AUTOCOMPACT_PCT).toBe(80);
  });
});

describe('compaction-thresholds: TS-5 detectRoleFromFile fail-safe + role logic', () => {
  it('matching session_id => coordinator', () => {
    const reader = () => ({ session_id: 'sess-A' });
    expect(ct.detectRoleFromFile('sess-A', reader)).toBe('coordinator');
  });
  it('non-matching session_id => worker', () => {
    const reader = () => ({ session_id: 'sess-OTHER' });
    expect(ct.detectRoleFromFile('sess-A', reader)).toBe('worker');
  });
  it('no coordinator file (null) => solo', () => {
    expect(ct.detectRoleFromFile('sess-A', () => null)).toBe('solo');
  });
  it('file without session_id => solo', () => {
    expect(ct.detectRoleFromFile('sess-A', () => ({}))).toBe('solo');
  });
  it('reader throws => fail-safe to worker (never throws in render path)', () => {
    const reader = () => { throw new Error('boom'); };
    expect(() => ct.detectRoleFromFile('sess-A', reader)).not.toThrow();
    expect(ct.detectRoleFromFile('sess-A', reader)).toBe('worker');
  });
});

describe('compaction-thresholds: TS-6 no database in the render path', () => {
  it('module source imports no supabase client / DB factory', () => {
    const src = readFileSync(MOD_PATH, 'utf8');
    expect(src).not.toMatch(/@supabase\/supabase-js|createClient\s*\(/);
  });
  it('detectRoleFromFile with an injected reader performs no network/DB call (pure function call)', () => {
    let called = 0;
    const reader = () => { called += 1; return { session_id: 'x' }; };
    ct.detectRoleFromFile('x', reader);
    expect(called).toBe(1); // only the injected file reader is invoked
  });
});

// ── SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: adam role + burn-feed helpers ──
describe('compaction-thresholds: TS-7 adam role detection + earlier thresholds', () => {
  const coordNull = () => null;
  const adamMatch = () => ({ session_id: 'adam-1' });
  const adamNull = () => null;

  it('matching active-adam.json session_id => adam (no coordinator file)', () => {
    expect(ct.detectRoleFromFile('adam-1', coordNull, adamMatch)).toBe('adam');
  });
  it('coordinator match WINS over an adam match (double-tagged session)', () => {
    const coordMatch = () => ({ session_id: 'both-1' });
    const adamAlso = () => ({ session_id: 'both-1' });
    expect(ct.detectRoleFromFile('both-1', coordMatch, adamAlso)).toBe('coordinator');
  });
  it('non-matching adam marker preserves prior behavior exactly (worker/solo)', () => {
    const coordOther = () => ({ session_id: 'someone-else' });
    const adamOther = () => ({ session_id: 'not-me' });
    expect(ct.detectRoleFromFile('me', coordOther, adamOther)).toBe('worker');
    expect(ct.detectRoleFromFile('me', coordNull, adamOther)).toBe('solo');
  });
  it('adam reader throwing falls back safely (never crashes, prior semantics)', () => {
    const boom = () => { throw new Error('fs boom'); };
    expect(ct.detectRoleFromFile('me', coordNull, boom)).toBe('solo');
  });
  it('flag ON: adam gets the earlier (coordinator-grade) thresholds; flag OFF: global', () => {
    expect(ct.selectThresholds('adam', true)).toEqual(ct.COORDINATOR_THRESHOLDS);
    expect(ct.selectThresholds('adam', false)).toEqual(ct.GLOBAL_THRESHOLDS);
  });
});

describe('context-usage-feed: TS-8 burn-feed entry shape + throttle (SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001)', () => {
  const feed = require('../../.claude/context-usage-feed.cjs');
  const sample = { sessionId: 's1', modelId: 'claude-x', contextUsed: 1000, contextSize: 2000, usagePercent: 50, inputTokens: 400, outputTokens: 100, cacheCreationTokens: 300, cacheReadTokens: 200, status: 'HEALTHY', cwd: 'C:/x', now: new Date('2026-07-09T00:00:00Z') };
  const savedLoopName = process.env.CLAUDE_LOOP_NAME;
  beforeEach(() => { delete process.env.CLAUDE_LOOP_NAME; });
  afterEach(() => { if (savedLoopName === undefined) delete process.env.CLAUDE_LOOP_NAME; else process.env.CLAUDE_LOOP_NAME = savedLoopName; });

  it('buildUsageEntry matches the sync-context-usage transformEntry field shape', () => {
    const e = feed.buildUsageEntry(sample);
    expect(Object.keys(e).sort()).toEqual([
      'cache_creation_tokens', 'cache_read_tokens', 'compaction_detected', 'context_size', 'context_used',
      'input_tokens', 'model_id', 'output_tokens', 'session_id', 'status', 'timestamp', 'usage_percent', 'working_directory',
    ].sort());
    expect(e.session_id).toBe('s1');
    expect(e.usage_percent).toBe(50);
    expect(e.timestamp).toBe('2026-07-09T00:00:00.000Z');
  });
  it('throttles an unchanged percent+status repaint (no append)', () => {
    const e = feed.buildUsageEntry(sample);
    expect(feed.shouldAppendUsage({ last_percent: 50, last_status: 'HEALTHY' }, e)).toBe(false);
  });
  it('appends on first sample, percent change, or status change', () => {
    const e = feed.buildUsageEntry(sample);
    expect(feed.shouldAppendUsage(null, e)).toBe(true);
    expect(feed.shouldAppendUsage({ last_percent: 49, last_status: 'HEALTHY' }, e)).toBe(true);
    expect(feed.shouldAppendUsage({ last_percent: 50, last_status: 'CRITICAL' }, e)).toBe(true);
  });
  it('rejects a malformed next entry (no percent) — never appends garbage', () => {
    expect(feed.shouldAppendUsage(null, { status: 'HEALTHY' })).toBe(false);
  });

  // SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C FR-2 (TS-1, TS-2)
  describe('FR-2: loop_name capture', () => {
    it('TS-2: omits loop_name entirely when CLAUDE_LOOP_NAME is unset (not set to null)', () => {
      const e = feed.buildUsageEntry(sample);
      expect(Object.prototype.hasOwnProperty.call(e, 'loop_name')).toBe(false);
    });
    it('TS-1: includes loop_name when CLAUDE_LOOP_NAME is set', () => {
      process.env.CLAUDE_LOOP_NAME = 'worker-checkin';
      const e = feed.buildUsageEntry(sample);
      expect(e.loop_name).toBe('worker-checkin');
    });
  });
});

// SD-LEO-INFRA-BURN-TELEMETRY-PER-001-C FR-2a (TS-3, TS-6)
describe('sync-context-usage transformEntry (FR-2a: LONG-key fix + loop_name)', () => {
  const feed = require('../../.claude/context-usage-feed.cjs');
  let transformEntry;
  let MAX_ENTRIES_PER_SYNC;
  beforeAll(async () => {
    const mod = await import('../../scripts/sync-context-usage.js');
    transformEntry = mod.transformEntry;
    MAX_ENTRIES_PER_SYNC = mod.MAX_ENTRIES_PER_SYNC;
  });

  // TESTING finding F2 (evidence 0f1303ad): the module source must reference lastEntry.timestamp,
  // not lastEntry.ts, in the state-save call — a source-pin since exercising syncToDatabase()
  // itself requires a live DB.
  it('F2: source no longer reads the SHORT-key lastEntry.ts for sync-state persistence', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../../scripts/sync-context-usage.js'), 'utf8');
    expect(src).not.toMatch(/lastSyncedTimestamp:\s*lastEntry\.ts\b/);
    expect(src).toMatch(/lastSyncedTimestamp:\s*lastEntry\.timestamp/);
  });

  it('F3: exports a bounded MAX_ENTRIES_PER_SYNC constant', () => {
    expect(typeof MAX_ENTRIES_PER_SYNC).toBe('number');
    expect(MAX_ENTRIES_PER_SYNC).toBeGreaterThan(0);
  });

  // SECURITY finding (evidence 15c8c79e): the loop_name column ships as an unapplied migration
  // file; without this fallback every upsert fails PGRST204 until a human applies it.
  it('SECURITY: retries the upsert without loop_name on a PGRST204 error naming the column', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../../scripts/sync-context-usage.js'), 'utf8');
    expect(src).toMatch(/error\.code === 'PGRST204' && \/loop_name\/\.test/);
    expect(src).toMatch(/loop_name: _drop, \.\.\.rest/);
  });

  // TESTING finding F1 (evidence 0f1303ad): sync state must never advance past a batch that
  // failed to persist — source-pin since exercising the full syncToDatabase() batch loop
  // requires a live/mocked supabase client the module does not currently inject.
  it('F1: source stops advancing on the first batch error rather than skipping past it', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../../scripts/sync-context-usage.js'), 'utf8');
    expect(src).toMatch(/errors \+= batch\.length;\s*\n\s*break;/);
    expect(src).toMatch(/if \(!lastPersistedEntry\)/);
  });

  // SECURITY finding (evidence 15c8c79e): getNewEntries's LOG_FILE path is bound to
  // process.cwd() at MODULE IMPORT time (a top-level const), so a chdir-based fixture test
  // cannot retarget it after import without a larger refactor — source-pinned instead, same
  // class as F1/F2 above.
  it('SECURITY: getNewEntries stops reading (closes the stream) once maxEntries is reached, not just capping after a full read', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../../scripts/sync-context-usage.js'), 'utf8');
    expect(src).toMatch(/if \(maxEntries > 0 && entries\.length >= maxEntries\) \{\s*\n\s*rl\.close\(\);\s*\n\s*fileStream\.destroy\(\);\s*\n\s*break;/);
    expect(src).toMatch(/getNewEntries\(state\.lastSyncedLine, MAX_ENTRIES_PER_SYNC\)/);
  });

  it('TS-3: is exported and reads the LONG keys buildUsageEntry actually emits', () => {
    const entry = { session_id: 's1', timestamp: '2026-08-29T00:00:00.000Z', model_id: 'claude-x', context_used: 1000, context_size: 2000, usage_percent: 50, input_tokens: 400, output_tokens: 100, cache_creation_tokens: 300, cache_read_tokens: 200, status: 'HEALTHY', compaction_detected: false, working_directory: 'C:/x' };
    const t = transformEntry(entry);
    expect(t.session_id).toBe('s1');
    expect(t.timestamp).toBe('2026-08-29T00:00:00.000Z');
    expect(t.usage_percent).toBe(50);
    expect(t.cache_read_tokens).toBe(200);
  });

  it('TS-6: round-trip through buildUsageEntry -> transformEntry has zero undefined required fields', () => {
    const built = feed.buildUsageEntry({ sessionId: 's1', modelId: 'claude-x', contextUsed: 1000, contextSize: 2000, usagePercent: 50, inputTokens: 400, outputTokens: 100, cacheCreationTokens: 300, cacheReadTokens: 200, status: 'HEALTHY', cwd: 'C:/x', now: new Date('2026-08-29T00:00:00Z') });
    const t = transformEntry(built);
    for (const key of ['session_id', 'timestamp', 'model_id', 'usage_percent', 'input_tokens', 'output_tokens', 'cache_creation_tokens', 'cache_read_tokens']) {
      expect(t[key], `${key} should not be undefined`).not.toBeUndefined();
    }
  });

  it('passes loop_name through when present, omits when absent', () => {
    const withLoop = transformEntry({ session_id: 's1', timestamp: 't', loop_name: 'worker-checkin' });
    expect(withLoop.loop_name).toBe('worker-checkin');
    const withoutLoop = transformEntry({ session_id: 's1', timestamp: 't' });
    expect(Object.prototype.hasOwnProperty.call(withoutLoop, 'loop_name')).toBe(false);
  });
});
