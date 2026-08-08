// QF-20260808-447: adopt the CANONICAL body reader; do not hand-roll a 36th variant.
//
// PREMISE CORRECTION — read this before trusting the ticket. QF-447 was filed (from my own
// report) as a fleet-wide, class-shaped blindness: "the ENTIRE coordinator_request class
// renders text-less". MEASURED, that is FALSE for shipped code. Every worker-facing inbox
// reader already does the dual-read (worker-checkin.cjs:544, fleet-dashboard.cjs x3,
// read-adam-directives.cjs:87, read-solomon-directives.cjs:43) — several fixed by the earlier
// QF-20260703-672. The reader that was actually blind was an ad-hoc one-liner in a worker's
// own loop prompt, which lives in no file in this repo.
//
// The REAL finding is 4 production sites, all secondary/derived paths, never a primary inbox
// render. 3 are fixed here. The 4th is deliberately NOT fixed — see the exclusion test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const R = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

// The canonical reader under test, required through its real module path.
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { readCanonicalBody } = require_(
  path.join(process.cwd(), 'lib/coordination/lane-contract.cjs')
);

describe('readCanonicalBody — the behaviour every adopter inherits', () => {
  it('reads payload.body when present (the canonical location)', () => {
    expect(readCanonicalBody({ payload: { body: 'from payload' }, body: 'from column' }))
      .toBe('from payload');
  });

  it('falls back to the TOP-LEVEL body column — the case that caused the incident', () => {
    // coordinator_request writes here. A reader that only knows payload.body sees '' and
    // concludes the lane is EMPTY rather than that its reader is BROKEN.
    expect(readCanonicalBody({ payload: { kind: 'coordinator_request' }, body: 'top level' }))
      .toBe('top level');
  });

  it('returns empty string (never throws) when payload is null', () => {
    // The pre-fix reply-class site did `row.payload.body` and would THROW here.
    expect(readCanonicalBody({ payload: null, body: undefined })).toBe('');
    expect(readCanonicalBody(null)).toBe('');
  });

  it('treats an EMPTY payload.body as absent and still finds the column', () => {
    expect(readCanonicalBody({ payload: { body: '' }, body: 'column wins' })).toBe('column wins');
  });
});

describe('QF-447 adoption sites', () => {
  const SITES = [
    'scripts/fw3-cmv-rejecter.cjs',
    'scripts/coordinator-relay-drain.cjs',
    'lib/coordinator/reply-class.cjs',
  ];

  it.each(SITES)('%s routes its body read through readCanonicalBody', (f) => {
    const src = R(f);
    expect(src).toContain('readCanonicalBody');
    expect(src).toMatch(/require\(['"][^'"]*lane-contract\.cjs['"]\)/);
  });

  // The EXACT expressions that were blind, per file. Pinning these — rather than asserting a
  // global absence of /row\.payload\.body/ — is deliberate, and the first version of this test
  // got it wrong in an instructive way: a blanket pattern also matched (a) legitimate
  // dual-reads that already carry `|| row.body` (reply-class.cjs:373) and (b) WRITE-side
  // construction building a payload for a NEW row (coordinator-relay-drain.cjs:80,96). Both
  // are correct code the sweep must not touch. A grep for one statement form is not a test for
  // the behaviour, and an over-broad pin would have pushed a future maintainer to "fix" code
  // that was already right.
  const OLD_FORMS = {
    'scripts/fw3-cmv-rejecter.cjs': "(f.payload && f.payload.body) || ''",
    'scripts/coordinator-relay-drain.cjs': "String(row.payload.body || '').slice(0, 60)",
    'lib/coordinator/reply-class.cjs': "(row.subject || row.payload.body || '')",
  };

  it.each(SITES)('%s no longer contains its specific pre-fix blind expression', (f) => {
    // Strip comments: this file and the patched sources both QUOTE the old form in their
    // explanatory prose, and a scan matching its own commentary is the self-satisfying trap.
    const executable = R(f)
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    expect(executable).not.toContain(OLD_FORMS[f]);
  });

  it('preserves the already-correct dual-read and write sites it must NOT touch', () => {
    // Two-sided control: proves the change was surgical, not a blanket rewrite.
    const rc = R('lib/coordinator/reply-class.cjs');
    expect(rc).toContain('(row.payload && row.payload.body) || row.body || null'); // :373 dual-read
    const rd = R('scripts/coordinator-relay-drain.cjs');
    expect(rd).toContain('body: row.payload.body || null'); // :80/:96 payload CONSTRUCTION
  });
});

describe('QF-447 DELIBERATE EXCLUSION — do not "finish the sweep" here', () => {
  it('solomon-advisory computeConsultSignature is NOT converted, on purpose', () => {
    // This site feeds a SHA-256 dedup signature. Adding the top-level body to its fallback
    // chain changes the HASH for every row that currently falls through to row.subject,
    // invalidating every previously-computed signature and silently re-firing dedup.
    // A naive "adopt the helper everywhere" sweep — which is what the ticket literally asked
    // for — would have made that change invisibly. Re-keying a dedup hash is a migration
    // decision, not a QF. This test exists so the exclusion is a recorded decision rather
    // than an oversight someone later "fixes".
    const src = R('scripts/solomon-advisory.cjs');
    expect(src).toContain('function computeConsultSignature');
    const fn = src.slice(
      src.indexOf('function computeConsultSignature'),
      src.indexOf('function computeConsultSignature') + 500
    );
    expect(fn).toContain('createHash');
    expect(fn).not.toContain('readCanonicalBody');
  });
});
