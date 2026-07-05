/**
 * QF-20260705-057: the claim_sd RPC call in claimGuard's Case-3 (new-claim acquisition)
 * unconditionally sent p_client_gate_version (added by SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001's
 * intentionally chairman-apply-gated migration) with no fallback, so any environment where that
 * migration is not yet live gets a hard PGRST202 failure on every new-SD claim. Verified live:
 * a direct RPC call with p_client_gate_version returns PGRST202 with hint
 * "perhaps you meant ... p_force_takeover", confirming the live claim_sd() lacks this param.
 *
 * Static-pin pattern (matching tests/unit/claim-guard-gate-version-stamp.test.js): the whole
 * fleet exercises claimGuard's RPC call live on every claim, so a source-text pin catches a
 * regression in the fallback wiring without needing to mock the Supabase client.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(__dirname, '../../lib/claim-guard.mjs');
const src = readFileSync(SRC_PATH, 'utf8');

describe('claim-guard: claim_sd PGRST202 fallback (QF-20260705-057)', () => {
  function claimGuardBody() {
    const guardStart = src.indexOf('export async function claimGuard');
    expect(guardStart).toBeGreaterThan(0);
    const rpcIdx = src.indexOf("rpc('claim_sd'", guardStart);
    expect(rpcIdx).toBeGreaterThan(guardStart);
    const throwIdx = src.indexOf('claimGuard: claim_sd RPC failed', rpcIdx);
    expect(throwIdx).toBeGreaterThan(rpcIdx);
    return src.slice(rpcIdx, throwIdx);
  }

  test('checks for PGRST202 on p_client_gate_version before treating claimError as fatal', () => {
    const body = claimGuardBody();
    expect(body).toMatch(/claimError\?\.code\s*===\s*['"]PGRST202['"]/);
    expect(body).toMatch(/p_client_gate_version/);
  });

  test('retries claim_sd without p_client_gate_version on that specific error', () => {
    const body = claimGuardBody();
    // Second rpc('claim_sd', ...) call in the fallback branch must omit p_client_gate_version.
    const fallbackIdx = body.indexOf("rpc('claim_sd'", body.indexOf('PGRST202'));
    expect(fallbackIdx).toBeGreaterThan(0);
    const fallbackCall = body.slice(fallbackIdx, body.indexOf('}))', fallbackIdx));
    expect(fallbackCall).not.toMatch(/p_client_gate_version/);
    expect(fallbackCall).toMatch(/p_sd_id:\s*sdKey/);
    expect(fallbackCall).toMatch(/p_session_id:\s*sessionId/);
    expect(fallbackCall).toMatch(/p_track:\s*track/);
  });

  test('a non-PGRST202 claimError still throws (fallback is narrowly scoped)', () => {
    const body = claimGuardBody();
    expect(body).toMatch(/if\s*\(claimError\)\s*\{/);
  });
});
