/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A -- lib/fleet/seat-checkpoint-registry.cjs.
 * TS-8 (Michael's "-seat-state-" naming), TS-11 (files outside the fixed registry are never
 * picked up).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SEAT_NAMES, isCandidateFile, listCandidateFiles } = require('../../../lib/fleet/seat-checkpoint-registry.cjs');

describe('SEAT_NAMES', () => {
  it('is the fixed 4-value CAPA-plan role set', () => {
    expect(SEAT_NAMES).toEqual(['adam', 'solomon', 'coordinator', 'michael']);
  });
});

describe('isCandidateFile', () => {
  it('matches the "-session-state-" naming for adam/solomon/coordinator', () => {
    expect(isCandidateFile('adam', 'adam-session-state-d1140357.md')).toBe(true);
    expect(isCandidateFile('solomon', 'solomon-session-state-e3f5188b.md')).toBe(true);
    expect(isCandidateFile('coordinator', 'coordinator-session-state-6acf5a48.md')).toBe(true);
  });

  // TS-8: Michael's real file is "alpha-michael-seat-state-fa09a46d.md" -- the seat token is
  // NOT leading, so the match must be contains-based, never prefix-anchored.
  it('matches the "-seat-state-" naming for michael, with the token not leading', () => {
    expect(isCandidateFile('michael', 'alpha-michael-seat-state-fa09a46d.md')).toBe(true);
  });

  // TS-11: unrelated files outside the fixed registry must never be picked up. isCandidateFile
  // itself only checks "does this filename contain the given seat token + a known naming
  // convention" -- the actual protection against a non-registered name like "golf" is that
  // callers (listCandidateFiles/mirrorSeat) only ever iterate SEAT_NAMES, so a file whose only
  // matching token is an unregistered name (golf) is never even checked against it in production.
  it('a file matching none of the 4 real SEAT_NAMES tokens is rejected for every real seat', () => {
    for (const seatName of SEAT_NAMES) {
      expect(isCandidateFile(seatName, 'golf-session-state-838c05dd.md')).toBe(false);
      expect(isCandidateFile(seatName, 'session-state.md')).toBe(false);
      expect(isCandidateFile(seatName, 'session-state-alpha3-9de94ace.md')).toBe(false);
    }
  });

  it('rejects a file containing the seat token but neither naming convention', () => {
    expect(isCandidateFile('adam', 'adam-notes.md')).toBe(false);
  });

  it('rejects non-.md files', () => {
    expect(isCandidateFile('adam', 'adam-session-state-d1140357.json')).toBe(false);
  });

  it('a seat token substring collision does not falsely match (e.g. "adam" is not a substring of "michael")', () => {
    expect(isCandidateFile('adam', 'alpha-michael-seat-state-fa09a46d.md')).toBe(false);
  });
});

describe('listCandidateFiles', () => {
  // lstatSync stubbed as "not a symlink" for every fake path -- these entries are not backed by
  // real files on disk, so the real fs.lstatSync would ENOENT on them (which the symlink-rejection
  // guard, correctly, treats as "exclude"). A dedicated symlink-rejection test below injects a
  // real lstatSync-shaped stub to exercise the actual rejection path.
  function fakeDir(entries) {
    return { readdirSync: () => entries, lstatSync: () => ({ isSymbolicLink: () => false }) };
  }

  it('returns only files matching the given seat', () => {
    const files = listCandidateFiles('/fake/.claude', 'adam', fakeDir([
      'adam-session-state-d1140357.md',
      'adam-session-state-1fd18159.md',
      'solomon-session-state-e3f5188b.md',
      'golf-session-state-838c05dd.md',
      'session-state.md',
    ]));
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.includes('adam-session-state'))).toBe(true);
  });

  it('finds michael via the seat-state naming', () => {
    const files = listCandidateFiles('/fake/.claude', 'michael', fakeDir([
      'alpha-michael-seat-state-fa09a46d.md',
      'adam-session-state-d1140357.md',
    ]));
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('alpha-michael-seat-state-fa09a46d.md');
  });

  it('returns an empty array (not a throw) when the directory is unreadable', () => {
    const files = listCandidateFiles('/fake/.claude', 'adam', { readdirSync: () => { throw new Error('ENOENT'); } });
    expect(files).toEqual([]);
  });

  it('returns an empty array when no candidates exist for a seat (unstaffed role, silent no-op precondition)', () => {
    const files = listCandidateFiles('/fake/.claude', 'michael', fakeDir(['adam-session-state-d1140357.md']));
    expect(files).toEqual([]);
  });

  // EXEC-TO-PLAN SECURITY evidence (2026-09-06): a symlink named to match a candidate pattern
  // would otherwise have its target's content durably persisted. lstatSync inspects the link
  // itself (never follows it) so a symlinked candidate is silently excluded, same fail-soft
  // posture as an unreadable file.
  it('rejects a candidate that is a symlink, even though its name matches', () => {
    const files = listCandidateFiles('/fake/.claude', 'adam', {
      readdirSync: () => ['adam-session-state-real.md', 'adam-session-state-symlinked.md'],
      lstatSync: (p) => ({ isSymbolicLink: () => p.includes('symlinked') }),
    });
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('adam-session-state-real.md');
  });

  it('excludes (fail-soft) a candidate whose lstat throws, rather than including it unverified', () => {
    const files = listCandidateFiles('/fake/.claude', 'adam', {
      readdirSync: () => ['adam-session-state-gone.md'],
      lstatSync: () => { throw new Error('ENOENT'); },
    });
    expect(files).toEqual([]);
  });
});
