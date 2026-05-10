/**
 * SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-4) — pid-marker cleanup.
 *
 * The cleanup is inline in scripts/hooks/capture-session-id.cjs (lines ~479-495)
 * and not easily extractable without refactor. We use static-string regression pins
 * (matches the predecessor SDs' pattern for cleanup-line changes) plus a small
 * runtime test that verifies the new file content reflects FR-4.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const captureModulePath = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'capture-session-id.cjs');

describe('FR-4: capture-session-id dead pid-marker cleanup', () => {
  let captureSource;

  it('reads the source file once', () => {
    captureSource = fs.readFileSync(captureModulePath, 'utf8');
    expect(captureSource.length).toBeGreaterThan(1000);
  });

  it('AC-4.1/AC-4.3: source file does NOT call dead.slice(3) outside historical comments', () => {
    captureSource = fs.readFileSync(captureModulePath, 'utf8');
    // Strip lines that look like inline comments referencing the old behavior
    // (// or /* prefix). The test asserts the actual code path no longer calls slice(3).
    const codeOnly = captureSource
      .split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(codeOnly).not.toMatch(/dead\.slice\(\s*3\s*\)/);
  });

  it('AC-4.2: source file contains a comment+block referencing FR-4 and SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001', () => {
    captureSource = fs.readFileSync(captureModulePath, 'utf8');
    expect(captureSource).toMatch(/FR-4/);
    expect(captureSource).toMatch(/SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001/);
  });

  it('regression-pin: the cleanup loop iterates over `dead` directly (no slice retention)', () => {
    captureSource = fs.readFileSync(captureModulePath, 'utf8');
    // The new code must contain `for (const old of dead)` and NOT `for (const old of dead.slice(...))`.
    expect(captureSource).toMatch(/for\s*\(\s*const\s+old\s+of\s+dead\s*\)/);
    expect(captureSource).not.toMatch(/for\s*\(\s*const\s+old\s+of\s+dead\.slice\b/);
  });
});
