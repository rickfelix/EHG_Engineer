/**
 * QF-20260905-230 — lib/fleet/sweep-findings-sink.cjs.
 *
 * ACCEPTANCE: a unit test feeds a synthetic conflict and asserts one row, then feeds it again and
 * asserts zero new rows. Mirrors tests/unit/coordinator/reaper-alert-wire.test.js's stub style —
 * the dedup lookup is served only rows matching the (kind, finding_class, subject) filters the
 * emitter actually applied, so a hardcoded/narrowed dedup key is detectable the same way that
 * file catches a hardcoded reaper-alert kind.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require_ = createRequire(import.meta.url);
const {
  emitFindingAlert, appendFindingLine, FINDINGS_LOG_PATH,
} = require_('../../../lib/fleet/sweep-findings-sink.cjs');

/** Generic stub: any table, tracks filters + inserts, dedup lookup honors ALL eq() filters. */
function stubSupabase({ openAlerts = [] } = {}) {
  const inserted = [];
  const filters = [];
  const sb = {
    from() {
      const eqs = {};
      const chain = {
        _isSelect: false,
        select() { chain._isSelect = true; return chain; },
        eq(col, val) {
          filters.push({ col, val });
          eqs[col] = val;
          return chain;
        },
        gte() { return chain; },
        is() { return chain; },
        gt() { return chain; },
        in() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        single() { return Promise.resolve({ data: { id: 'new-row' }, error: null }); },
        insert(r) { inserted.push(r); chain._isSelect = false; return chain; },
        then(res, rej) {
          if (chain._isSelect) {
            const hits = openAlerts
              .filter((a) => Object.entries(eqs).every(([k, v]) => a[k] === v))
              .map((a) => ({ id: 'open-' + JSON.stringify(a) }));
            return Promise.resolve({ data: hits, error: null }).then(res, rej);
          }
          return Promise.resolve({ data: { id: 'new-row' }, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { sb, inserted, filters };
}

const conflictFinding = () => ({
  findingClass: 'conflict', subject: 'SD-TEST-001', summary: 'SD-TEST-001: sess-a(ACTIVE) vs sess-b(STALE)',
});

describe('emitFindingAlert dedup', () => {
  it('ACCEPTANCE: a synthetic conflict inserts one row; fed again, zero new rows', async () => {
    const { sb: firstRun, inserted: insertedFirst } = stubSupabase({ openAlerts: [] });
    const out1 = await emitFindingAlert(firstRun, conflictFinding());
    expect(out1.skipped).toBeUndefined();
    expect(insertedFirst).toHaveLength(1);
    expect(insertedFirst[0].payload.finding_class).toBe('conflict');
    expect(insertedFirst[0].payload.subject).toBe('SD-TEST-001');

    // Second run: the row this finding would already have produced now exists as an "open alert".
    const { sb: secondRun, inserted: insertedSecond } = stubSupabase({
      openAlerts: [{ 'payload->>kind': 'sweep_finding_alert', 'payload->>finding_class': 'conflict', 'payload->>subject': 'SD-TEST-001' }],
    });
    const out2 = await emitFindingAlert(secondRun, conflictFinding());
    expect(out2.skipped).toBe(true);
    expect(insertedSecond).toHaveLength(0);
  });

  it('a different subject does NOT suppress — dedup is per-subject, not per-class', async () => {
    const { sb, inserted } = stubSupabase({
      openAlerts: [{ 'payload->>kind': 'sweep_finding_alert', 'payload->>finding_class': 'conflict', 'payload->>subject': 'SD-TEST-001' }],
    });
    const out = await emitFindingAlert(sb, { ...conflictFinding(), subject: 'SD-TEST-002' });
    expect(out.skipped).toBeUndefined();
    expect(inserted).toHaveLength(1);
  });

  it('a different finding_class does NOT suppress — a skip_reset finding on the same subject still alerts', async () => {
    const { sb, inserted } = stubSupabase({
      openAlerts: [{ 'payload->>kind': 'sweep_finding_alert', 'payload->>finding_class': 'conflict', 'payload->>subject': 'SD-TEST-001' }],
    });
    const out = await emitFindingAlert(sb, { findingClass: 'skip_reset', subject: 'SD-TEST-001', summary: 'x' });
    expect(out.skipped).toBeUndefined();
    expect(inserted).toHaveLength(1);
  });

  it('the dedup query keys on the jsonb payload fields, not bare columns that do not exist', async () => {
    const { sb, filters } = stubSupabase();
    await emitFindingAlert(sb, conflictFinding());
    expect(filters.some((f) => f.col === 'payload->>kind' && f.val === 'sweep_finding_alert')).toBe(true);
    expect(filters.some((f) => f.col === 'payload->>finding_class' && f.val === 'conflict')).toBe(true);
    expect(filters.some((f) => f.col === 'payload->>subject' && f.val === 'SD-TEST-001')).toBe(true);
  });

  it('the inserted row carries signal_type so the coordinator canonical inbox query surfaces it', async () => {
    const { sb, inserted } = stubSupabase();
    await emitFindingAlert(sb, conflictFinding());
    expect(inserted[0].payload.signal_type).toBe('sweep_finding');
    expect(inserted[0].message_type).toBe('INFO');
  });
});

describe('appendFindingLine', () => {
  it('appends a valid jsonl line containing the finding fields', () => {
    const marker = 'marker-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    appendFindingLine({ findingClass: 'warning', subject: marker, summary: marker });
    const content = fs.readFileSync(FINDINGS_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n');
    const line = lines.reverse().find((l) => l.includes(marker));
    expect(line).toBeTruthy();
    const parsed = JSON.parse(line);
    expect(parsed.findingClass).toBe('warning');
    expect(parsed.subject).toBe(marker);
    expect(typeof parsed.ts).toBe('string');
  });
});
