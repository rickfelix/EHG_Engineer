/**
 * SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4) — claim_sd's claim-switch clobber guard.
 *
 * RCA (QF-20260712-310): the claim-switch UPDATE nulls the CALLING session's
 * claude_sessions row when it releases some OTHER SD to claim p_sd_id, but never
 * cleared that evicted SD's own strategic_directives_v2.claiming_session_id /
 * active_session_id / is_working_on — cross-table drift left the evicted SD looking
 * claimed by a session that had moved on. Hermetic source-assertions on the migration
 * file (no DB connection) — mirrors tests/unit/database/trigger-guard-pack.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadMigration(name) {
  return readFileSync(path.resolve(process.cwd(), 'database/migrations', name), 'utf8');
}

const migration = loadMigration('20260712_claim_sd_claim_switch_clobber_guard.sql');

describe('FR-4: claim_sd claim-switch clobber guard migration', () => {
  it('is a CREATE OR REPLACE (unchanged signature, no DROP+CREATE hazard)', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_sd\(/);
    expect(migration).not.toMatch(/DROP FUNCTION/);
  });

  it('declares v_evicted_sd_key and captures it via RETURNING on the claim-switch UPDATE', () => {
    expect(migration).toMatch(/v_evicted_sd_key\s+text;/);
    expect(migration).toMatch(/released_reason = 'claim_switch'/);
    expect(migration).toMatch(/RETURNING sd_key INTO v_evicted_sd_key;/);
  });

  it('clears the evicted SD row only, guarded by claiming_session_id = p_session_id', () => {
    const clearBlock = migration.split('RETURNING sd_key INTO v_evicted_sd_key;')[1];
    expect(clearBlock).toMatch(/IF v_evicted_sd_key IS NOT NULL THEN/);
    expect(clearBlock).toMatch(/UPDATE strategic_directives_v2\s+SET claiming_session_id = NULL,\s+active_session_id = NULL,\s+is_working_on = FALSE/);
    expect(clearBlock).toMatch(/WHERE sd_key = v_evicted_sd_key\s+AND claiming_session_id = p_session_id;/);
  });

  it('clears the evicted QF row via the QF-prefixed branch, same session guard', () => {
    const clearBlock = migration.split('RETURNING sd_key INTO v_evicted_sd_key;')[1];
    expect(clearBlock).toMatch(/IF v_evicted_sd_key LIKE 'QF-%' THEN/);
    expect(clearBlock).toMatch(/UPDATE quick_fixes\s+SET claiming_session_id = NULL\s+WHERE id = v_evicted_sd_key\s+AND claiming_session_id = p_session_id;/);
  });

  it('the clobber-guard clear runs BEFORE the new-claim UPDATE (so it never clears the just-claimed row)', () => {
    const clearIdx = migration.indexOf('IF v_evicted_sd_key IS NOT NULL THEN');
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

  it('reports evicted_sd_key on the success response for observability', () => {
    expect(migration).toMatch(/'evicted_sd_key', v_evicted_sd_key/);
  });

  it('emits a post-migration overload-count verification guard', () => {
    expect(migration).toMatch(/expected exactly 1 claim_sd overload/);
  });
});
