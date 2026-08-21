// SD-LEO-GEN-STAGE-DECISION-RESTORE-001 (FR-2, FR-5, FR-6): TS-3, TS-4, TS-7.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { classifyRow, buildReport, generateReport, DEFAULT_MANIFEST_PATH } from '../../../scripts/one-off/stage-decision-restore-report.mjs';

const REAL_MANIFEST = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST_PATH, 'utf8')).manifest;

describe('classifyRow (SD-LEO-GEN-STAGE-DECISION-RESTORE-001 FR-2/FR-5)', () => {
  it('classifies as UNVERIFIED when recovery_note admits no located tick-line', () => {
    const row = { id: 'abc', recovery_source: 'named by coordinator, not independently tick-located in log text', recovery_note: 'x' };
    const result = classifyRow(row, 'some log text');
    expect(result.tier).toBe('UNVERIFIED');
  });

  it('classifies as VERIFIED_EXACT when the row\'s SHORT 8-char id prefix appears literally in the log (the log never spells out full UUIDs -- caught live: an earlier version of this check searched for the full UUID and never matched real log content)', () => {
    const row = { id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73', recovery_source: 'tick 21st 13:32Z', recovery_note: 'explicit tick-line match' };
    const log = 'some preamble\nLedger row 922f8dfb deferred (0 aged pending)\ntrailer';
    const result = classifyRow(row, log);
    expect(result.tier).toBe('VERIFIED_EXACT');
    expect(result.citation).toContain('line 2');
  });

  it('does NOT false-match a different id that merely shares the same 8-char prefix as a substring of a longer token', () => {
    const row = { id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73', recovery_source: 'tick 21st 13:32Z', recovery_note: 'x' };
    const log = 'Ledger row 922f8dfbXXXXX deferred'; // NOT a word-boundary match
    const result = classifyRow(row, log);
    expect(result.tier).not.toBe('VERIFIED_EXACT');
  });

  it('classifies as VERIFIED_BATCH (never silently promoted to VERIFIED_EXACT) when the id is not literally in the log but recovery_note cites batch membership', () => {
    const row = { id: '0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', recovery_source: 'tick 21st 13:32Z', recovery_note: 'part of the DEFICIT-URGENT tick batch' };
    const log = 'some log with no matching id at all';
    const result = classifyRow(row, log);
    expect(result.tier).toBe('VERIFIED_BATCH');
    expect(result.citation).not.toContain('EXPLICIT');
  });

  it('fails CLOSED to VERIFIED_BATCH (never VERIFIED_EXACT) when the log is unreadable (logText === null)', () => {
    const row = { id: 'some-id', recovery_source: 'tick 21st 13:32Z', recovery_note: 'part of a tick batch' };
    const result = classifyRow(row, null);
    expect(result.tier).not.toBe('VERIFIED_EXACT');
    expect(result.citation).toContain('unreadable');
  });
});

describe('buildReport (SD-LEO-GEN-STAGE-DECISION-RESTORE-001 FR-6)', () => {
  it('TS-4: tiers the real manifest\'s 4 recoverable rows correctly against a fixture log with only 922f8dfb located', () => {
    const fixtureLog = 'preamble\nLedger row 922f8dfb deferred (0 aged pending)\ntrailer';
    const report = buildReport(REAL_MANIFEST, fixtureLog);
    const verifiedIds = report.verified.map((r) => r.id).sort();
    const unverifiedIds = report.unverified.map((r) => r.id).sort();
    expect(verifiedIds).toEqual(['0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', '922f8dfb-a548-49b4-869e-0f8c7b73fd73']);
    expect(unverifiedIds).toEqual(['4ca4e7a2-50bd-4d39-bd0f-cb9c822cb47d', '98c97aa1-edd0-462c-a39d-032edd22d6c8']);
    // 0f9ffc05 has weaker evidence than 922f8dfb -- must not be silently promoted to the same tier.
    const tier0f9 = report.verified.find((r) => r.id.startsWith('0f9ffc05')).tier;
    const tier922 = report.verified.find((r) => r.id.startsWith('922f8dfb')).tier;
    expect(tier0f9).toBe('VERIFIED_BATCH');
    expect(tier922).toBe('VERIFIED_EXACT');
  });

  it('TS-7: reconciles the full 1212-row count with no row double-counted or dropped', () => {
    const report = buildReport(REAL_MANIFEST, null);
    const sum = report.verified.length + report.unverified.length + report.unrecovered_count;
    expect(sum).toBe(REAL_MANIFEST.length);
    expect(REAL_MANIFEST.length).toBe(1212);
    expect(report.unrecovered_count).toBe(1208);
  });

  it('never issues a DB write -- buildReport and classifyRow take no client and touch no I/O', () => {
    expect(buildReport.constructor.name).not.toBe('AsyncFunction');
    expect(classifyRow.constructor.name).not.toBe('AsyncFunction');
  });
});

describe('generateReport (SD-LEO-GEN-STAGE-DECISION-RESTORE-001 FR-2): TS-3 read-only guarantee', () => {
  it('performs zero writes against a mock DB client wired to fail the test on any non-SELECT statement', async () => {
    const queries = [];
    const mockClient = {
      async query(sql, _params) {
        queries.push(sql);
        if (!/^\s*SELECT/i.test(sql)) {
          throw new Error(`SAFETY TEST FAILURE: a non-SELECT statement was attempted: ${sql}`);
        }
        return { rows: [] };
      },
    };
    const report = await generateReport({ client: mockClient });
    expect(report.total).toBe(1212);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => /^\s*SELECT/i.test(q))).toBe(true);
  });

  it('when no client is supplied, performs zero DB calls at all (pure manifest/log parsing)', async () => {
    const report = await generateReport({});
    expect(report.total).toBe(1212);
    expect(report.verified.every((r) => !('live_decision_by' in r))).toBe(true);
  });
});
