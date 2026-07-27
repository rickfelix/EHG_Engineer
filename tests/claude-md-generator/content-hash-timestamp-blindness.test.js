/**
 * QF-20260727-510 — file_content_hash must be BLIND to the generation timestamp.
 *
 * THE SELF-DEFEATING GUARD. The hash exists precisely to answer "did the content actually
 * change?" — and it was computed over a region that included the `Generated:` timestamp, so it
 * was structurally incapable of ever answering "no". Every regeneration dirtied ~17 tracked
 * files (CLAUDE.md + the CLAUDE_* family + their _DIGEST siblings + the manifest) even when the
 * protocol text was byte-identical.
 *
 * That noise broke two safety mechanisms and one operator action:
 *   - shared-root-freshness pulls only when `git status --porcelain` is clean, so it could
 *     NEVER pull and the shared root could not self-heal;
 *   - tree-currency refuses to spawn from a stale tree that is not safely healable, and
 *     dirty=true is what makes it unhealable;
 *   - observed live: the chairman clicked "Start the coordinator" and got
 *     "[tree-currency] REFUSED ... NOT safely healable (dirty=true)".
 *
 * This records the decision QF-20260726-423(b) deliberately left open: the ROOT SHOULD NOT BE
 * DIRTY. The dominant cause was a two-line generator artifact carrying zero information — not
 * real work in progress — so relaxing the spawn guard would have weakened a real protection to
 * accommodate noise.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { stripVolatileLines } from '../../scripts/modules/claude-md-generator/index.js';

const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').substring(0, 16);

/** A file shaped like the real generated output, parameterised on the volatile values. */
function renderLike({ stamp, isoStamp, commit, hash = 'deadbeefdeadbeef' }) {
  return [
    `<!-- file_content_hash: ${hash} -->`,
    `<!-- generated_at: ${isoStamp} -->`,
    `<!-- git_commit: ${commit} -->`,
    '<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. -->',
    '# CLAUDE.md - LEO Protocol Orchestrator',
    '',
    'Substantive protocol body that did NOT change.',
    '',
    `**Generated**: ${stamp}`,
    `*DIGEST generated: ${stamp}*`,
    `*Generated: ${stamp} | Protocol: LEO 4.4.1 | Source: Database*`,
    '',
  ].join('\n');
}

const A = renderLike({ stamp: '2026-07-27 4:05:26 AM', isoStamp: '2026-07-27T08:05:26.344Z', commit: '690bf02e' });
const B = renderLike({ stamp: '2026-07-27 5:58:59 AM', isoStamp: '2026-07-27T09:58:59.494Z', commit: '36f8a75b', hash: 'cafecafecafecafe' });

describe('stripVolatileLines — every shape enumerated from the LIVE files', () => {
  it('removes all six volatile line shapes', () => {
    const out = stripVolatileLines(A);
    expect(out).not.toMatch(/file_content_hash/);
    expect(out).not.toMatch(/generated_at/);
    expect(out).not.toMatch(/git_commit/);
    expect(out).not.toMatch(/\*\*Generated\*\*:/);
    expect(out).not.toMatch(/DIGEST generated:/);
    expect(out).not.toMatch(/^\*Generated:/m);
  });

  it('KEEPS the substantive body — this is a hashing change, not a content change', () => {
    const out = stripVolatileLines(A);
    expect(out).toMatch(/# CLAUDE\.md - LEO Protocol Orchestrator/);
    expect(out).toMatch(/Substantive protocol body that did NOT change\./);
    expect(out).toMatch(/GENERATED FILE - DO NOT EDIT DIRECTLY/); // the banner is NOT volatile
  });

  it('THE POINT: two renders differing ONLY in timestamps hash identically', () => {
    expect(A).not.toBe(B);                                  // raw bytes differ
    expect(sha16(stripVolatileLines(A))).toBe(sha16(stripVolatileLines(B)));
  });

  it('a REAL content change still changes the hash — the guard is narrowed, not disabled', () => {
    const changed = A.replace('Substantive protocol body that did NOT change.', 'A real protocol edit.');
    expect(sha16(stripVolatileLines(A))).not.toBe(sha16(stripVolatileLines(changed)));
  });

  it('is total on empty/nullish input (never throws inside a write path)', () => {
    expect(stripVolatileLines('')).toBe('');
    expect(stripVolatileLines(null)).toBe('');
    expect(stripVolatileLines(undefined)).toBe('');
  });

  it('handles CRLF, since these files are generated on Windows', () => {
    const crlf = A.replace(/\n/g, '\r\n');
    expect(stripVolatileLines(crlf)).not.toMatch(/\*\*Generated\*\*:/);
    expect(stripVolatileLines(crlf)).toMatch(/Substantive protocol body/);
  });

  it('does not strip a body line that merely MENTIONS a volatile key mid-sentence', () => {
    const body = 'The file_content_hash exists to answer whether content changed.\n';
    expect(stripVolatileLines(body)).toBe(body); // anchored at line start, not a substring match
  });
});
