/**
 * SD-LEO-INFRA-DEFERRED-STATE-ENTRANCE-001 (FR-1, TS-6/TS-7) — the TARGET_ALREADY_TERMINAL
 * block in scripts/sd-start.js must branch on claimResult.status === 'deferred': the deferred
 * case names npm run sd:unpark and never prints a "Completed:" label; the completed/cancelled
 * case is unchanged (pinned separately by tests/unit/sd-start-terminal-target-no-fallback.js,
 * QF-20260704-825).
 *
 * Static-pin pattern (mocking-independent), matching the sibling QF-20260704-825 test and
 * tests/unit/sd-start-human-action-gate.test.js — this is the established convention for
 * pinning scripts/sd-start.js's own console-output content (see the sibling file for why
 * extracting this into a shared function instead broke that pinned test during EXEC).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '..', '..', 'scripts/sd-start.js'), 'utf8');

describe('TARGET_ALREADY_TERMINAL — deferred branch (FR-1)', () => {
  it('branches on claimResult.status === \'deferred\' inside the TARGET_ALREADY_TERMINAL block', () => {
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    expect(idx).toBeGreaterThan(0);
    const body = src.slice(idx, idx + 900);
    expect(body).toMatch(/claimResult\.status === 'deferred'/);
  });

  it('the deferred branch names npm run sd:unpark via buildUnparkExitCommand, and prints no "Completed:" label', () => {
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    const deferredIdx = src.indexOf("claimResult.status === 'deferred'", idx);
    expect(deferredIdx).toBeGreaterThan(idx);
    // QF-20260912-346 nested an if/else INSIDE the deferred branch (gating the printed
    // remedy on hold ownership), so the first '} else {' after deferredIdx is now that
    // inner else, not the outer deferred-vs-completed boundary. Anchor on text unique to
    // the completed/cancelled branch instead.
    const outerElseAnchor = 'already finished, cannot be (re)claimed';
    const anchorIdx = src.indexOf(outerElseAnchor, deferredIdx);
    expect(anchorIdx).toBeGreaterThan(deferredIdx);
    const elseIdx = src.lastIndexOf('} else {', anchorIdx);
    expect(elseIdx).toBeGreaterThan(deferredIdx);
    const deferredBody = src.slice(deferredIdx, elseIdx);
    expect(deferredBody).toMatch(/buildUnparkExitCommand/);
    expect(deferredBody).not.toMatch(/Completed:/);

    const completedBody = src.slice(elseIdx, elseIdx + 400);
    expect(completedBody).toMatch(/Completed:/);
    expect(completedBody).not.toMatch(/buildUnparkExitCommand/);
  });

  it('imports buildUnparkExitCommand from lib/claim-guard.mjs', () => {
    expect(src).toMatch(/import\s*\{[^}]*buildUnparkExitCommand[^}]*\}\s*from\s*'\.\.\/lib\/claim-guard\.mjs'/);
  });

  it('QF-20260912-346: the deferred branch gates the printed remedy on role-seat/other-session hold', () => {
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    const deferredIdx = src.indexOf("claimResult.status === 'deferred'", idx);
    const elseIdx = src.indexOf('} else {', deferredIdx);
    const deferredBody = src.slice(deferredIdx, elseIdx);
    expect(deferredBody).toMatch(/heldByRoleSeat/);
    expect(deferredBody).toMatch(/heldByOtherSession/);
    expect(deferredBody).toMatch(/ask the coordinator/i);
  });
});
