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
import fs from 'node:fs';

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

  it('is not whitespace-fooled into losing the canary namespace', () => {
    expect(classifySessionByCallsign('  Canary-pilot  ').kind).toBe('canary');
    // classify stays EXACT-match: it is the TARGETING predicate, and over-matching there would let
    // a drill or kill surface aim at the wrong session. The case-insensitive DENY lives in
    // resolveStartupPromptForCallsign, where under-matching is the dangerous direction. See SEC-1.
    expect(classifySessionByCallsign('canary-pilot').kind).toBe('worker');
  });

  it('the derived boolean does NOT treat unidentifiable as canary (so it is unsafe for the decision)', () => {
    expect(isCanaryCallsign('Canary-pilot')).toBe(true);
    expect(isCanaryCallsign('Charlie')).toBe(false);
    expect(isCanaryCallsign(undefined)).toBe(false); // <- exactly why the decision must use the 3-arm form
  });
});

describe('FR-4 — the canary prefix has exactly ONE declaration', () => {
  // The prefix was declared in four places. The duplication was deliberate and documented:
  // canary-guard.js imports from spawn-control.js, so importing back would be a cycle, and a test
  // asserted the copies AGREED. That test could only ever catch drift AFTER it was written into a
  // copy — it made duplication survivable rather than removing it.
  //
  // startup-prompt-selection.js imports nothing, so it cannot close that cycle: one real source.
  // This asserts the property directly (no other declaration exists) instead of comparing copies.
  const FLEET_DIR = new URL('../../../lib/fleet/', import.meta.url);
  const fs = require('node:fs');
  const DECL = /(?:const|let|var)\s+CANARY_CALLSIGN_PREFIX\s*=\s*['"]/;

  it('no module outside startup-prompt-selection.js declares its own CANARY_CALLSIGN_PREFIX', () => {
    const files = fs.readdirSync(FLEET_DIR).filter((f) => /\.(js|cjs|mjs)$/.test(f));
    expect(files.length).toBeGreaterThan(3); // guard: an empty listing would pass vacuously

    const offenders = files.filter((f) => {
      if (f === 'startup-prompt-selection.js') return false;
      return DECL.test(fs.readFileSync(new URL(f, FLEET_DIR), 'utf8'));
    });
    expect(offenders, `these re-declare the prefix instead of importing it: ${offenders.join(', ')}`).toEqual([]);
  });

  it('and the one declaration is actually there (so the scan above cannot pass by finding nothing)', () => {
    const src = fs.readFileSync(new URL('startup-prompt-selection.js', FLEET_DIR), 'utf8');
    expect(DECL.test(src.replace('export ', ''))).toBe(true);
  });
});

describe('SEC-1 — a case-mismatched canary is DENIED the worker directive', () => {
  const { resolveStartupPromptForCallsign } = require('../../../lib/fleet/startup-prompt-selection.js');
  const { FLEET_WORKER_STARTUP_PROMPT } = require('../../../lib/coordinator/coordination-events.cjs');
  const resolve = (cs) => resolveStartupPromptForCallsign(cs, {
    workerPrompt: FLEET_WORKER_STARTUP_PROMPT, canaryPrompt: null, logFn: () => {},
  });

  // MEASURED by the SECURITY review at all three sites, with a control arm: before this fix,
  // 'canary-pilot' and 'CANARY-pilot' each received the full 1406-byte claiming directive. A
  // one-character typo in a slot name reaches it, and assessCanarySlotNaming is fail-open.
  it.each(['canary-pilot', 'CANARY-pilot', 'CaNaRy-pilot', '  canary-x  '])(
    'denies %j — a misnamed canary must not be able to claim work', (cs) => {
      const r = resolve(cs);
      expect(r.prompt).toBeNull();
      expect(r.prompt).not.toBe(FLEET_WORKER_STARTUP_PROMPT);
      expect(r.reason).toBe('canary_namespace_case_mismatch');
    },
  );

  it('CONTROL: an ordinary worker still receives the directive (the deny is not blanket)', () => {
    expect(resolve('Charlie').prompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
    // and a name merely CONTAINING "canary" is not swept up — the deny is prefix-anchored.
    expect(resolve('Bravo-canary-adjacent').prompt).toBe(FLEET_WORKER_STARTUP_PROMPT);
  });

  it('the exact-prefix canary still resolves through the canary arm, not the mismatch arm', () => {
    const r = resolve('Canary-pilot');
    expect(r.prompt).toBeNull();
    expect(r.reason).toBe('no_canary_prompt_available');
  });
});

describe('SEC-2 — an unsafe sessionId is refused on BOTH path-construction branches', () => {
  const { buildSessionLaunch } = require('../../../lib/fleet/build-session-launch.cjs');
  const os = require('node:os');
  const nodePath = require('node:path');

  // The missing-root branch built the prompt path inline with no charset check, and sessionId can
  // be a DB-sourced resumeUuid. Both branches must refuse.
  it('refuses on the MISSING-root branch (the one that was unguarded)', () => {
    expect(() => buildSessionLaunch({
      role: 'worker', callsign: 'Charlie', startupPrompt: 'x',
      cwd: nodePath.join(os.tmpdir(), '__definitely_missing_dir__'), resumeUuid: '../../../../pwn',
    })).toThrow(/unsafe sessionId/);
  });

  it('CONTROL: a legitimate uuid still builds (the guard is not always-on)', () => {
    const cwd = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'sec2-'));
    expect(() => buildSessionLaunch({
      role: 'worker', callsign: 'Charlie', startupPrompt: 'x', cwd,
      sessionId: '11111111-2222-4333-8444-555555555555',
    })).not.toThrow();
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
