/**
 * SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-D — three-arm selection + newline tripwire.
 *
 * THE ASSERTION THAT MATTERS MOST is the unidentifiable arm. A boolean predicate returns false
 * for a session it cannot identify, and false means "not a canary", which hands that session the
 * CLAIMING WORKER directive. So a two-arm version is not merely less informative — its
 * fallthrough direction is the dangerous one, and it is invisible because "definitely a worker"
 * and "no idea what this is" collapse to the same value.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySessionByCallsign,
  isCanaryCallsign,
  assertSingleLinePrompt,
  MultilinePromptError,
} from '../../../lib/fleet/startup-prompt-selection.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('classifySessionByCallsign — three arms, and the third is the point', () => {
  it('classifies a canary-namespace callsign as canary', () => {
    expect(classifySessionByCallsign('Canary-pilot')).toEqual({ kind: 'canary', callsign: 'Canary-pilot' });
  });

  it('classifies an ordinary callsign as worker', () => {
    expect(classifySessionByCallsign('Charlie')).toEqual({ kind: 'worker', callsign: 'Charlie' });
  });

  it('classifies an UNIDENTIFIABLE session as its own third outcome — never as worker', () => {
    // If any of these returned 'worker' the session would receive the claiming directive.
    for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
      const r = classifySessionByCallsign(bad);
      expect(r.kind, `input ${JSON.stringify(bad)} must not be classified worker`).toBe('unidentifiable');
      expect(r.kind).not.toBe('worker');
    }
  });

  it('the three arms are exhaustive and mutually exclusive', () => {
    const kinds = ['Canary-x', 'Worker-x', ''].map((c) => classifySessionByCallsign(c).kind);
    expect(new Set(kinds).size).toBe(3);
    expect(kinds.every((k) => ['canary', 'worker', 'unidentifiable'].includes(k))).toBe(true);
  });

  it('is not case- or whitespace-fooled into losing the canary namespace', () => {
    expect(classifySessionByCallsign('  Canary-pilot  ').kind).toBe('canary');
    // lower-case 'canary-' is deliberately NOT the namespace — the prefix is exact.
    expect(classifySessionByCallsign('canary-pilot').kind).toBe('worker');
  });

  it('the derived boolean does NOT treat unidentifiable as canary (so it is unsafe for the decision)', () => {
    expect(isCanaryCallsign('Canary-pilot')).toBe(true);
    expect(isCanaryCallsign('Charlie')).toBe(false);
    expect(isCanaryCallsign(undefined)).toBe(false); // <- exactly why the decision must use the 3-arm form
  });
});

describe('assertSingleLinePrompt — the newline tripwire', () => {
  it('passes a single-line prompt through unchanged', () => {
    const p = 'Read .claude/fleet-prompts/abc.txt and follow it exactly.';
    expect(assertSingleLinePrompt(p, { where: 'test' })).toBe(p);
  });

  it('THROWS on an embedded newline, naming what would actually be delivered', () => {
    const p = ['first line', 'second line', 'third'].join('\n');
    let err;
    try { assertSingleLinePrompt(p, { where: 'spawn-control' }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(MultilinePromptError);
    expect(err.details.totalLines).toBe(3);
    expect(err.details.deliveredChars).toBe('first line'.length);
    expect(err.message).toMatch(/TRUNCATED BY cmd\.exe/);
    expect(err.message).toMatch(/spawn-control/);
  });

  it('catches CR and CRLF too, not just LF', () => {
    for (const nl of ['\r', '\r\n']) {
      expect(() => assertSingleLinePrompt(`a${nl}b`, { where: 't' })).toThrow(MultilinePromptError);
    }
  });

  it('rejects a non-string before it can reach argv', () => {
    expect(() => assertSingleLinePrompt(undefined, { where: 't' })).toThrow(MultilinePromptError);
  });

  it('WOULD HAVE CAUGHT THE ORIGINAL DEFECT — fires on the real live constant', () => {
    // This is the regression the whole SD exists for: the shipped worker prompt is multi-line,
    // so passing it as a positional silently delivers only its first line.
    const { FLEET_WORKER_STARTUP_PROMPT } = require('../../../lib/coordinator/coordination-events.cjs');
    expect(FLEET_WORKER_STARTUP_PROMPT.split('\n').length).toBeGreaterThan(1);

    let err;
    try { assertSingleLinePrompt(FLEET_WORKER_STARTUP_PROMPT, { where: 'real constant' }); } catch (e) { err = e; }
    expect(err, 'the tripwire MUST fire on the real constant').toBeInstanceOf(MultilinePromptError);

    // Pin the measured truncation: the delivered slice is a fraction of the whole.
    expect(err.details.deliveredChars).toBeLessThan(err.details.totalChars);
    expect(err.details.deliveredChars / err.details.totalChars).toBeLessThan(0.25);
  });
});
