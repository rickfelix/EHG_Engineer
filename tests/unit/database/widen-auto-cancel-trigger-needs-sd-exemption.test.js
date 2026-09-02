/**
 * SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-4, TS-10)
 *
 * database/migrations/20260902_widen_auto_cancel_trigger_needs_sd_exemption.sql amends
 * fn_auto_close_quick_fixes_on_sd_completion so a needs_sd row (routing_tier=3,
 * escalated_to_sd_id IS NULL) survives the SD-completion auto-cancel trigger instead of
 * being silently cancelled with zero disposition fields the instant resolution_sd_id links
 * to an SD that later completes.
 *
 * Hermetic source-assertions on the migration file (no DB connection), matching the
 * established pattern in tests/unit/database/trigger-guard-pack.test.js — this migration is
 * staged only (chairman apply ceremony pending; see FR-4 AC-2), so a live-DB round-trip
 * against the CURRENT applied function would still see the pre-widened behavior. TS-10's own
 * PRD wording offers this as the explicit alternative: "a direct assertion against the
 * trigger function's WHERE-clause SQL text".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isNeedsSdRow } from '../../../lib/quick-fix/status-writer.cjs';

function loadMigration(name) {
  return readFileSync(path.resolve(process.cwd(), 'database/migrations', name), 'utf8');
}

const migration = loadMigration('20260902_widen_auto_cancel_trigger_needs_sd_exemption.sql');

function extractFunctionBody(src, fnName) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION ${fnName}`);
  expect(start, `${fnName} not found in migration`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('$$ LANGUAGE plpgsql;', start);
  expect(end, `${fnName} body not terminated`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('FR-4: SQL trigger needs_sd exemption (widen_auto_cancel_trigger)', () => {
  it('CREATE OR REPLACE FUNCTION targets the existing function name (additive, not a new object)', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion\(\)/);
  });

  it('the UPDATE statement targeting quick_fixes carries the needs_sd exemption in the SAME WHERE clause as resolution_sd_id = NEW.id', () => {
    // Only the LIVE function body (before the commented-out ROLLBACK block), not the
    // rollback snippet, must carry the widened clause -- the rollback block deliberately
    // does NOT, since it restores the pre-widened original.
    const liveBody = extractFunctionBody(migration, 'fn_auto_close_quick_fixes_on_sd_completion');
    expect(liveBody).toMatch(/WHERE resolution_sd_id = NEW\.id/);
    expect(liveBody).toMatch(/AND status NOT IN \('completed', 'cancelled', 'escalated', 'closed'\)/);
    expect(liveBody).toMatch(/AND NOT \(routing_tier = 3 AND escalated_to_sd_id IS NULL\)/);
  });

  it('the exception guard and non-blocking RETURN NEW are preserved unchanged from the original migration', () => {
    const liveBody = extractFunctionBody(migration, 'fn_auto_close_quick_fixes_on_sd_completion');
    expect(liveBody).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(liveBody).toMatch(/RAISE WARNING 'fn_auto_close_quick_fixes_on_sd_completion failed for SD %: %', NEW\.id, SQLERRM;/);
  });

  it('the trigger declaration (WHEN clause, EXECUTE FUNCTION target) is unchanged from the original', () => {
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS trg_auto_close_quick_fixes_on_sd_completion ON strategic_directives_v2;/);
    expect(migration).toMatch(/WHEN \(NEW\.status = 'completed' AND OLD\.status IS DISTINCT FROM 'completed'\)/);
    expect(migration).toMatch(/EXECUTE FUNCTION fn_auto_close_quick_fixes_on_sd_completion\(\);/);
  });

  it('documents an exact-reversal ROLLBACK block (the pre-widened function body, without the needs_sd clause)', () => {
    // Narrowed to the commented-out SQL block itself (between its own CREATE OR REPLACE and
    // $$ LANGUAGE plpgsql; markers) -- the surrounding "ROLLBACK (documented..." PROSE above
    // it explains the fix by quoting the clause being dropped, which would otherwise make a
    // wider slice match the code it is proving absent (the same self-referential-comment trap
    // documented elsewhere in this codebase's own SRC-PIN test comments).
    const rollbackCodeStart = migration.indexOf('-- CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion()');
    expect(rollbackCodeStart).toBeGreaterThanOrEqual(0);
    const rollbackCodeEnd = migration.indexOf('-- $$ LANGUAGE plpgsql;', rollbackCodeStart);
    expect(rollbackCodeEnd).toBeGreaterThan(rollbackCodeStart);
    const rollbackCode = migration.slice(rollbackCodeStart, rollbackCodeEnd);
    expect(rollbackCode).toMatch(/WHERE resolution_sd_id = NEW\.id/);
    expect(rollbackCode).toMatch(/AND status NOT IN \('completed', 'cancelled', 'escalated', 'closed'\);/);
    expect(rollbackCode).not.toMatch(/AND NOT \(routing_tier = 3 AND escalated_to_sd_id IS NULL\)/);
  });

  it('documents a post-apply verification query and an explicit rollback-trigger condition', () => {
    expect(migration).toMatch(/POST-APPLY VERIFICATION QUERY/);
    expect(migration).toMatch(/ROLLBACK TRIGGER CONDITION/);
  });

  // SECURITY finding (escalation-writer-exec-security, evidence e18315d5-83cd-4565-8d85-ae4f55d50c18):
  // CREATE OR REPLACE FUNCTION resets every attribute except ownership/grants -- naively cloning
  // the 20260525 origin migration (which predates the search_path hardening sweep) would have
  // silently reverted live pg_proc.proconfig's `search_path=public, extensions` pin on apply.
  // Fixed per the SD-LEO-INFRA-FIX-CREATE-REPLACE-001 pattern: restate the pin in the CREATE OR
  // REPLACE itself, and self-verify it post-apply.
  it('the live function body restates the search_path hardening pin (does not silently revert it)', () => {
    const liveBody = extractFunctionBody(migration, 'fn_auto_close_quick_fixes_on_sd_completion');
    expect(liveBody).toMatch(/SET search_path TO 'public', 'extensions'/);
  });

  it('the ROLLBACK block also restates the pin (a rollback CREATE OR REPLACE would otherwise re-strip it)', () => {
    const rollbackCodeStart = migration.indexOf('-- CREATE OR REPLACE FUNCTION fn_auto_close_quick_fixes_on_sd_completion()');
    const rollbackCodeEnd = migration.indexOf('-- $$ LANGUAGE plpgsql;', rollbackCodeStart);
    const rollbackCode = migration.slice(rollbackCodeStart, rollbackCodeEnd);
    expect(rollbackCode).toMatch(/SET search_path TO 'public', 'extensions'/);
  });

  it('carries a $verify_search_path$ self-verification block asserting the pin survived apply', () => {
    expect(migration).toMatch(/DO \$verify_search_path\$/);
    expect(migration).toMatch(/'search_path=public, extensions' = ANY\(v_config\)/);
  });
});

// TS-10 (required, PLAN-testing BLOCKER 1): parametrized SQL/JS predicate-equivalence
// matrix. SQL cannot import the JS isNeedsSdRow function, so the migration necessarily
// hand-writes a second representation of the same tier/link condition at the SQL boundary
// (`routing_tier = 3 AND escalated_to_sd_id IS NULL`) -- this matrix proves that clause
// matches the equivalent half of isNeedsSdRow across a spread of inputs, not just the one
// fixture shape.
//
// SCOPE NOTE: the two predicates are not claimed identical in every dimension. isNeedsSdRow
// additionally requires status==='open' (it is the definition of "awaiting an SD" used
// everywhere else in this SD -- FR-3's stale-sweep fence, FR-5's belt ranker). The SQL
// exemption clause applies to ANY row that reaches it, i.e. any status already outside the
// trigger's own `status NOT IN ('completed','cancelled','escalated','closed')` filter --
// which in practice means 'open' or 'in_progress'. That is a strictly WIDER exemption than
// isNeedsSdRow's, not a narrower one: it can only ever protect an in_progress+tier=3+
// unlinked row from a cancellation isNeedsSdRow would not itself flag as needs_sd, never the
// dangerous reverse (silently cancelling a row isNeedsSdRow considers needs_sd). The matrix
// below therefore pins the tier/link sub-clause -- the part that can actually drift and the
// part whose disagreement would be unsafe -- while documenting the status-scope difference
// rather than asserting a false full-row equivalence.
function sqlTierLinkExemption(row) {
  // Direct transliteration of `NOT (routing_tier = 3 AND escalated_to_sd_id IS NULL)`,
  // negated back to "is this row exempted" for readability (SQL's clause as written already
  // returns true-to-exempt via the outer NOT).
  return row.routing_tier === 3 && (row.escalated_to_sd_id === null || row.escalated_to_sd_id === undefined);
}

describe('TS-10: JS/SQL needs_sd predicate equivalence matrix', () => {
  const routingTiers = [3, 1, 2, null, undefined];
  const linkValues = [null, undefined, 'SD-LEO-EXAMPLE-001'];

  for (const routing_tier of routingTiers) {
    for (const escalated_to_sd_id of linkValues) {
      const row = { status: 'open', routing_tier, escalated_to_sd_id };
      const label = `routing_tier=${routing_tier} escalated_to_sd_id=${JSON.stringify(escalated_to_sd_id)}`;

      it(`status='open': SQL tier/link exemption matches isNeedsSdRow for ${label}`, () => {
        expect(sqlTierLinkExemption(row)).toBe(isNeedsSdRow(row));
      });
    }
  }

  it('the SQL exemption clause is WIDER than isNeedsSdRow only via status, never via tier/link (safety direction)', () => {
    // An in_progress row with the needs_sd tier/link shape: SQL would exempt it from
    // cancellation (protective, harmless), but isNeedsSdRow itself does not flag it (by
    // design -- needs_sd is defined only for status='open' elsewhere in this SD). This is
    // the one documented asymmetry; assert it explicitly so a future change that removes it
    // is a visible, deliberate decision rather than silent drift.
    const row = { status: 'in_progress', routing_tier: 3, escalated_to_sd_id: null };
    expect(sqlTierLinkExemption(row)).toBe(true);
    expect(isNeedsSdRow(row)).toBe(false);
  });

  it('a genuinely needs_sd row (status=open, tier=3, unlinked) is exempted by both sides', () => {
    const row = { status: 'open', routing_tier: 3, escalated_to_sd_id: null };
    expect(sqlTierLinkExemption(row)).toBe(true);
    expect(isNeedsSdRow(row)).toBe(true);
  });

  it('a linked (escalated_to_sd_id set) tier=3 row is NOT exempted by either side', () => {
    const row = { status: 'open', routing_tier: 3, escalated_to_sd_id: 'SD-LEO-EXAMPLE-001' };
    expect(sqlTierLinkExemption(row)).toBe(false);
    expect(isNeedsSdRow(row)).toBe(false);
  });
});
