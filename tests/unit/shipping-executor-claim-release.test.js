/**
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-1 wire-in (AC-1.5):
 * static-pin tests asserting ShippingExecutor.js calls releaseClaimOnPROpen
 * AFTER successful gh pr create AND captures snapshot BEFORE the push.
 *
 * Closure pattern: lib/eva/__tests__/file-claim-detection.test.js (CROSS-HOST FR-7).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHIP_PATH = resolve(__dirname, '../..', 'scripts/modules/shipping/ShippingExecutor.js');
const src = readFileSync(SHIP_PATH, 'utf8');

describe('FR-1 wire-in: ShippingExecutor.js calls releaseClaimOnPROpen post-PR-create (AC-1.5)', () => {
  it('imports captureClaimSnapshot + releaseClaimOnPROpen from lib/claim-lifecycle-release.mjs', () => {
    expect(src).toMatch(/import\s*\{\s*captureClaimSnapshot\s*,\s*releaseClaimOnPROpen\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/lib\/claim-lifecycle-release\.mjs['"]/);
  });

  it('captureClaimSnapshot is invoked BEFORE the gh pr create call', () => {
    const captureIdx = src.indexOf('await captureClaimSnapshot(');
    const ghCreateIdx = src.indexOf('gh pr create');
    expect(captureIdx).toBeGreaterThan(0);
    expect(ghCreateIdx).toBeGreaterThan(0);
    expect(captureIdx).toBeLessThan(ghCreateIdx);
  });

  it('releaseClaimOnPROpen is invoked AFTER result.success=true (post-PR-create) and before recordExecution', () => {
    const releaseIdx = src.indexOf('await releaseClaimOnPROpen(');
    const successIdx = src.indexOf('result.success = true');
    const recordIdx = src.indexOf('recordExecution');
    expect(releaseIdx).toBeGreaterThan(0);
    expect(successIdx).toBeGreaterThan(0);
    expect(recordIdx).toBeGreaterThan(0);
    expect(successIdx).toBeLessThan(releaseIdx);
    expect(releaseIdx).toBeLessThan(recordIdx);
  });

  it('releaseClaimOnPROpen call site is wrapped in try/catch (AC-1.6 partial-failure: warn-log, do not block PR pipeline)', () => {
    const releaseIdx = src.indexOf('await releaseClaimOnPROpen(');
    expect(releaseIdx).toBeGreaterThan(0);
    // Three ordered tokens: try { ... await releaseClaimOnPROpen ... catch (releaseErr).
    const tryIdx = src.lastIndexOf('try {', releaseIdx);
    const catchIdx = src.indexOf('catch (releaseErr)', releaseIdx);
    expect(tryIdx).toBeGreaterThan(0);
    expect(catchIdx).toBeGreaterThan(0);
    expect(tryIdx).toBeLessThan(releaseIdx);
    expect(releaseIdx).toBeLessThan(catchIdx);
    // Try-block opener is reasonably close (within ~5 lines, ~300 chars).
    expect(releaseIdx - tryIdx).toBeLessThan(300);
    // Catch body mentions non-blocking semantics.
    const catchSlice = src.slice(catchIdx, catchIdx + 300);
    expect(catchSlice).toMatch(/non-blocking/i);
  });

  it('release failure logs warn-level (NOT throws) — AC-1.6 partial-failure path', () => {
    const releaseIdx = src.indexOf('await releaseClaimOnPROpen(');
    const slice = src.slice(releaseIdx, releaseIdx + 600);
    expect(slice).toMatch(/console\.warn/);
    // No throw inside the catch
    expect(slice).not.toMatch(/throw\s+(new\s+)?Error/);
  });

  it('snapshot capture uses sd-key derived from branch (feat/SD-... or fix/SD-... pattern)', () => {
    const captureIdx = src.indexOf('await captureClaimSnapshot(');
    expect(captureIdx).toBeGreaterThan(0);
    const slice = src.slice(captureIdx - 400, captureIdx);
    expect(slice).toMatch(/feat\|fix\|chore\|qf/);
    expect(slice).toMatch(/startsWith\(['"]SD-['"]\)/);
  });

  it('only acts on SD-* branches (not QF-* — QF flow uses complete-quick-fix.js claim release)', () => {
    const captureIdx = src.indexOf('await captureClaimSnapshot(');
    const slice = src.slice(captureIdx - 500, captureIdx + 100);
    // Guard ensures we only capture for SD-prefixed keys
    expect(slice).toMatch(/sdKeyFromBranch\.startsWith\(['"]SD-['"]\)/);
  });

  it('NO claim_version usage in active code — Option B compare-and-set on existing columns (validation-agent P1)', () => {
    // Strip docblock comments before grepping — comments may legitimately reference
    // why claim_version is NOT used (validation-agent P1 trace).
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/claim_version/);
  });
});
