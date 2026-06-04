/**
 * SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-6, AC-10) — STATIC GUARD PINNING TEST
 *
 * Pattern from QF-20260508-230 (writer/consumer asymmetry — 9th witness class).
 *
 * This test reads each of the 3 wiring scripts and asserts that the
 * exec-context-guard invariant assertions are present. If a future refactor
 * removes a wiring (or moves it to the wrong place), this test fails BEFORE
 * the change ships — pinning the contract that the harness must enforce its
 * execution-context preconditions at every state-mutation site.
 *
 * Wiring sites pinned (per PRD FR-2/FR-3/FR-4):
 *   - scripts/handoff.js                  → assertCwdValid (FR-2)
 *   - scripts/stale-session-sweep.cjs     → isSweepResetAllowed → assertSweepHandoffGate (FR-3, 3 sites)
 *   - scripts/sd-start.js                 → classifyWorktreeOwnership (FR-4, 2 sites)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..', '..');

function readScript(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 — static guard pinning (FR-6, AC-10)', () => {
  describe('handoff.js (FR-2)', () => {
    const src = readScript('scripts/handoff.js');

    it('imports assertCwdValid + ExecContextError from lib/exec-context-guard.mjs', () => {
      expect(src).toMatch(
        /import\s*\{\s*[^}]*assertCwdValid[^}]*\}\s*from\s*['"`].*exec-context-guard\.mjs['"`]/
      );
    });

    it('calls assertCwdValid() before any state-mutation (i.e., before main() and before claimGuard)', () => {
      const assertIdx = src.indexOf('assertCwdValid()');
      const claimGuardIdx = src.search(/await\s+claimGuard\s*\(/);
      const mainCallIdx = src.search(/^main\s*\(\s*\)\.catch/m);
      expect(assertIdx).toBeGreaterThan(-1);
      // assert is BEFORE both claimGuard and main() invocation
      expect(assertIdx).toBeLessThan(claimGuardIdx);
      expect(assertIdx).toBeLessThan(mainCallIdx);
    });

    it('handles ExecContextError(STALE_CWD) with a clear remediation hint', () => {
      expect(src).toMatch(/STALE_CWD/);
      expect(src).toMatch(/cd to the main repo root|recreate the worktree/);
    });
  });

  describe('stale-session-sweep.cjs (FR-3) — 3 reset sites', () => {
    const src = readScript('scripts/stale-session-sweep.cjs');

    it('lazy-loads exec-context-guard.mjs via dynamic import (CJS↔ESM bridge)', () => {
      expect(src).toMatch(/import\s*\(\s*['"`].*exec-context-guard\.mjs['"`]\s*\)/);
    });

    it('exposes isSweepResetAllowed helper that wraps assertSweepHandoffGate', () => {
      expect(src).toMatch(/async function isSweepResetAllowed/);
      expect(src).toMatch(/assertSweepHandoffGate/);
    });

    it('Site #1 — PHASE_RESET_MAP path (line ~73): gates the .update({ current_phase: resetTo })', () => {
      // Find the function resetSdPhaseOnRelease and assert it contains an
      // isSweepResetAllowed call BEFORE the .update.
      const fnMatch = src.match(/async function resetSdPhaseOnRelease[\s\S]*?\n\}/);
      expect(fnMatch).toBeTruthy();
      const body = fnMatch[0];
      const guardIdx = body.indexOf('isSweepResetAllowed');
      const updateIdx = body.indexOf('.update({ current_phase: resetTo })');
      expect(guardIdx).toBeGreaterThan(-1);
      expect(updateIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(updateIdx);
    });

    it('Site #2 — pending_approval reset (lines 590-597): gates the .update({ status: draft, current_phase: LEAD, ... })', () => {
      // The pending_approval-reset block contains contextLabel='pending_approval-reset'
      expect(src).toMatch(/['"`]pending_approval-reset['"`]/);
      const labelIdx = src.indexOf("'pending_approval-reset'");
      // Look for a .update with status:'draft' + current_phase:'LEAD' after the label
      // (exact whitespace varies by indent level; multiline regex covers both sites).
      const after = src.slice(labelIdx);
      expect(after).toMatch(/\.update\(\s*\{[^}]*status:\s*'draft'[^}]*current_phase:\s*'LEAD'/s);
    });

    it('Site #3 — phantom in_progress reset (lines 637-641): gates the .update({ status: draft, current_phase: LEAD, ... })', () => {
      expect(src).toMatch(/['"`]phantom-in_progress-reset['"`]/);
      const labelIdx = src.indexOf("'phantom-in_progress-reset'");
      const after = src.slice(labelIdx);
      expect(after).toMatch(/\.update\(\s*\{[^}]*status:\s*'draft'[^}]*current_phase:\s*'LEAD'/s);
    });
  });

  describe('sd-start.js (FR-4) — own-vs-foreign worktree differentiation', () => {
    const src = readScript('scripts/sd-start.js');

    // QF-20260604-088 repin: SD-FDBK-INFRA-START-NON-INTERACTIVE-001 (FR-1, 2026-05-28)
    // extracted the duplicated own-conflict re-attach logic into the pure
    // decideOwnConflictReattach(), which now wraps classifyWorktreeOwnership +
    // the already_checked_out gate internally. sd-start.js wires that wrapper,
    // so the pin follows the wiring to its current name (stays fail-closed).
    it('imports decideOwnConflictReattach from lib/exec-context-guard.mjs', () => {
      expect(src).toMatch(
        /import\s*\{\s*decideOwnConflictReattach\s*\}\s*from\s*['"`].*exec-context-guard\.mjs['"`]/
      );
    });

    it('preserves classifyWorktreeFailure (existing extended classifier still used — no parallel base classifier)', () => {
      expect(src).toMatch(/classifyWorktreeFailure/);
      // Must NOT directly import classifyWorktreeError from lib/worktree-manager.js
      // (TR-2: extend the existing extended classifier, do not introduce parallel base calls)
      expect(src).not.toMatch(
        /import\s*\{\s*classifyWorktreeError\s*\}\s*from\s*['"`].*worktree-manager(\.js|\.mjs)?['"`]/
      );
    });

    // QF-20260604-088 repin: the `already_checked_out` code-gate is now encapsulated
    // inside decideOwnConflictReattach() (guard module), so it no longer appears as a
    // literal at the wiring site — pin the wrapper call + recoverable exit instead.
    it('Site #1 — creation-failure path: calls decideOwnConflictReattach and exits 2 (recoverable, claim preserved) on own', () => {
      // Find the block where releaseClaimOnWorktreeFailure('creation') is called
      const idx = src.indexOf("releaseClaimOnWorktreeFailure('creation')");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(Math.max(0, idx - 2000), idx);
      expect(block).toMatch(/decideOwnConflictReattach/);
      expect(block).toMatch(/process\.exit\(2\)/);
      expect(block).toMatch(/Claim PRESERVED/);
    });

    it('Site #2 — resolution-error path: calls decideOwnConflictReattach and exits 2 (recoverable) on own', () => {
      const idx = src.indexOf("releaseClaimOnWorktreeFailure('resolution')");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(Math.max(0, idx - 2000), idx);
      expect(block).toMatch(/decideOwnConflictReattach/);
      expect(block).toMatch(/process\.exit\(2\)/);
    });
  });

  describe('writer/consumer asymmetry canary (FR-7, AC-11) — addresses PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001', () => {
    it('all 4 named exports of lib/exec-context-guard.mjs are referenced by at least one wiring script', () => {
      // Read the module's exports
      const modSrc = readScript('lib/exec-context-guard.mjs');
      // QF-20260604-088: classifyWorktreeOwnership is now an internal helper wrapped by
      // decideOwnConflictReattach (the export sd-start.js actually wires) — pin the wrapper.
      const exports = ['assertCwdValid', 'assertSweepHandoffGate', 'decideOwnConflictReattach', 'detectOrphanWorktreeFromMerge'];
      for (const name of exports) {
        // Match: `export function`, `export async function`, `export class`,
        // `export const`, OR `name` listed inside a brace-grouped re-export.
        expect(modSrc).toMatch(
          new RegExp(`export\\s+(?:async\\s+)?(?:function|class|const)\\s+${name}|^\\s*${name}[,}]`, 'm')
        );
      }

      // Each export is consumed somewhere in scripts/ or post-merge-worktree-cleanup
      const consumers = [
        readScript('scripts/handoff.js'),
        readScript('scripts/stale-session-sweep.cjs'),
        readScript('scripts/sd-start.js'),
      ];
      const allConsumerSrc = consumers.join('\n');

      // assertCwdValid → handoff.js
      expect(allConsumerSrc).toMatch(/assertCwdValid/);
      // assertSweepHandoffGate → stale-session-sweep
      expect(allConsumerSrc).toMatch(/assertSweepHandoffGate/);
      // decideOwnConflictReattach → sd-start (wraps classifyWorktreeOwnership internally)
      expect(allConsumerSrc).toMatch(/decideOwnConflictReattach/);
      // detectOrphanWorktreeFromMerge → post-merge-worktree-cleanup.js
      // SD-FDBK-INFRA-WORKTREE-AUTO-REMOVED-001 (FR-2): the detector is now WIRED
      // into post-merge-worktree-cleanup.js (cleanupOrphanFromMergeOutput), which
      // routes the orphaned worktree through the claim-aware cleanupWorktreeByPath.
      // Canary PROMOTED from informational to a hard assertion: it fails if the
      // wiring is ever removed (writer/consumer asymmetry regression guard,
      // PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
      const orphanRef = allConsumerSrc.includes('detectOrphanWorktreeFromMerge') ||
                        readScript('scripts/modules/shipping/post-merge-worktree-cleanup.js')
                          .includes('detectOrphanWorktreeFromMerge');
      expect(orphanRef).toBe(true);
    });
  });
});
