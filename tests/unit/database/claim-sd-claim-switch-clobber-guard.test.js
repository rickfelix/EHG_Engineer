/**
 * SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4) — claim_sd's claim-switch clobber guard.
 *
 * RCA (QF-20260712-310): the claim-switch UPDATE nulls the CALLING session's
 * claude_sessions row when it releases some OTHER SD to claim p_sd_id, but never
 * cleared that evicted SD's own strategic_directives_v2.claiming_session_id /
 * active_session_id / is_working_on — cross-table drift left the evicted SD looking
 * claimed by a session that had moved on. Hermetic source-assertions on the migration
 * file (no DB connection) — mirrors tests/unit/database/trigger-guard-pack.test.js.
 *
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A (2026-09-03): 20260712's own fix shipped with a
 * structural bug this suite did not catch -- `RETURNING sd_key INTO v_evicted_sd_key`
 * on an UPDATE that itself SETs sd_key = NULL always yields the NEW (NULL) value, so
 * v_evicted_sd_key was NULL on every real call and the whole clobber-guard block below
 * was dead code (0 of 55 real claim switches fired it). This suite's OLD line-30
 * assertion (`toMatch(/RETURNING sd_key INTO v_evicted_sd_key;/)`) is EXACTLY the bug's
 * own signature, so it certified the defect as correct rather than catching it. Now
 * points at the corrected migration and asserts the OLD-value-via-preceding-SELECT
 * pattern instead, with an explicit negative assertion that the broken pattern is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadMigration(name) {
  return readFileSync(path.resolve(process.cwd(), 'database/migrations', name), 'utf8');
}

const migration = loadMigration('20260903_claim_sd_symmetric_clear_returning_fix.sql');

describe('FR-4: claim_sd claim-switch clobber guard migration', () => {
  it('is a CREATE OR REPLACE (unchanged signature, no DROP+CREATE hazard)', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_sd\(/);
    expect(migration).not.toMatch(/DROP FUNCTION/);
  });

  it('declares v_evicted_sd_key and captures the OLD value via a preceding SELECT, never via RETURNING on the destructive UPDATE', () => {
    expect(migration).toMatch(/v_evicted_sd_key\s+text;/);
    expect(migration).toMatch(/released_reason = 'claim_switch'/);
    // THE FIX: a plain SELECT immediately before the claim-switch UPDATE captures the
    // pre-UPDATE sd_key. Assert the SELECT exists and precedes the UPDATE in the file.
    const selectIdx = migration.indexOf('SELECT sd_key INTO v_evicted_sd_key');
    const updateIdx = migration.indexOf("released_reason = 'claim_switch'");
    expect(selectIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(updateIdx);
    // THE REGRESSION GUARD: the broken pattern (RETURNING the same column an UPDATE just
    // SET to NULL) must never reappear on the claim-switch UPDATE. `sd_key = p_sd_id` is
    // the LATER, unrelated new-claim UPDATE's RETURNING-free block -- excluded by scoping
    // the check to the claim-switch UPDATE's own statement, not the whole file.
    const claimSwitchStatement = migration.slice(updateIdx, migration.indexOf(';', updateIdx) + 1);
    expect(claimSwitchStatement).not.toMatch(/RETURNING sd_key INTO v_evicted_sd_key/);
  });

  it('logs an observable trail for every symmetric clear that actually fires (session_lifecycle_events)', () => {
    const clearBlock = migration.split('IF v_evicted_sd_key IS NOT NULL AND v_evicted_row_count > 0 THEN')[1];
    expect(clearBlock).toMatch(/INSERT INTO session_lifecycle_events/);
    expect(clearBlock).toMatch(/'CLAIM_SWITCH_EVICTED_CLEARED'/);
    expect(clearBlock).toMatch(/'evicted_sd_key',\s*v_evicted_sd_key/);
  });

  it('clears the evicted SD row only, guarded by claiming_session_id = p_session_id', () => {
    const clearBlock = migration.split('IF v_evicted_sd_key IS NOT NULL AND v_evicted_row_count > 0 THEN')[1];
    expect(clearBlock).toMatch(/UPDATE strategic_directives_v2\s+SET claiming_session_id = NULL,\s+active_session_id = NULL,\s+is_working_on = FALSE/);
    expect(clearBlock).toMatch(/WHERE sd_key = v_evicted_sd_key\s+AND claiming_session_id = p_session_id;/);
  });

  it('clears the evicted QF row via the QF-prefixed branch, same session guard', () => {
    const clearBlock = migration.split('IF v_evicted_sd_key IS NOT NULL AND v_evicted_row_count > 0 THEN')[1];
    expect(clearBlock).toMatch(/IF v_evicted_sd_key LIKE 'QF-%' THEN/);
    expect(clearBlock).toMatch(/UPDATE quick_fixes\s+SET claiming_session_id = NULL\s+WHERE id = v_evicted_sd_key\s+AND claiming_session_id = p_session_id;/);
  });

  it('the clobber-guard clear runs BEFORE the new-claim UPDATE (so it never clears the just-claimed row)', () => {
    const clearIdx = migration.indexOf('IF v_evicted_sd_key IS NOT NULL AND v_evicted_row_count > 0 THEN');
    const newClaimIdx = migration.indexOf('New-claim UPDATE intentionally does NOT set worktree_path');
    expect(clearIdx).toBeGreaterThan(-1);
    expect(newClaimIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeLessThan(newClaimIdx);
  });

  it('preserves every pre-existing terminal-status / live-peer / silenced-peer guard verbatim', () => {
    expect(migration).toMatch(/'error', 'sd_terminal_status'/);
    expect(migration).toMatch(/'error', 'claimed_by_live_peer'/);
    expect(migration).toMatch(/'error', 'claimed_by_silenced_peer'/);
    expect(migration).toMatch(/'error', 'blocking_conflict'/);
    expect(migration).toMatch(/claim_gate_client_version = p_client_gate_version/); // FR-2 of the prior SD, untouched
  });

  // LEAD validation-agent (2026-09-03) caught a real regression in this migration's first
  // draft: it was built from a 9-day-stale before-snapshot and silently dropped three guards
  // shipped by SD-LEO-INFRA-BLOCK-TEST-SESSION-001 and SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001.
  // The migration was rebuilt from a fresh `pg_get_functiondef` fetch and diffed line-for-line
  // against that fetch (.artifacts/claim_sd.live.current.sql) to confirm ONLY the three intended
  // changes were made. These assertions guard the three previously-dropped guards specifically.
  it('preserves the phantom-session guard (SD-LEO-INFRA-BLOCK-TEST-SESSION-001) -- dropped from this migration\'s first draft, caught by LEAD validation-agent', () => {
    expect(migration).toMatch(/'error', 'phantom_session'/);
    expect(migration).toMatch(/IF NOT EXISTS \(SELECT 1 FROM claude_sessions WHERE session_id = p_session_id\) THEN/);
  });

  it('preserves the QF live-foreign-peer guard and started_at stamp (SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001, shipped 2026-08-28, after the stale before-snapshot)', () => {
    expect(migration).toMatch(/v_qf_claiming_id\s+text;/);
    expect(migration).toMatch(/v_qf_claim_hb_age\s+numeric;/);
    expect(migration).toMatch(/\[CLAIM_LIVE_PEER\] Quick-fix %s is claimed by LIVE session/);
    expect(migration).toMatch(/started_at = COALESCE\(started_at, NOW\(\)\)/);
  });

  it('reports evicted_sd_key on the success response for observability', () => {
    expect(migration).toMatch(/'evicted_sd_key', v_evicted_sd_key/);
  });

  it('emits a post-migration overload-count verification guard', () => {
    expect(migration).toMatch(/expected exactly 1 claim_sd overload/);
  });

  // Deep-tier adversarial review (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A, /ship): the preceding
  // SELECT and the claim-switch UPDATE are two separate statements with no row lock between
  // them, so a concurrent retry for the same p_session_id could leave v_evicted_sd_key stale
  // relative to what the UPDATE actually affects. GET DIAGNOSTICS ... ROW_COUNT closes that gap
  // by requiring the symmetric-clear block to also confirm the UPDATE affected a row.
  it('guards the symmetric-clear block with GET DIAGNOSTICS ROW_COUNT, not just the stale pre-UPDATE SELECT value', () => {
    expect(migration).toMatch(/v_evicted_row_count\s+integer;/);
    const updateIdx = migration.indexOf("released_reason = 'claim_switch'");
    const rowCountIdx = migration.indexOf('GET DIAGNOSTICS v_evicted_row_count = ROW_COUNT;');
    const clearIdx = migration.indexOf('IF v_evicted_sd_key IS NOT NULL AND v_evicted_row_count > 0 THEN');
    expect(rowCountIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(-1);
    // GET DIAGNOSTICS must run immediately after the claim-switch UPDATE (else it reads the
    // row count of some unrelated later statement) and before the guard that consumes it.
    expect(updateIdx).toBeLessThan(rowCountIdx);
    expect(rowCountIdx).toBeLessThan(clearIdx);
  });

  it('SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A criterion #2 proof: the new regression check genuinely fails against the PRE-FIX migration text, so it is not a vacuous pass', () => {
    const preFixMigration = loadMigration('20260712_claim_sd_claim_switch_clobber_guard.sql');
    const preFixUpdateIdx = preFixMigration.indexOf("released_reason = 'claim_switch'");
    expect(preFixUpdateIdx).toBeGreaterThan(-1);
    const preFixClaimSwitchStatement = preFixMigration.slice(
      preFixUpdateIdx,
      preFixMigration.indexOf(';', preFixUpdateIdx) + 1
    );
    // This is the exact assertion from the "declares v_evicted_sd_key..." test above,
    // run against the OLD file: it must FAIL there (the bug is present) and PASS above
    // (the fix is present) -- proving the check discriminates the two, not just parrots one.
    expect(preFixClaimSwitchStatement).toMatch(/RETURNING sd_key INTO v_evicted_sd_key/);
    expect(preFixMigration.indexOf('SELECT sd_key INTO v_evicted_sd_key')).toBe(-1);
  });
});
