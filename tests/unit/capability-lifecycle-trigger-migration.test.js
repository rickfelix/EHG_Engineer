/**
 * SD-FDBK-FIX-ROOT-FIX-TRG-001 — Root-fix trg_capability_lifecycle null-unsafe
 * capability_type mapping (blocks LEAD-FINAL completion writes).
 *
 * Hermetic source-assertions on the migration's load-bearing elements (no DB).
 * The LIVE behavioral validation is scripts/validate-capability-lifecycle-trigger.mjs
 * (npm run validate:capability-trigger) — a BEGIN…ROLLBACK round-trip exercising all
 * five delivers_capabilities shapes against the real trigger; it was run green both
 * pre-apply (function applied in-txn) and post-apply (live function).
 *
 * Two root bugs this migration fixes:
 *   1. capability_type inserted BARE (NOT NULL + 19-value CHECK) → string/missing/
 *      invalid types hard-failed the entire SD completion UPDATE.
 *   2. sd_uuid was written from NEW.uuid_id but its FK targets
 *      strategic_directives_v2(id) — and uuid_id ≠ id for 3,686/3,687 SDs, so the
 *      ledger insert FK-failed for virtually every real SD (RCA row 2e916cc5).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'database/migrations/20260610_root_fix_capability_lifecycle_trigger.sql'
);
const sql = readFileSync(MIGRATION_PATH, 'utf8');

// Only the live (non-commented) portion — the DOWN block at the bottom preserves
// the buggy prior body verbatim inside SQL comments.
const live = sql
  .split('\n')
  .filter(l => !l.trimStart().startsWith('--'))
  .join('\n');

describe('capability-lifecycle trigger migration (live section)', () => {
  it('replaces fn_handle_capability_lifecycle with search_path pinned', () => {
    expect(live).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_handle_capability_lifecycle\(\)/);
    expect(live).toMatch(/SET search_path TO 'public', 'extensions'/);
  });

  it('root bug #1: normalizes capability_type (COALESCE/NULLIF/trim + CHECK-list fallback)', () => {
    expect(live).toMatch(/COALESCE\(NULLIF\(trim\(cap_record->>'capability_type'\), ''\), 'tool'\)/);
    expect(live).toMatch(/IF NOT \(norm_type = ANY \(valid_types\)\)/);
  });

  it('mirrors the full 19-value sd_capabilities_capability_type_check allow-list', () => {
    const expected = [
      'agent','crew','tool','skill','database_schema','database_function',
      'rls_policy','migration','api_endpoint','component','hook','service',
      'utility','workflow','webhook','external_integration','validation_rule',
      'quality_gate','protocol',
    ];
    for (const t of expected) {
      expect(live, `valid_types missing '${t}'`).toMatch(new RegExp(`'${t}'`));
    }
  });

  it('handles string/scalar entries (jsonb_typeof object check + raw preservation)', () => {
    expect(live).toMatch(/IF jsonb_typeof\(cap_record\) <> 'object' THEN/);
    expect(live).toMatch(/jsonb_build_object\('raw', cap_record, 'normalized', true\)/);
  });

  it('FR-1: array-shape guards on all three capability fields', () => {
    for (const field of ['delivers_capabilities', 'modifies_capabilities', 'deprecates_capabilities']) {
      expect(live, `${field} missing jsonb_typeof array guard`).toMatch(
        new RegExp(`jsonb_typeof\\(NEW\\.${field}\\) <> 'array'`)
      );
    }
  });

  it('FR-3: outer EXCEPTION guard preserves the completion write', () => {
    expect(live).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(live).toMatch(/suppressed % for SD %/);
    // The guard must RETURN NEW (never re-raise) so completion proceeds.
    const guardIdx = live.indexOf('EXCEPTION WHEN OTHERS THEN');
    const tail = live.slice(guardIdx);
    expect(tail).toMatch(/RETURN NEW;/);
  });

  it('root bug #2: ledger inserts use NEW.id (the sd_uuid FK target), never NEW.uuid_id', () => {
    expect(live).not.toMatch(/NEW\.uuid_id/);
    // Three insert sites (registered / updated / deprecated) all key sd_uuid off NEW.id.
    const inserts = live.match(/INSERT INTO sd_capabilities/g) || [];
    expect(inserts.length).toBe(3);
  });

  it('keeps the dedup ON CONFLICT contract at every ledger insert', () => {
    const conflicts = live.match(/ON CONFLICT \(sd_uuid, capability_key, action\) DO NOTHING/g) || [];
    expect(conflicts.length).toBe(3);
  });

  it('preserves the prior production body for rollback (DOWN block)', () => {
    expect(sql).toMatch(/DOWN \/ ROLLBACK/);
    // The buggy original (NEW.uuid_id + bare capability_type insert) is documented in comments.
    expect(sql).toMatch(/--\s+VALUES \(NEW\.uuid_id, NEW\.id, cap_record->>'capability_type'/);
  });

  it('migration carries the prod-guard approval header', () => {
    expect(sql).toMatch(/^-- @approved-by:/m);
  });
});

describe('validator wiring (FR-5 reachability)', () => {
  it('validate:capability-trigger npm script points at the round-trip validator', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(pkg.scripts['validate:capability-trigger']).toMatch(/validate-capability-lifecycle-trigger\.mjs --live/);
  });

  it('the validator script exists and rolls back (no persistent writes)', () => {
    const v = readFileSync(path.resolve(process.cwd(), 'scripts/validate-capability-lifecycle-trigger.mjs'), 'utf8');
    expect(v).toMatch(/ROLLBACK/);
    expect(v).toMatch(/SD-TEST-TRG-ROUNDTRIP-001/);
    expect(v).toMatch(/leo\.bypass_completion_check/);
  });
});
