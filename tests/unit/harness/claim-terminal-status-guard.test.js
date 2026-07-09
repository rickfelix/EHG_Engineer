// SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 — terminal-status guard across the claim surface.
//
// Orthogonal follow-up to SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001 (sd_not_found existence guard).
// Three layers must refuse claiming a finished/closed item:
//   1. claim_sd RPC (migration)  — universal data-layer backstop (SD + QF)
//   2. lib/claim-guard.mjs       — pre-acquire refusal + accurate terminal banner
//   3. the worker check-in directed-assignment step — purge a stale WORK_ASSIGNMENT whose target went terminal
// formatClaimFailure is exported + pure, so it gets a real functional assertion; the other two
// layers are pinned by static source assertion (CI-runnable, no DB), matching the
// block-claims-cancelled.test.js convention.
//
// SD-ARCH-HOTSPOT-CHECKIN-001: the worker-checkin resolveCheckin monolith was decomposed into an
// ordered step pipeline (lib/checkin/steps/*). The stale-terminal-WORK_ASSIGNMENT purge rung moved
// verbatim from scripts/worker-checkin.cjs into lib/checkin/steps/directed-assignment.cjs (wired as
// step #7 in lib/checkin/steps/index.cjs). The pin below follows the code to its new home.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const guardSrc = fs.readFileSync(path.join(repoRoot, 'lib/claim-guard.mjs'), 'utf-8');
const directedAssignmentSrc = fs.readFileSync(path.join(repoRoot, 'lib/checkin/steps/directed-assignment.cjs'), 'utf-8');
const migrationPath = path.join(repoRoot, 'database/migrations/20260609_claim_sd_terminal_status_guard.sql');
const migSrc = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf-8') : '';

describe('formatClaimFailure renders a terminal banner for sd_terminal_status', () => {
  it('shows a TERMINAL banner naming the status, NOT the foreign-claim banner', async () => {
    const { formatClaimFailure } = await import('../../../lib/claim-guard.mjs');
    const out = formatClaimFailure({ success: false, error: 'sd_terminal_status', status: 'completed' });
    expect(out).toMatch(/TERMINAL/);
    expect(out).toMatch(/completed/);
    expect(out).not.toMatch(/CLAIMED BY ANOTHER SESSION/);
  });

  it('still renders the distinct cancelled banner (no regression)', async () => {
    const { formatClaimFailure } = await import('../../../lib/claim-guard.mjs');
    const out = formatClaimFailure({ success: false, error: 'sd_cancelled', cancelled: true, cancellation_reason: 'x' });
    expect(out).toMatch(/CANCELLED/);
  });

  it('deferred status is named in the terminal banner too', async () => {
    const { formatClaimFailure } = await import('../../../lib/claim-guard.mjs');
    const out = formatClaimFailure({ success: false, error: 'sd_terminal_status', status: 'deferred' });
    expect(out).toMatch(/deferred/);
  });
});

describe('claim-guard.mjs pre-acquire refuses completed/deferred (FAIL-OPEN, preserves cancelled)', () => {
  it('returns sd_terminal_status for completed/deferred, gated fail-open on row+no-error', () => {
    expect(guardSrc).toMatch(/error:\s*['"]sd_terminal_status['"]/);
    // FAIL-OPEN: only a definite terminal status blocks (matches the cancelled guard contract).
    expect(guardSrc).toMatch(/!sdStatusError\s*&&\s*sdStatusRow\s*&&\s*\(sdStatusRow\.status === ['"]completed['"]\s*\|\|\s*sdStatusRow\.status === ['"]deferred['"]\)/);
  });
  it('preserves the cancelled-only sd_cancelled refusal unchanged', () => {
    expect(guardSrc).toMatch(/!sdStatusError\s*&&\s*sdStatusRow\s*&&\s*sdStatusRow\.status === ['"]cancelled['"]/);
    expect(guardSrc).toMatch(/error:\s*['"]sd_cancelled['"]/);
  });
});

describe('directed-assignment step purges a stale terminal WORK_ASSIGNMENT', () => {
  it('checks the assigned SD status and ACKs (purges) when terminal, falling through', () => {
    expect(directedAssignmentSrc).toMatch(/terminalStatus/);
    expect(directedAssignmentSrc).toMatch(/\[['"]completed['"],\s*['"]cancelled['"],\s*['"]deferred['"]\]\.includes\(tgt\.status\)/);
    // It ACKs the stale assignment (purge) rather than re-claiming.
    const idx = directedAssignmentSrc.indexOf('stale_assignment_purged');
    expect(idx).toBeGreaterThan(0);
  });
});

describe('migration 20260609 adds the claim_sd terminal-status guard (SD + QF)', () => {
  it('the migration file exists and is a CREATE OR REPLACE of claim_sd (signature preserved)', () => {
    expect(migSrc.length).toBeGreaterThan(0);
    expect(migSrc).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_sd\(/);
  });
  it('fetches sd.status in the FOR UPDATE SELECT and guards SD terminal states before any write', () => {
    expect(migSrc).toMatch(/SELECT sd\.claiming_session_id, sd\.parent_sd_id, sd\.status/);
    expect(migSrc).toMatch(/IF v_sd_status IN \('completed', 'cancelled', 'deferred'\) THEN/);
    expect(migSrc).toMatch(/'error', 'sd_terminal_status'/);
  });
  it('guards QF terminal states (completed/cancelled/escalated) on the QF path', () => {
    expect(migSrc).toMatch(/SELECT qf\.status INTO v_qf_status FROM quick_fixes qf WHERE qf\.id = p_sd_id FOR UPDATE/);
    expect(migSrc).toMatch(/IF v_qf_status IN \('completed', 'cancelled', 'escalated'\) THEN/);
  });
  it('preserves the predecessor sd_not_found existence guard (no regression)', () => {
    expect(migSrc).toMatch(/'error', 'sd_not_found'/);
    expect(migSrc).toMatch(/\[CLAIM_SD_NOT_FOUND\]/);
  });
});
