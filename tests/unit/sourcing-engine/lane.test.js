// SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001 (FR-4)
// Guards the sourcing-engine lane schema foundation: the canonical lane vocabulary (lib), the additive
// migration file content, and a DORMANT-pattern live probe that SKIPS (never fails) until the migration
// is applied — so the suite is green hermetically and validates the column the moment Adam applies it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANE,
  FIXED_LANES,
  BLOCKED_LANE_PREFIX,
  blockedLane,
  isValidLane,
} from '../../../lib/sourcing-engine/lane.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIGRATION = path.join(REPO_ROOT, 'database/migrations/20260619_sourcing_engine_lane_column.sql');
const SQL = readFileSync(MIGRATION, 'utf8');

// --- FR-3: the canonical lane vocabulary -----------------------------------------------------------
describe('lane vocabulary (FR-3)', () => {
  it('FIXED_LANES and LANE are frozen and consistent', () => {
    expect(Object.isFrozen(FIXED_LANES)).toBe(true);
    expect(Object.isFrozen(LANE)).toBe(true);
    expect(FIXED_LANES).toEqual(['belt-ready', 'chairman-gated', 'outcome-gated', 'dedup', 'decline']);
    for (const v of Object.values(LANE)) expect(FIXED_LANES).toContain(v);
  });

  it('isValidLane accepts every fixed lane', () => {
    for (const l of FIXED_LANES) expect(isValidLane(l)).toBe(true);
  });

  it('isValidLane accepts a parametric blocked-on-<non-empty> lane', () => {
    expect(isValidLane('blocked-on-SD-LEO-INFRA-FOO-001')).toBe(true);
    expect(isValidLane(blockedLane('SD-X-001'))).toBe(true);
  });

  it('isValidLane rejects an empty blocked suffix, unknown values, empties and non-strings', () => {
    expect(isValidLane('blocked-on-')).toBe(false); // no suffix char
    expect(isValidLane('blocked')).toBe(false);
    expect(isValidLane('promote')).toBe(false);
    expect(isValidLane('')).toBe(false);
    expect(isValidLane(null)).toBe(false);
    expect(isValidLane(42)).toBe(false);
    expect(isValidLane(undefined)).toBe(false);
  });

  it('blockedLane builds the prefixed value and is null-safe', () => {
    expect(blockedLane('SD-X-001')).toBe(`${BLOCKED_LANE_PREFIX}SD-X-001`);
    expect(blockedLane('  trimmed  ')).toBe(`${BLOCKED_LANE_PREFIX}trimmed`);
    expect(blockedLane('')).toBeNull();
    expect(blockedLane('   ')).toBeNull();
    expect(blockedLane(null)).toBeNull();
  });
});

// --- FR-1: the additive migration file content -----------------------------------------------------
describe('lane migration file (FR-1)', () => {
  it('adds a nullable lane column to BOTH tables, idempotently', () => {
    expect(SQL).toMatch(/ALTER TABLE\s+conversion_ledger\s+ADD COLUMN IF NOT EXISTS\s+lane\s+text/i);
    expect(SQL).toMatch(/ALTER TABLE\s+roadmap_wave_items\s+ADD COLUMN IF NOT EXISTS\s+lane\s+text/i);
  });

  it('declares an additive CHECK on both tables enumerating the canonical lanes + parametric blocked-on', () => {
    const checks = SQL.match(/CHECK\s*\([\s\S]*?\)/gi) || [];
    expect(checks.length).toBeGreaterThanOrEqual(2);
    // every fixed lane appears in the constraint vocabulary
    for (const l of FIXED_LANES) expect(SQL).toContain(`'${l}'`);
    // the parametric blocked lane is matched by prefix with a required suffix char
    expect(SQL).toMatch(/LIKE\s+'blocked-on-_%'/i);
    // NULL stays allowed (column absent => engine degrades)
    expect(SQL).toMatch(/lane IS NULL/i);
    // the constraint add is idempotent (drop-then-add)
    expect(SQL).toMatch(/DROP CONSTRAINT IF EXISTS\s+conversion_ledger_lane_check/i);
    expect(SQL).toMatch(/DROP CONSTRAINT IF EXISTS\s+roadmap_wave_items_lane_check/i);
  });

  it('keeps lane SEPARATE from disposition (documents the two-axis rule)', () => {
    expect(SQL).toMatch(/SEPARATE|DISTINCT/i);
    expect(SQL.toLowerCase()).toContain('disposition');
  });
});

// NOTE: the FR-2 DORMANT live column probe (which touches the DB) lives in the db-tier sibling
// tests/unit/sourcing-engine/lane.db.test.js so the unit tier stays hermetic (per the DB-test guard).
