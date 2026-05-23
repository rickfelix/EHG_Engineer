/**
 * Stage 19 — brand-grounded / unregistered venture tolerance.
 *
 * Regression for the "Canvas AI" Stage-19 stall (2026-05-23): a venture renamed
 * off its registered registry key by SD-LEO-FEAT-VENTURE-BRAND-GROUNDED-001 made
 * the sprint-plan analyzer throw VentureNotRegisteredError at routing resolution.
 * The throw left 0 artifacts + empty advisory_data, yet the post-execution hard
 * gate still opened a pending chairman decision — so the venture parked at a
 * content-less gate and the Stage-19 panel spun "Loading Sprint Planning…"
 * indefinitely.
 *
 * resolveStage19Routing must degrade gracefully for a NAMED-but-unregistered
 * venture (no throw), while NEVER silently routing to the 'ehg' default and
 * still failing closed for the null-venture security case (C-SEC-8B).
 */
import { describe, test, expect } from 'vitest';
import { resolveStage19Routing } from '../stage-templates/analysis-steps/stage-19-sprint-planning.js';

const silentLogger = { log() {}, warn() {}, error() {} };

describe('Stage 19 routing — unregistered/brand-grounded venture tolerance', () => {
  test('registered venture ("ehg") resolves normally (no fallback)', () => {
    const routing = resolveStage19Routing('ehg', silentLogger);
    expect(routing.targetApp).toBe('ehg');
    expect(routing.fallback).toBe(false);
  });

  test('unregistered venture ("Canvas AI") degrades gracefully instead of throwing', () => {
    let routing;
    expect(() => {
      routing = resolveStage19Routing('Canvas AI', silentLogger);
    }).not.toThrow();
    // target_application is stamped with the venture's own name — NEVER the
    // silent 'ehg' default the fail-closed rule guards against.
    expect(routing.targetApp).toBe('Canvas AI');
    expect(routing.targetApp).not.toBe('ehg');
    expect(routing.fallback).toBe(true);
    expect(routing.unregistered).toBe(true);
  });

  test('graceful fallback warns loudly (not silent)', () => {
    const warnings = [];
    const logger = { log() {}, warn: (...a) => warnings.push(a), error() {} };
    resolveStage19Routing('Some Unregistered Venture XYZ', logger);
    expect(warnings.length).toBeGreaterThan(0);
    expect(String(warnings[0][0])).toMatch(/not in registry/i);
  });

  test('null venture name still fails closed (no silent EHG via omitted name)', () => {
    // sd_type 'feature' is NOT a legitimate no-venture type, so a null name must
    // still throw. resolveStage19Routing only softens the registry-miss case for
    // a NAMED venture — it does not reopen the C-SEC-8B null-venture hole.
    expect(() => resolveStage19Routing(null, silentLogger)).toThrow();
  });
});
