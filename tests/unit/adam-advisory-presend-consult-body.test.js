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

  // ── QF-20260727-709: the envelope must also say WHO the message is for ───────────────────────
  // Solomon received an advisory addressed to the COORDINATOR, read its second-person prose as
  // aimed at himself, and objected to being credited with editing SD rows — a CONST-002 breach
  // that never happened. The reviewer could not have resolved it: the addressee was never sent.
  describe('addressee (QF-20260727-709)', () => {
    it('names the addressee role and session prefix when one is supplied', () => {
      const out = buildPreSendConsultBody('your dispatch constraints are wrong', {
        role: 'coordinator', sessionId: '1449a046-0f83-4b8e-b6f2-ad26510d0c05',
      });
      expect(out).toContain('coordinator');
      expect(out).toContain('1449a046');           // prefix only — never the full session id
      expect(out).not.toContain('0f83-4b8e');      // …so the header stays scannable
      expect(out).toContain('your dispatch constraints are wrong');
    });

    it('states that second-person pronouns refer to the ADDRESSEE, not the reviewer', () => {
      // Naming the addressee alone still leaves the wrong reading available on a skim, and a skim
      // is exactly what happened. This sentence is the actual repair for the misread.
      const out = buildPreSendConsultBody('you credited me with X', { role: 'coordinator', sessionId: 'abcdef12' });
      expect(out).toMatch(/ADDRESSEE, not to you/);
    });

    it('is BYTE-IDENTICAL to the previous envelope when no addressee is supplied', () => {
      // Back-compat is the whole reason the parameter is optional: every existing caller and the
      // three tests above must be unaffected.
      expect(buildPreSendConsultBody('hello world')).toBe('[PRE-SEND CONSULT] hello world');
      expect(buildPreSendConsultBody('hello world', null)).toBe('[PRE-SEND CONSULT] hello world');
      expect(buildPreSendConsultBody('hello world', undefined)).toBe('[PRE-SEND CONSULT] hello world');
      expect(buildPreSendConsultBody('hello world', {})).toBe('[PRE-SEND CONSULT] hello world');
    });

    it('still preserves the full body when an addressee is present (no truncation regression)', () => {
      // The QF-20260720-729 contract must survive the new header — the header sits INSIDE capBody
      // for exactly this reason, so it can never be the thing that pushes the tail out.
      const body = 'x'.repeat(350) + 'VISIBLE_TAIL';
      const out = buildPreSendConsultBody(body, { role: 'coordinator', sessionId: 'abcdef12' });
      expect(out).toContain('VISIBLE_TAIL');
    });

    it('degrades sensibly on a partial addressee rather than emitting undefined', () => {
      expect(buildPreSendConsultBody('b', { role: 'solomon' })).toContain('solomon');
      expect(buildPreSendConsultBody('b', { role: 'solomon' })).not.toMatch(/undefined/);
      expect(buildPreSendConsultBody('b', { sessionId: 'abcdef12' })).not.toMatch(/undefined/);
      expect(buildPreSendConsultBody('b', 'coordinator')).toContain('coordinator');
    });
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
