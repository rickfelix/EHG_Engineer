/**
 * SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-1, FR-2, FR-6) — static, DB-free migration-shape
 * assertions. The live-behavior counterpart (tests/database/claim-sd-quickfix-evict-reset-
 * refuse.test.js) depends on a chairman-gated production apply and is network-gated in routine
 * CI runs (db-tier guard); this file pins the SQL's actual shape so a regression is caught even
 * when the live-integration test cannot run, matching the tests/unit/harness/
 * claim-terminal-status-guard.test.js convention (static source assertion, CI-runnable, no DB).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const migrationPath = path.join(repoRoot, 'database/migrations/20260913_claim_sd_quickfix_evict_reset_refuse.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('claim_sd quick_fixes evict-reset/refuse-mid-CI migration shape', () => {
  it('carries the required chairman-apply header (no Adam-delegated path covers a function rewrite)', () => {
    expect(sql).toMatch(/^-- @approved-by: [^\n]+@[^\n]+$/m);
  });

  it('(FR-1) resets status to open in the SAME UPDATE that clears the quick_fixes claim', () => {
    const qfUpdate = sql.match(/UPDATE quick_fixes\s+SET claiming_session_id = NULL,\s*\n\s*status = 'open'[\s\S]{0,400}?;/);
    expect(qfUpdate).toBeTruthy();
    expect(qfUpdate[0]).toMatch(/WHERE id = v_evicted_sd_key/);
    expect(qfUpdate[0]).toMatch(/AND claiming_session_id = p_session_id/);
  });

  it('(FR-2) the reset UPDATE also guards on pr_url/commit_sha being NULL (defense-in-depth)', () => {
    const qfUpdate = sql.match(/UPDATE quick_fixes\s+SET claiming_session_id = NULL,\s*\n\s*status = 'open'[\s\S]{0,400}?;/);
    expect(qfUpdate[0]).toMatch(/AND pr_url IS NULL/);
    expect(qfUpdate[0]).toMatch(/AND commit_sha IS NULL/);
  });

  it('(FR-2) refuses via an early RETURN before the claude_sessions claim-switch UPDATE runs, not a post-hoc check', () => {
    const refusalIdx = sql.indexOf("'claim_switch_refused_mid_ci'");
    const claimSwitchUpdateIdx = sql.indexOf('released_reason = \'claim_switch\'');
    expect(refusalIdx).toBeGreaterThan(-1);
    expect(claimSwitchUpdateIdx).toBeGreaterThan(-1);
    expect(refusalIdx).toBeLessThan(claimSwitchUpdateIdx);
  });

  it('(FR-2) the refusal pre-check row-locks the evicted quick_fixes row (FOR UPDATE), closing the TOCTOU gap', () => {
    const precheck = sql.match(/SELECT pr_url, commit_sha INTO[\s\S]{0,300}?FOR UPDATE;/);
    expect(precheck).toBeTruthy();
    expect(precheck[0]).toMatch(/FROM quick_fixes/);
    expect(precheck[0]).toMatch(/WHERE id = v_evicted_sd_key/);
  });

  it('(FR-6) emits two distinguishable event_types: the existing CLEARED case is unaffected and a new QF-specific one is added', () => {
    expect(sql).toMatch(/CLAIM_SWITCH_QF_EVICTED_RESET_OPEN/);
    expect(sql).toMatch(/CLAIM_SWITCH_EVICTED_CLEARED/);
    expect(sql).toMatch(/CLAIM_SWITCH_REFUSED_MID_CI/);
    // The audit INSERT chooses between the two clear-case event types via the SAME QF-prefix
    // predicate the reset/clear logic itself uses -- one CASE expression, not two separate inserts.
    expect(sql).toMatch(/CASE WHEN v_evicted_sd_key LIKE 'QF-%' THEN 'CLAIM_SWITCH_QF_EVICTED_RESET_OPEN' ELSE 'CLAIM_SWITCH_EVICTED_CLEARED' END/);
  });

  it('scope boundary: the strategic_directives_v2 eviction branch has no status literal added (quick_fixes-only per LEAD correction)', () => {
    const sdBranch = sql.match(/UPDATE strategic_directives_v2\s+SET claiming_session_id = NULL,[\s\S]{0,300}?;/);
    expect(sdBranch).toBeTruthy();
    expect(sdBranch[0]).not.toMatch(/status = 'open'/);
  });

  it('signature is unchanged (still 5 args) -- CREATE OR REPLACE, no DROP', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_sd\(p_sd_id text, p_session_id text, p_track text, p_force_takeover boolean DEFAULT false, p_client_gate_version integer DEFAULT NULL::integer\)/);
    expect(sql).not.toMatch(/DROP FUNCTION public\.claim_sd/);
  });

  it('the post-migration verification block still checks exactly one overload exists', () => {
    expect(sql).toMatch(/expected exactly 1 claim_sd overload/);
  });
});
