/**
 * SD-LEO-INFRA-MIGRATION-TIER-CLASSIFIER-001 — FR-2/FR-3 gating helpers.
 *
 * The classifier itself (FR-1) is exhaustively covered by migration-tier-classifier.test.js.
 * This suite covers the HANDOFF-TIME GATE wiring in pending-migrations-check.js:
 *   - tierGateEnabled(): opt-in, ONLY the literal 'on' (case-insensitive) enables.
 *   - classifyPendingTiers(): reads each file's SQL and annotates the tier; an UNREADABLE
 *     file MUST default-deny to TIER-2 (the catastrophic-false-TIER-1 guard at the gate edge).
 *   - inverseHint(): coarse DROP rollback hints derived from the matched allow-tokens.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { tierGateEnabled, classifyPendingTiers, inverseHint } from '../../scripts/modules/handoff/pre-checks/pending-migrations-check.js';

const tmp = mkdtempSync(path.join(tmpdir(), 'tier-gate-'));
const writeSql = (name, sql) => { const p = path.join(tmp, name); writeFileSync(p, sql, 'utf8'); return p; };
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

describe('tierGateEnabled — opt-in, default-OFF', () => {
  const KEY = 'LEO_MIGRATION_TIER_GATE';
  const orig = process.env[KEY];
  afterAll(() => { if (orig === undefined) delete process.env[KEY]; else process.env[KEY] = orig; });

  it('is OFF when unset', () => { delete process.env[KEY]; expect(tierGateEnabled()).toBe(false); });
  it('is ON for "on" (any case)', () => {
    process.env[KEY] = 'on'; expect(tierGateEnabled()).toBe(true);
    process.env[KEY] = 'ON'; expect(tierGateEnabled()).toBe(true);
    process.env[KEY] = ' On '.trim(); expect(tierGateEnabled()).toBe(true);
  });
  it('stays OFF for any other truthy-looking value (fail-safe to current behavior)', () => {
    for (const v of ['off', 'true', '1', 'yes', 'enabled', '']) { process.env[KEY] = v; expect(tierGateEnabled()).toBe(false); }
  });
});

describe('classifyPendingTiers — per-file tiering with default-deny', () => {
  it('annotates a provably-additive file as TIER-1 and preserves original fields', () => {
    const file = writeSql('add.sql', 'CREATE TABLE IF NOT EXISTS gate_ok (id int);');
    const [r] = classifyPendingTiers([{ file, status: 'NOT_EXECUTED' }]);
    expect(r.tier).toBe(1);
    expect(r.status).toBe('NOT_EXECUTED');      // original field preserved
    expect(Array.isArray(r.matched) && r.matched.length).toBeTruthy();
  });

  it('annotates a destructive file as TIER-2', () => {
    const file = writeSql('drop.sql', 'DROP TABLE users;');
    const [r] = classifyPendingTiers([{ file }]);
    expect(r.tier).toBe(2);
  });

  it('DEFAULT-DENY: an unreadable / missing file is TIER-2, never TIER-1', () => {
    const [r] = classifyPendingTiers([{ file: path.join(tmp, 'does-not-exist.sql') }]);
    expect(r.tier).toBe(2);
    expect(r.tierReason).toBe('unreadable_migration_file');
    expect(r.matched).toEqual([]);
  });

  it('handles an empty/missing set', () => {
    expect(classifyPendingTiers([])).toEqual([]);
    expect(classifyPendingTiers(undefined)).toEqual([]);
  });

  it('classifies a mixed batch independently (one TIER-1, one TIER-2)', () => {
    const ok = writeSql('ok2.sql', 'CREATE INDEX IF NOT EXISTS idx_x ON t (a);');
    const bad = writeSql('bad2.sql', 'ALTER TABLE t ALTER COLUMN c TYPE bigint;');
    const out = classifyPendingTiers([{ file: ok }, { file: bad }]);
    expect(out.map(m => m.tier)).toEqual([1, 2]);
  });
});

describe('inverseHint — coarse rollback hints from matched allow-tokens', () => {
  it('maps create_table_if_not_exists to DROP TABLE', () => {
    expect(inverseHint(['create_table_if_not_exists:audit_log'])).toContain('DROP TABLE IF EXISTS audit_log;');
  });
  it('maps each added column to its own DROP COLUMN', () => {
    const hints = inverseHint(['add_column_nullable:profiles.nickname,profiles.bio']);
    expect(hints).toContain('ALTER TABLE profiles DROP COLUMN IF EXISTS nickname;');
    expect(hints).toContain('ALTER TABLE profiles DROP COLUMN IF EXISTS bio;');
  });
  it('maps enable_rls to DISABLE ROW LEVEL SECURITY', () => {
    expect(inverseHint(['enable_rls:notes'])).toContain('ALTER TABLE notes DISABLE ROW LEVEL SECURITY;');
  });
  it('returns [] for empty / unknown tokens', () => {
    expect(inverseHint([])).toEqual([]);
    expect(inverseHint(undefined)).toEqual([]);
    expect(inverseHint(['mystery_token'])).toEqual([]);
  });
});
