/**
 * SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001 — witness + regression suite for the sd_type-aware
 * venture-prefix resolver. Proves an ambient venture (VENTURE env var OR active session) is
 * NEVER stamped onto a legitimate-no-venture SD type, while explicit intent and genuine venture
 * work are unaffected. Plus a meta-test that derives the call-site list from the source so a
 * future 7th call site cannot silently reintroduce the leak.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { resolveVenturePrefix } from '../../../scripts/leo-create-sd.js';

// Test seam: simulate "an ambient venture is active in the session" without a live DB.
const ambient = (name = 'DataDistill') => ({ getActiveVenture: async () => ({ name }) });
const noAmbient = { getActiveVenture: async () => null };

describe('SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001: resolveVenturePrefix sd_type-awareness', () => {
  let savedVenture;
  beforeEach(() => { savedVenture = process.env.VENTURE; delete process.env.VENTURE; });
  afterEach(() => {
    if (savedVenture === undefined) delete process.env.VENTURE;
    else process.env.VENTURE = savedVenture;
  });

  // (a) core fix — infrastructure + ambient session venture present → NO prefix
  it('(a) suppresses the ambient session venture for an infrastructure SD', async () => {
    const prefix = await resolveVenturePrefix(null, 'infrastructure', ambient('DataDistill'));
    expect(prefix).toBeNull();
  });

  // (b) explicit --venture overrides suppression for a no-venture type
  it('(b) honors an explicit --venture flag even for a no-venture type', async () => {
    const prefix = await resolveVenturePrefix('Acme Labs', 'infrastructure', ambient('DataDistill'));
    expect(prefix).toBe('ACME-LABS');
  });

  // (c) no over-correction — genuine venture work (feature) still stamped
  it('(c) still stamps the ambient venture for a genuine venture type (feature)', async () => {
    const prefix = await resolveVenturePrefix(null, 'feature', ambient('DataDistill'));
    expect(prefix).toBe('DATADISTILL');
  });

  // (d) alias-normalization proof — raw 'infra' behaves identically to 'infrastructure'
  it("(d) classifies the raw alias 'infra' identically to 'infrastructure'", async () => {
    const prefix = await resolveVenturePrefix(null, 'infra', ambient('DataDistill'));
    expect(prefix).toBeNull();
  });

  // (d-trim) whitespace-padded / mixed-case alias still classifies as no-venture
  it('(d-trim) tolerates whitespace and case in the alias and still suppresses', async () => {
    expect(await resolveVenturePrefix(null, '  infra  ', ambient('DataDistill'))).toBeNull();
    expect(await resolveVenturePrefix(null, 'INFRASTRUCTURE', ambient('DataDistill'))).toBeNull();
  });

  // (e) no-venture parity for governance and leo
  it('(e) suppresses ambient venture for governance and leo types', async () => {
    expect(await resolveVenturePrefix(null, 'governance', ambient())).toBeNull();
    expect(await resolveVenturePrefix(null, 'leo', ambient())).toBeNull();
  });

  // (g) BOTH ambient sources gated — env-var path is suppressed too (CI/cron leak vector)
  it('(g) suppresses the VENTURE env var for an infrastructure SD', async () => {
    process.env.VENTURE = 'SomeVenture';
    const prefix = await resolveVenturePrefix(null, 'infrastructure', noAmbient);
    expect(prefix).toBeNull();
  });

  // env var still applies to a genuine venture type (proves we only gate no-venture types)
  it('(env-positive) still applies the VENTURE env var for a feature SD', async () => {
    process.env.VENTURE = 'EnvVenture';
    const prefix = await resolveVenturePrefix(null, 'feature', noAmbient);
    expect(prefix).toBe('ENVVENTURE');
  });

  // classification must never throw, even for non-canonical / unknown input
  it('(robustness) never throws for governance/leo/unknown sd_type', async () => {
    await expect(resolveVenturePrefix(null, 'governance', noAmbient)).resolves.toBeNull();
    await expect(resolveVenturePrefix(null, 'zzz-unknown', noAmbient)).resolves.toBeNull();
    await expect(resolveVenturePrefix(null, null, noAmbient)).resolves.toBeNull();
  });
});

describe('SD-FDBK-INFRA-KEY-GENERATOR-LEAKS-001: call-site meta-test (derived from source)', () => {
  it('every resolveVenturePrefix call site threads the sd_type argument', () => {
    const srcPath = fileURLToPath(new URL('../../../scripts/leo-create-sd.js', import.meta.url));
    const src = fs.readFileSync(srcPath, 'utf8');
    const callRegex = /resolveVenturePrefix\(([^)]*)\)/g;
    const offenders = [];
    let m;
    while ((m = callRegex.exec(src)) !== null) {
      const args = m[1];
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      if (before.includes('function ')) continue; // skip the definition
      // A real call MUST pass the sd_type (2nd) argument — i.e. contain a comma.
      if (!args.includes(',')) offenders.push(args.trim() || '(empty)');
    }
    expect(offenders).toEqual([]);
  });

  it('finds the expected number of call sites (6) plus the definition', () => {
    const srcPath = fileURLToPath(new URL('../../../scripts/leo-create-sd.js', import.meta.url));
    const src = fs.readFileSync(srcPath, 'utf8');
    const total = (src.match(/resolveVenturePrefix\(/g) || []).length;
    // 1 definition + 6 call sites. If this changes, a call site was added/removed —
    // update the count AND ensure the new site threads sd_type (see the offender test above).
    expect(total).toBe(7);
  });
});
