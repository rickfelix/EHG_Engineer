/**
 * SD-FDBK-INFRA-REFERENCE-KEYED-FEEDBACK-001
 * Pure unit tests for the reference-keyed feedback reconciler.
 * No DB, no git — extractor / matcher / scan / argv are all pure.
 */
import { describe, it, expect } from 'vitest';
import {
  extractFeedbackMentions,
  matchOpenRows,
  scanForMatches,
  parseArgs,
} from '../../scripts/reconcile-feedback-references.js';

const UUID_A = '3bf97d4b-6487-4567-9a9f-1bdb391d40b0';
const UUID_B = '352f3cec-9287-43a6-a7c7-c8567c32e8db';

describe('extractFeedbackMentions (FR-2)', () => {
  it('finds a full UUID mentioned anywhere (not only in a Closes footer)', () => {
    const { full, short } = extractFeedbackMentions(`fix(x): done\n\nfixed by #3950, closes feedback ${UUID_A}.`);
    expect(full.has(UUID_A)).toBe(true);
    // the leading 8 chars of a full UUID must NOT be double-counted as a short id
    expect(short.has('3bf97d4b')).toBe(false);
  });

  it('finds a standalone 8-char prefix mention', () => {
    const { full, short } = extractFeedbackMentions('see 3bf97d4b for context (ref harness backlog)');
    expect(short.has('3bf97d4b')).toBe(true);
    expect(full.size).toBe(0);
  });

  it('ignores non-id tokens and short runs', () => {
    const { full, short } = extractFeedbackMentions('PR #3954 bumped vitest 4.1.4; abc123 deadbe (7chars: deadbee)');
    expect(full.size).toBe(0);
    expect(short.has('deadbee')).toBe(false); // 7 chars, not 8
  });

  it('is safe on empty / non-string input', () => {
    expect(extractFeedbackMentions('').full.size).toBe(0);
    expect(extractFeedbackMentions(undefined).short.size).toBe(0);
  });
});

describe('matchOpenRows (FR-3)', () => {
  const open = [{ id: UUID_A }, { id: UUID_B }];

  it('matches a full-UUID mention to an open row exactly', () => {
    const { matched } = matchOpenRows({ full: new Set([UUID_A]), short: new Set() }, open);
    expect(matched).toEqual([UUID_A]);
  });

  it('does not match a full UUID that is not an open row', () => {
    const { matched } = matchOpenRows({ full: new Set(['00000000-0000-0000-0000-000000000000']), short: new Set() }, open);
    expect(matched).toEqual([]);
  });

  it('matches a unique 8-char prefix', () => {
    const { matched } = matchOpenRows({ full: new Set(), short: new Set(['3bf97d4b']) }, open);
    expect(matched).toEqual([UUID_A]);
  });

  it('skips an ambiguous prefix (>1 open row), never resolves it', () => {
    const open2 = [{ id: 'abcdef12-0000-0000-0000-000000000001' }, { id: 'abcdef12-0000-0000-0000-000000000002' }];
    const { matched, skipped } = matchOpenRows({ full: new Set(), short: new Set(['abcdef12']) }, open2);
    expect(matched).toEqual([]);
    expect(skipped).toEqual([{ prefix: 'abcdef12', count: 2 }]);
  });
});

describe('scanForMatches (FR-2/FR-3) — attribution + strength', () => {
  const open = [{ id: UUID_A }, { id: UUID_B }];

  it('marks a Closes-footer match as STRONG and attributes the sha', () => {
    const { byId } = scanForMatches([{ sha: 'aaaaaaa1', body: `fix: thing\n\nCloses feedback ${UUID_A}` }], open);
    expect(byId.get(UUID_A).strong).toBe(true);
    expect([...byId.get(UUID_A).shas]).toEqual(['aaaaaaa1']);
    expect(byId.has(UUID_B)).toBe(false); // never referenced
  });

  it('marks a bare mention (no footer) as WEAK — the false-positive guard', () => {
    // Real-world shape: a commit that explicitly did NOT fix the row.
    const { byId } = scanForMatches([{ sha: 'bbbbbbb2', body: `out of scope -> feedback ${UUID_A} (still new)` }], open);
    expect(byId.get(UUID_A).strong).toBe(false);
  });

  it('a short-prefix mention is WEAK (never strong)', () => {
    const { byId } = scanForMatches([{ sha: 'ccccccc3', body: 'ref 3bf97d4b again' }], open);
    expect(byId.get(UUID_A).strong).toBe(false);
  });

  it('an id with both a mention commit and a footer commit is STRONG (footer wins)', () => {
    const commits = [
      { sha: 'm1', body: `note feedback ${UUID_A}` },             // weak
      { sha: 'm2', body: `chore: x\n\nCloses feedback ${UUID_A}` }, // strong
    ];
    const { byId } = scanForMatches(commits, open);
    expect(byId.get(UUID_A).strong).toBe(true);
    expect([...byId.get(UUID_A).shas].sort()).toEqual(['m1', 'm2']);
  });

  it('TS-7 never-age-based: an open row with NO reference is never matched', () => {
    const { byId } = scanForMatches([{ sha: 'd1', body: 'totally unrelated work' }], open);
    expect(byId.size).toBe(0);
  });

  it('records ambiguous short prefixes per commit instead of matching', () => {
    const open2 = [{ id: 'abcdef12-0000-0000-0000-000000000001' }, { id: 'abcdef12-0000-0000-0000-000000000002' }];
    const { byId, ambiguous } = scanForMatches([{ sha: 'e1', body: 'ref abcdef12' }], open2);
    expect(byId.size).toBe(0);
    expect(ambiguous).toEqual([{ prefix: 'abcdef12', count: 2, sha: 'e1' }]);
  });
});

describe('parseArgs (TR-4 / FR-4)', () => {
  it('defaults to dry-run, harness_backlog, limit 500, includeMentions off', () => {
    const o = parseArgs([]);
    expect(o.apply).toBe(false);
    expect(o.includeMentions).toBe(false);
    expect(o.category).toBe('harness_backlog');
    expect(o.limit).toBe(500);
    expect(o.json).toBe(false);
    expect(o.since).toBeNull();
  });

  it('parses --apply, --include-mentions, --category, --limit, --since, --json (space and = forms)', () => {
    const o = parseArgs(['--apply', '--include-mentions', '--category', 'all', '--limit=50', '--since', 'v1.0', '--json']);
    expect(o.apply).toBe(true);
    expect(o.includeMentions).toBe(true);
    expect(o.category).toBe('all');
    expect(o.limit).toBe(50);
    expect(o.since).toBe('v1.0');
    expect(o.json).toBe(true);
  });
});
