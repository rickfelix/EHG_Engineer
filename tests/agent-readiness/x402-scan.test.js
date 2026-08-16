import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scan } from '../../scripts/agent-readiness-x402-scan.mjs';

describe('verify-zero-x402-in-payment-path (US-009)', () => {
  let tmpDir;
  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('AC-009-1: the real payment path (checkout.js, entitlement.js) scans clean', () => {
    const { violations, scannedFiles } = scan();
    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(violations).toHaveLength(0);
  });

  it('AC-009-2/AC-009-3: a fixture with a real x402 import makes scan() fail and names the file+line (proves non-vacuity)', () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'x402-scan-fixture-'));
    const fixtureFile = path.join(tmpDir, 'fixture-payment.js');
    writeFileSync(fixtureFile, "// bad fixture\nimport { X402Client } from 'x402-sdk';\n", 'utf8');

    const { violations } = scan([fixtureFile]);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(2);
    expect(violations[0].text).toContain('x402-sdk');
  });

  it('a clean fixture (no x402 reference) scans with zero violations', () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'x402-scan-fixture-'));
    const fixtureFile = path.join(tmpDir, 'fixture-clean.js');
    writeFileSync(fixtureFile, "import Stripe from 'stripe';\n", 'utf8');

    const { violations } = scan([fixtureFile]);
    expect(violations).toHaveLength(0);
  });
});
