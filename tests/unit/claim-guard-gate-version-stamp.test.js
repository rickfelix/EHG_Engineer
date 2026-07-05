/**
 * SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001 (FR-1/FR-2): every claim write stamps the
 * client's CLAIM_GUARD_CODE_VERSION so the DB-side observe-only trigger
 * (claim_eligibility_observe, migration 20260704_claim_eligibility_observe_trigger.sql) has
 * something to compare against chairman_dashboard_config.metadata.claim_gate_version_floor.
 *
 * Static-pin pattern (matching tests/unit/claim-guard-reaffirm-sd-row.test.js): read source
 * via fs, assert structural patterns. Mocking-independent -- claimGuard's RPC call and
 * reaffirmClaimColumns' direct update are both exercised live by the whole fleet on every
 * claim; a static pin catches a regression without needing to mock the Supabase client.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(__dirname, '../../lib/claim-guard.mjs');
const src = readFileSync(SRC_PATH, 'utf8');

describe('claim-guard: gate-version stamp (SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001)', () => {
  test('declares CLAIM_GUARD_CODE_VERSION as a module-level constant', () => {
    expect(src).toMatch(/const\s+CLAIM_GUARD_CODE_VERSION\s*=\s*\d+/);
  });

  test('reaffirmClaimColumns stamps claim_gate_client_version on the SD-row update', () => {
    const fnStart = src.indexOf('async function reaffirmClaimColumns');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n}\n', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).toMatch(/claim_gate_client_version:\s*CLAIM_GUARD_CODE_VERSION/);
  });

  test('claimGuard passes p_client_gate_version to the claim_sd RPC call', () => {
    const guardStart = src.indexOf('export async function claimGuard');
    expect(guardStart).toBeGreaterThan(0);
    const rpcIdx = src.indexOf("rpc('claim_sd'", guardStart);
    expect(rpcIdx).toBeGreaterThan(guardStart);
    const rpcCallEnd = src.indexOf('});', rpcIdx);
    const rpcCallBody = src.slice(rpcIdx, rpcCallEnd);
    expect(rpcCallBody).toMatch(/p_client_gate_version:\s*CLAIM_GUARD_CODE_VERSION/);
  });
});
