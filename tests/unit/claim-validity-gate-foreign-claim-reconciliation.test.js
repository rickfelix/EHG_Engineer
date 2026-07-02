/**
 * SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-4): foreign_claim
 * reconciliation in claim-validity-gate.js.
 *
 * Source-pin style test (mirrors tests/unit/claim-validity-gate-sd-key-drift.test.js's
 * established convention for this file): assertValidClaim has heavy environment/identity
 * resolution that makes a full live-execution mock brittle for a CJS-dynamic-require-based
 * addition (_require('./claim/wip-detector.js') bypasses vitest's ESM vi.mock interception).
 * Pins the reconciliation SHAPE directly in the source instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE_PATH = resolve(__dirname, '..', '..', 'lib/claim-validity-gate.js');
const src = readFileSync(GATE_PATH, 'utf8');

describe('TS-4: foreign_claim reconciliation fires BEFORE the hard-fail throw', () => {
  it('the reconciliation block appears before the foreign_claim ClaimIdentityError throw', () => {
    const reconcileIdx = src.indexOf('foreign_claim RECONCILED');
    const throwIdx = src.indexOf("reason: 'foreign_claim',");
    expect(reconcileIdx).toBeGreaterThan(0);
    expect(throwIdx).toBeGreaterThan(0);
    expect(reconcileIdx).toBeLessThan(throwIdx);
  });

  it('loads hasWip from the wip-detector module', () => {
    expect(src).toMatch(/const\s*\{\s*hasWip\s*\}\s*=\s*_require\(['"]\.\/claim\/wip-detector\.cjs['"]\)/);
  });

  it('calls hasWip against the calling session\'s own worktree/branch (process.cwd())', () => {
    expect(src).toMatch(/hasWip\(process\.cwd\(\),\s*myBranch,\s*null,\s*\{\s*repoRoot:\s*process\.cwd\(\)\s*\}\)/);
  });

  it('reconciliation only proceeds on a POSITIVE wip.hasWip signal', () => {
    expect(src).toMatch(/if\s*\(\s*wip\.hasWip\s*\)\s*\{/);
  });

  it('the claim update targets claiming_session_id=mySessionId with a CAS guard on the displaced owner', () => {
    expect(src).toMatch(/claiming_session_id:\s*mySessionId,\s*is_working_on:\s*true,\s*active_session_id:\s*mySessionId/);
    expect(src).toMatch(/\.eq\(['"]claiming_session_id['"],\s*displacedOwnerSessionId\)/);
  });

  it('the reconciliation is logged to session_coordination for audit (peer not silently overwritten)', () => {
    expect(src).toMatch(/kind:\s*['"]claim_reconciliation['"]/);
    expect(src).toMatch(/displaced_session:\s*displacedOwnerSessionId/);
  });

  it('the reconciled return shape carries ownership + reason + the displaced owner', () => {
    const returnMatch = src.match(/return\s*\{\s*resolved,\s*sd:\s*\{[\s\S]*?\},\s*ownership:\s*['"]reconciled['"],\s*reason:\s*['"]wip_holder_reconciliation['"],\s*displaced_owner_session:\s*displacedOwnerSessionId\s*\}/);
    expect(returnMatch).toBeTruthy();
  });

  it('is fail-safe: the whole reconciliation attempt is wrapped in try/catch so any error falls through to the original hard-fail', () => {
    const idx = src.indexOf('foreign_claim reconciliation');
    const surrounding = src.slice(idx, idx + 2600);
    expect(surrounding).toMatch(/try\s*\{/);
    expect(surrounding).toMatch(/\}\s*catch\s*\{\s*\/\*\s*fail-safe/i);
  });

  it('the original hard-fail behavior for a genuinely stale attempt is unchanged (still throws ClaimIdentityError with reason foreign_claim)', () => {
    expect(src).toMatch(/throw new ClaimIdentityError\(\{\s*\n\s*reason:\s*['"]foreign_claim['"]/);
  });
});
