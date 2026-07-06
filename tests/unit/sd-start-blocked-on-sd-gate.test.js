/**
 * QF-20260706-786 — a worker's own claim-TTL-lapse self-heal can clear
 * metadata.requires_human_action (e.g. by re-resolving an EARLIER, unrelated hold) without
 * verifying whether the SD's OWN metadata.blocked_on_sd dependency has actually completed
 * (LIVE-HIT: Bravo self-cleared the fence on SD-LEO-FEAT-MARKETLENS-LANDING-REBUILD-001 at
 * 16:44:51Z, three minutes after FABLE-VENTURE-DESIGN-001 finished — safe by luck only).
 * Fix adds an independent, live-status re-check of metadata.blocked_on_sd, gated on the
 * referenced SD's actual `status` column rather than any boolean flag a self-heal path
 * could clear.
 *
 * Static-pin pattern (mocking-independent), per tests/unit/sd-start-human-action-gate.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '..', '..', 'scripts/sd-start.js'), 'utf8');

describe('QF-20260706-786: sd-start.js metadata.blocked_on_sd claim gate', () => {
  it('defines enforceBlockedOnSdGate, gated on a LIVE strategic_directives_v2 status lookup, that exits(1) when unresolved', () => {
    const start = src.indexOf('async function enforceBlockedOnSdGate');
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 900);
    expect(body).toMatch(/sd\?\.metadata\?\.blocked_on_sd/);
    expect(body).toMatch(/strategic_directives_v2/);
    expect(body).toMatch(/status.*!==.*'completed'/);
    expect(body).toMatch(/process\.exit\(1\)/);
  });

  it('fails open on a query error (never strands a claim on a transient fault)', () => {
    const start = src.indexOf('async function enforceBlockedOnSdGate');
    const body = src.slice(start, start + 900);
    expect(body).toMatch(/if \(error \|\| !data\) return;/);
  });

  it('is called right after enforceHumanActionGate on the initial claim path', () => {
    expect(src).toMatch(/enforceHumanActionGate\(sd, effectiveId\);[^]{0,200}enforceBlockedOnSdGate\(sd, effectiveId\)/);
  });

  it('re-calls the gate after orchestrator child routing reassigns sd to a leaf (parity with enforceHumanActionGate)', () => {
    const idx = src.indexOf('Re-enforce cadence gate against the leaf');
    expect(idx).toBeGreaterThan(0);
    const region = src.slice(idx, idx + 800);
    expect(region).toMatch(/enforceHumanActionGate\(sd, effectiveId\)/);
    expect(region).toMatch(/enforceBlockedOnSdGate\(sd, effectiveId\)/);
  });
});
