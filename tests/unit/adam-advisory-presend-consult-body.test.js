/**
 * QF-20260720-729 — the pre-send Solomon consult must give Solomon the FULL outbound body
 * (loss-proof, capBody-bounded, fail-loud on overflow), not a silent .slice(0, 300) fragment.
 * Solomon flagged the clip directly ('your packet ends mid-sentence at Two; the findings this
 * consult exists FOR are invisible to me' — advisory 97cf4e3e, recurred ~9x). These tests pin
 * buildPreSendConsultBody so the truncation cannot silently return.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildPreSendConsultBody } = require('../../scripts/adam-advisory.cjs');

describe('buildPreSendConsultBody (QF-20260720-729)', () => {
  it('preserves the tail beyond char 300 (the old slice(0,300) dropped it)', () => {
    // Char 300+ was invisible under the bug. VISIBLE_TAIL sits at index ~370 — it MUST survive.
    const body = 'x'.repeat(350) + 'VISIBLE_TAIL';
    const out = buildPreSendConsultBody(body);
    expect(out).toContain('VISIBLE_TAIL');
    expect(out.length).toBeGreaterThan(300); // not truncated to a 300-char fragment
  });

  it('prefixes the consult marker inside the cap (prefix + body, tail intact)', () => {
    const out = buildPreSendConsultBody('hello world');
    expect(out).toBe('[PRE-SEND CONSULT] hello world');
  });

  it('fails LOUD on genuine overflow instead of silently clipping (loss-proof contract)', () => {
    // > 4096-char hard cap => capBody throws BODY_TOO_LONG; the degrade-safe caller fails OPEN
    // (consult skipped) rather than consulting on a misleading fragment.
    let thrown;
    try { buildPreSendConsultBody('a'.repeat(5000)); } catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    expect(thrown.code).toBe('BODY_TOO_LONG');
    expect(thrown.message).toMatch(/4096-char hard cap/);
  });

  it('handles null/undefined body without emitting the literal "null"/"undefined"', () => {
    const outNull = buildPreSendConsultBody(null);
    const outUndef = buildPreSendConsultBody(undefined);
    expect(outNull).toBe('[PRE-SEND CONSULT] ');
    expect(outUndef).toBe('[PRE-SEND CONSULT] ');
  });
});
