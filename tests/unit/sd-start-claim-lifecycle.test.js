/**
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 — sd-start.js wire-in tests.
 * Phase 3: 2 insertion points (FR-2 sd_key drift telemetry + FR-3 inbox poll).
 *
 * Static-pin pattern (validation-agent + testing-agent recommended path).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD_START_PATH = resolve(__dirname, '../..', 'scripts/sd-start.js');
const src = readFileSync(SD_START_PATH, 'utf8');

// ── Imports (helper integration) ─────────────────────────────────────────

describe('sd-start.js: imports lifecycle helpers from lib/claim-lifecycle-release.mjs', () => {
  it('imports hasRecentClaimReleased + formatClaimReleasedAbort + detectSdKeyDrift', () => {
    expect(src).toMatch(/import\s*\{\s*hasRecentClaimReleased[^}]*formatClaimReleasedAbort[^}]*detectSdKeyDrift[^}]*\}\s*from\s*['"]\.\.\/lib\/claim-lifecycle-release\.mjs['"]/);
  });
});

// ── FR-3: inbox poll BEFORE assertValidClaim ─────────────────────────────

describe('FR-3: inbox poll fires BEFORE assertValidClaim (AC-3.1, AC-3.4)', () => {
  it('hasRecentClaimReleased call site appears BEFORE the assertValidClaim block', () => {
    const probeIdx = src.indexOf('await hasRecentClaimReleased(');
    const assertIdx = src.indexOf('await assertValidClaim(');
    expect(probeIdx).toBeGreaterThan(0);
    expect(assertIdx).toBeGreaterThan(0);
    expect(probeIdx).toBeLessThan(assertIdx);
  });

  it('aborts with process.exit(1) when probe.recent is true (AC-3.1)', () => {
    const probeIdx = src.indexOf('await hasRecentClaimReleased(');
    const slice = src.slice(probeIdx, probeIdx + 1500);
    expect(slice).toMatch(/claimReleasedProbe\.recent/);
    expect(slice).toMatch(/formatClaimReleasedAbort\(/);
    expect(slice).toMatch(/process\.exit\(1\)/);
  });

  it('AC-3.5: aborts message states "Inbox row remains visible (read-only contract)"', () => {
    const probeIdx = src.indexOf('await hasRecentClaimReleased(');
    const slice = src.slice(probeIdx, probeIdx + 2000);
    expect(slice).toMatch(/read-only contract/i);
  });

  it('inbox probe is fail-OPEN: try/catch with non-fatal log on probeErr (operational resilience)', () => {
    const probeIdx = src.indexOf('await hasRecentClaimReleased(');
    const slice = src.slice(Math.max(0, probeIdx - 200), probeIdx + 2000);
    expect(slice).toMatch(/try\s*\{/);
    expect(slice).toMatch(/catch\s*\(\s*probeErr\s*\)/);
    expect(slice).toMatch(/non-fatal/i);
  });
});

// ── FR-2: sd_key drift telemetry on --force-reclaim path ────────────────

describe('FR-2: sd_key drift telemetry enriches --force-reclaim audit (AC-2.1, AC-2.6)', () => {
  it('detectSdKeyDrift is invoked in the --force-reclaim audit-log enrichment block', () => {
    expect(src).toMatch(/detectSdKeyDrift\(/);
    // Must appear AFTER the forceReclaim flag is processed
    const driftIdx = src.indexOf('detectSdKeyDrift(');
    const forceReclaimIdx = src.indexOf("const forceReclaim = process.argv.includes('--force-reclaim')");
    expect(driftIdx).toBeGreaterThan(forceReclaimIdx);
  });

  it('drift verdict is captured in a variable and forwarded to audit_log details JSON (AC-2.1 telemetry)', () => {
    expect(src).toMatch(/sdKeyDriftVerdict/);
    expect(src).toMatch(/sd_key_drift:\s*sdKeyDriftVerdict/);
  });

  it('drift inspection is wrapped in try/catch — observational, never blocks the override', () => {
    const driftIdx = src.indexOf('detectSdKeyDrift(');
    const slice = src.slice(Math.max(0, driftIdx - 800), driftIdx + 500);
    expect(slice).toMatch(/try\s*\{/);
    expect(slice).toMatch(/catch\s*\(\s*driftErr\s*\)/);
  });

  it('emits operator-facing "✓ sd_key drift detected" message when drift verdict is "drift"', () => {
    const driftIdx = src.indexOf('detectSdKeyDrift(');
    const slice = src.slice(driftIdx, driftIdx + 1200);
    expect(slice).toMatch(/sdKeyDriftVerdict\s*===\s*['"]drift['"]/);
    expect(slice).toMatch(/sd_key drift detected/i);
    expect(slice).toMatch(/--force-reclaim is justified/i);
  });

  it('audit_log details JSON references both prior SD + this SD', () => {
    expect(src).toMatch(/SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001/);
    // Existing "SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001" reference preserved
    expect(src).toMatch(/SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001\+SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001/);
  });
});

// ── Cross-cutting guards ─────────────────────────────────────────────────

describe('sd-start.js wire-in: cross-cutting guards', () => {
  it('NO new claim_version usage in active code (validation-agent P1: Option B compare-and-set)', () => {
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/claim_version/);
  });

  it('FR-3 inbox poll uses target_sd column (NOT subject) — flows from helper signature', () => {
    // sd-start.js calls the helper, not the column directly. Helper test pins the column.
    // This test checks that sd-start.js does NOT pass any explicit column-name to override.
    const probeIdx = src.indexOf('await hasRecentClaimReleased(');
    const callSlice = src.slice(probeIdx, probeIdx + 200);
    expect(callSlice).toMatch(/hasRecentClaimReleased\(\s*effectiveId\s*\)/);
  });

  it('TR-3(c) "own sd_key drift early-detect" was CUT (validation-agent P1) — no early-detect call site', () => {
    // Per validation-agent P1: SD-CROSS-HOST FR-7 already covers own-sd_key drift via
    // session-check-concurrency.js. We do NOT add a new early-detect path here.
    // Verify only TWO insertion points exist (FR-3 inbox + FR-2 force-reclaim audit).
    const calls = src.match(/detectSdKeyDrift\(/g) || [];
    // Exactly 1 detectSdKeyDrift call — only the FR-2 audit enrichment.
    expect(calls.length).toBe(1);
  });
});
