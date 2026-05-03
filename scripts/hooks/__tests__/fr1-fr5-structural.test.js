/**
 * FR-1, FR-2, FR-3, FR-4, FR-5 structural invariants
 *
 * SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001
 *
 * These cases pin the structural shape of the FRs that ship as follow-ups to
 * FR-7 (which has its own test file: fr7-dotenv-self-load.test.js). They are
 * source-grep assertions so a future commit cannot accidentally revert any FR
 * without a vitest failure.
 *
 * Maps PRD test scenarios:
 *   TS-002: FR-2 — per-attempt status logs remain debug-gated
 *   TS-003: FR-2 — exhaustion stderr is always-on (no debug gate)
 *   TS-004: FR-3 — /current pointer write is unconditional (not gated on sotOrdering)
 *   TS-005: FR-1+FR-4 — session-tick first-tick POST + 409 idempotency
 *   TS-007: FR-5 — self-kill timer value pinned to (12000, 13500]
 *   TS-008: anti-foot-gun — vi.mock NOT used to simulate clean process.env
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const REPO_ROOT = resolve(__dirname, '../../..');
const HOOK_PATH = resolve(REPO_ROOT, 'scripts/hooks/capture-session-id.cjs');
const TICK_PATH = resolve(REPO_ROOT, 'scripts/session-tick.cjs');
const FR7_TEST_PATH = resolve(__dirname, 'fr7-dotenv-self-load.test.js');
const THIS_TEST_PATH = resolve(__dirname, 'fr1-fr5-structural.test.js');

describe('FR-2: telemetry observability', () => {
  it('TS-002: per-attempt status stderr remains debug-gated', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    // The per-attempt status log MUST stay behind `if (debug)` so happy-path
    // retries do not flood stderr.
    expect(src).toMatch(/if \(debug\) \{\s*\n\s*console\.error\(`SessionStart:capture-session-id: upsert status=/);
    expect(src).toMatch(/if \(debug\) \{\s*\n\s*console\.error\(`SessionStart:capture-session-id: upsert failed attempt=/);
  });

  it('TS-003: exhaustion stderr is always-on (no debug gate)', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    const exhaustIdx = src.indexOf('upsert exhausted ${MAX_ATTEMPTS} attempts');
    expect(exhaustIdx).toBeGreaterThan(0);
    // Look at the 600 chars BEFORE the exhaustion log — that window covers the
    // multi-line FR-2 marker comment block.
    const preceding = src.slice(Math.max(0, exhaustIdx - 600), exhaustIdx);
    // Must contain the FR-2 marker comment so future readers see why unconditional
    expect(preceding).toMatch(/FR-2/);
    expect(preceding).toMatch(/always-on/i);
    // The console.error call must not be wrapped in `if (debug) {` immediately above.
    // Last 80 chars before the call site must NOT contain the gate opening.
    const last80 = src.slice(Math.max(0, exhaustIdx - 80), exhaustIdx);
    expect(last80).not.toMatch(/if \(debug\)/);
  });
});

describe('FR-3: unconditional /current pointer write', () => {
  it('TS-004: /current write block is OUTSIDE if (sotOrdering)', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    // The currentPointer declaration must be at outer scope (not inside if-sotOrdering).
    // Verify by checking the block shape: const currentPointer = ... ; if (sotOrdering) { ... } else { fs.writeFileSync ... }
    expect(src).toMatch(/const currentPointer = path\.join\(markerDir, 'current'\);\s*\n\s*if \(sotOrdering\) \{\s*\n\s*sotAtomicWrite\(currentPointer, sessionId\);\s*\n\s*\} else \{\s*\n\s*fs\.writeFileSync\(currentPointer, sessionId\);\s*\n\s*\}/);
    // FR-3 marker comment must be present
    expect(src).toMatch(/FR-3.*unconditional pointer write/i);
  });
});

describe('FR-1+FR-4: session-tick first-tick INSERT-if-not-exists with race idempotency', () => {
  it('TS-005a: tick has isFirstTick state', () => {
    const src = readFileSync(TICK_PATH, 'utf8');
    expect(src).toMatch(/let\s+isFirstTick\s*=\s*true/);
  });

  it('TS-005b: first-tick branch issues POST with merge-duplicates Prefer header', () => {
    const src = readFileSync(TICK_PATH, 'utf8');
    expect(src).toMatch(/method:\s*'POST'/);
    expect(src).toMatch(/Prefer:\s*'resolution=merge-duplicates,return=minimal'/);
  });

  it('TS-005c: 409 response treated as success (race-on-race idempotency)', () => {
    const src = readFileSync(TICK_PATH, 'utf8');
    // Must check both res.ok AND res.status === 409 for first-tick success path
    expect(src).toMatch(/res\.ok\s*\|\|\s*res\.status\s*===\s*409/);
    // After success/409, isFirstTick must flip to false so subsequent ticks PATCH
    expect(src).toMatch(/isFirstTick\s*=\s*false/);
  });

  it('TS-005d: subsequent ticks (isFirstTick=false) revert to PATCH', () => {
    const src = readFileSync(TICK_PATH, 'utf8');
    // The else branch (steady state) must use PATCH, not POST
    expect(src).toMatch(/\}\s*else\s*\{[\s\S]{0,500}method:\s*'PATCH'/);
  });
});

describe('FR-5: self-kill timer invariant', () => {
  it('TS-007: timer value is in (12000, 13500]', () => {
    const src = readFileSync(HOOK_PATH, 'utf8');
    // Find the top-level setTimeout(resolve, N); inside main()'s Promise wrapper.
    const match = src.match(/setTimeout\(\s*resolve\s*,\s*(\d+)\s*\)/);
    expect(match).not.toBeNull();
    const ms = Number(match[1]);
    expect(ms).toBeGreaterThan(12000);
    expect(ms).toBeLessThanOrEqual(13500);
  });
});

describe('TS-008: anti-foot-gun lint — tests use child_process.spawn, NOT mocking for env', () => {
  // Per VALIDATION risk #3 / reference_vi_mock_masks_broken_import.md,
  // simulating a clean process env via test-framework mocking can mask the very
  // bug FR-7 fixes. Lint scans the FR-7 test (the integration test) and rejects
  // mock-of-process patterns. The structural test file (this one) is exempt
  // because its assertions are pure source-grep with no env simulation at all.
  it('FR-7 integration test does not mock process or process.env', () => {
    const src = readFileSync(FR7_TEST_PATH, 'utf8');
    // Strip line-comments before scanning so descriptive text in comments
    // does not trigger a false-positive against the lint pattern.
    const codeOnly = src.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    expect(codeOnly).not.toMatch(/vi\.mock\s*\(\s*['"](node:)?process['"]\s*\)/);
    expect(codeOnly).not.toMatch(/vi\.spyOn\s*\(\s*process\.env\b/);
    // Positive assertion: FR-7 integration test must use spawnWithCleanEnv helper
    expect(codeOnly).toMatch(/spawnWithCleanEnv\s*\(/);
  });
});
