// Tests for lib/db-retention/size-monitor.mjs
// SD-LEO-INFRA-DB-RETENTION-GOVERNANCE-AUDIT-LOG-001 (FR-5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSizeAlert,
  levelToExitCode,
  runMonitor,
  SIZE_QUERY,
  DEFAULT_CAP_GB,
} from '../../lib/db-retention/size-monitor.mjs';

const GB = 1024 ** 3;

test('defaults: 12GB cap, warn 75% / critical 85%', () => {
  assert.equal(DEFAULT_CAP_GB, 12);
});

test('evaluateSizeAlert: under 75% → ok', () => {
  const v = evaluateSizeAlert({ dbBytes: 6.3 * GB }, { capGB: 12 });
  assert.equal(v.level, 'ok');
  assert.ok(v.dbPct > 50 && v.dbPct < 56);
});

test('evaluateSizeAlert: at/above 75% → warn', () => {
  assert.equal(evaluateSizeAlert({ dbBytes: 9 * GB }, { capGB: 12 }).level, 'warn'); // 75%
  assert.equal(evaluateSizeAlert({ dbBytes: 9.5 * GB }, { capGB: 12 }).level, 'warn');
});

test('evaluateSizeAlert: at/above 85% → critical (fires before the 90% auto-expand)', () => {
  assert.equal(evaluateSizeAlert({ dbBytes: 10.2 * GB }, { capGB: 12 }).level, 'critical'); // 85%
  assert.equal(evaluateSizeAlert({ dbBytes: 11 * GB }, { capGB: 12 }).level, 'critical');
});

test('evaluateSizeAlert: surfaces table offenders ≥1GB only', () => {
  const v = evaluateSizeAlert({
    dbBytes: 6 * GB,
    topTables: [
      { table_name: 'public.governance_audit_log', total_bytes: 3.9 * GB },
      { table_name: 'public.small_table', total_bytes: 0.2 * GB },
    ],
  }, { capGB: 12 });
  assert.equal(v.offenders.length, 1);
  assert.equal(v.offenders[0].table, 'public.governance_audit_log');
  assert.ok(v.offenders[0].gb >= 3.8 && v.offenders[0].gb <= 4.0);
});

test('evaluateSizeAlert: divide-by-zero safe + handles empty state', () => {
  const v = evaluateSizeAlert({}, { capGB: 12 });
  assert.equal(v.dbBytes, 0);
  assert.equal(v.level, 'ok');
  assert.deepEqual(v.offenders, []);
});

test('evaluateSizeAlert: custom cap honored', () => {
  // 6.3GB against an 8GB cap = 78.75% → warn
  assert.equal(evaluateSizeAlert({ dbBytes: 6.3 * GB }, { capGB: 8 }).level, 'warn');
});

test('levelToExitCode: ok=0, warn=1, critical=2', () => {
  assert.equal(levelToExitCode('ok'), 0);
  assert.equal(levelToExitCode('warn'), 1);
  assert.equal(levelToExitCode('critical'), 2);
});

test('SIZE_QUERY is read-only (SELECT only, no write keywords)', () => {
  assert.match(SIZE_QUERY, /pg_database_size/);
  assert.doesNotMatch(SIZE_QUERY, /\b(DELETE|UPDATE|INSERT|DROP|ALTER|TRUNCATE)\b/i);
});

test('runMonitor: wires injected querySql into the verdict', async () => {
  const rows = [{ db_bytes: 10.5 * GB, top_tables: [{ table_name: 'public.governance_audit_log', total_bytes: 3.9 * GB }] }];
  const res = await runMonitor({ querySql: async () => rows, capGB: 12, log: () => {} });
  assert.equal(res.ok, true);
  assert.equal(res.verdict.level, 'critical');
  assert.equal(res.verdict.offenders.length, 1);
});

test('runMonitor: fail-soft on query error (no throw)', async () => {
  const res = await runMonitor({ querySql: async () => { throw new Error('boom'); }, capGB: 12 });
  assert.equal(res.ok, false);
  assert.match(res.error, /boom/);
});

test('runMonitor: no querySql → ok:false', async () => {
  const res = await runMonitor({});
  assert.equal(res.ok, false);
});
