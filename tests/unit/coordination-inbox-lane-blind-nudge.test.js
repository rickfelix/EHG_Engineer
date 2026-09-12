/**
 * Unit tests — QF-20260912-772.
 *
 * A tool-active worker that skips /checkin reads every reply-class row within minutes (this
 * hook drains those) but drains NO directive-class row at all (only /checkin's ackMessage does),
 * so a directed WORK_ASSIGNMENT cannot reach a tool-active-but-/checkin-skipping seat by
 * construction. These pure helpers (no DB) detect an unread directive-class row aged past the
 * cut point and rate-limit the fallback nudge this hook prints on every tool call.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  findOldestUnreadDirectiveRow,
  classifyToolActiveLaneBlind,
  shouldPrintLaneBlindNudge,
  markLaneBlindNudgePrinted,
  getLaneBlindNudgeFile,
} = require('../../scripts/hooks/coordination-inbox.cjs');

const NOW = Date.parse('2026-09-12T12:00:00.000Z');

describe('findOldestUnreadDirectiveRow()', () => {
  it('finds a WORK_ASSIGNMENT row (message_type) among reply-class rows', () => {
    const rows = [
      { message_type: 'INFO', payload: { kind: 'coordinator_reply' } },
      { message_type: 'WORK_ASSIGNMENT', payload: {}, created_at: '2026-09-12T11:00:00Z' },
      { message_type: 'INFO', payload: { kind: 'signal_receipt' } },
    ];
    expect(findOldestUnreadDirectiveRow(rows)).toBe(rows[1]);
  });

  it('finds a row whose payload.kind is in DIRECTIVE_KINDS (e.g. coordinator_request)', () => {
    const rows = [
      { message_type: 'INFO', payload: { kind: 'signal_receipt' } },
      { message_type: 'INFO', payload: { kind: 'coordinator_request' }, created_at: '2026-09-12T11:00:00Z' },
    ];
    expect(findOldestUnreadDirectiveRow(rows)).toBe(rows[1]);
  });

  it('returns the FIRST matching row — rows are oldest-first by construction (created_at asc)', () => {
    const rows = [
      { message_type: 'WORK_ASSIGNMENT', payload: {}, created_at: '2026-09-12T09:00:00Z' },
      { message_type: 'WORK_ASSIGNMENT', payload: {}, created_at: '2026-09-12T10:00:00Z' },
    ];
    expect(findOldestUnreadDirectiveRow(rows)).toBe(rows[0]);
  });

  it('returns null when no row is directive-class', () => {
    const rows = [
      { message_type: 'INFO', payload: { kind: 'coordinator_reply' } },
      { message_type: 'INFO', payload: { kind: 'signal_receipt' } },
    ];
    expect(findOldestUnreadDirectiveRow(rows)).toBeNull();
  });

  it('returns null for an empty or missing batch', () => {
    expect(findOldestUnreadDirectiveRow([])).toBeNull();
    expect(findOldestUnreadDirectiveRow(undefined)).toBeNull();
  });
});

describe('classifyToolActiveLaneBlind()', () => {
  it('not blind when there is no oldest directive row at all', () => {
    expect(classifyToolActiveLaneBlind(null, { now: NOW })).toEqual({ blind: false, ageMinutes: null });
  });

  it('not blind when the directive row is within the 15-minute cut point', () => {
    const row = { created_at: new Date(NOW - 10 * 60000).toISOString() };
    const result = classifyToolActiveLaneBlind(row, { now: NOW });
    expect(result.blind).toBe(false);
    expect(result.ageMinutes).toBe(10);
  });

  it('blind when the directive row is older than the 15-minute cut point (the specimen: 20 min)', () => {
    const row = { created_at: new Date(NOW - 20 * 60000).toISOString() };
    const result = classifyToolActiveLaneBlind(row, { now: NOW });
    expect(result.blind).toBe(true);
    expect(result.ageMinutes).toBe(20);
  });

  it('a cutMinutes override is honored', () => {
    const row = { created_at: new Date(NOW - 10 * 60000).toISOString() };
    expect(classifyToolActiveLaneBlind(row, { now: NOW, cutMinutes: 5 }).blind).toBe(true);
  });
});

describe('shouldPrintLaneBlindNudge() / markLaneBlindNudgePrinted() (rate limit)', () => {
  const sessionId = 'qf772-test-session-0001';
  beforeEach(() => {
    const f = getLaneBlindNudgeFile(sessionId);
    if (f) { try { fs.unlinkSync(f); } catch { /* absent is fine */ } }
  });
  afterEach(() => {
    const f = getLaneBlindNudgeFile(sessionId);
    if (f) { try { fs.unlinkSync(f); } catch { /* best-effort */ } }
  });

  it('prints when no rate-limit file exists yet', () => {
    expect(shouldPrintLaneBlindNudge(sessionId)).toBe(true);
  });

  it('does NOT print again immediately after marking — the nudge is not re-printed on every tool call', () => {
    markLaneBlindNudgePrinted(sessionId);
    expect(shouldPrintLaneBlindNudge(sessionId)).toBe(false);
  });

  it('prints again once the 5-minute window has elapsed', () => {
    const file = getLaneBlindNudgeFile(sessionId);
    fs.writeFileSync(file, JSON.stringify({ lastPrinted: Date.now() - 6 * 60000 }));
    expect(shouldPrintLaneBlindNudge(sessionId)).toBe(true);
  });
});
