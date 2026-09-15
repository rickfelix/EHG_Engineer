/**
 * FR-2 / TS-1: pin stability against real git history.
 * SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001
 *
 * Uses .claude/skills/eva-vision.skill.md's own real commit history (6 real commits touching
 * this file, verified via `git log -- <path>`) rather than a synthetic fixture, per the PRD's
 * own acceptance criteria.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCurrentSkillPin,
  readSkillAtPin,
  isCommitObject,
  PinnedReadError,
} from '../../../lib/skills/pinned-skill-read.mjs';

const SKILL_FILE = 'eva-vision.skill.md';
// Two real commits touching .claude/skills/eva-vision.skill.md (one intervening commit also
// touches the file between them), both with valid frontmatter but genuinely different body
// content (verified via `git show <sha>:<path>`).
const EARLIER_COMMIT = '5d984f5b4aa2e84b6d55e49d3daffaae8aa1c491';
const LATER_COMMIT = 'ab6099a8924e8103b0bc6c4b8a8360c300759041'; // HEAD's version of the file

describe('readSkillAtPin (FR-2, TS-1)', () => {
  it('resolves the PRE-change content at the earlier real commit', async () => {
    const skill = await readSkillAtPin(SKILL_FILE, EARLIER_COMMIT);
    expect(skill).not.toBeNull();
    expect(skill.contentHash).toBe(
      'c6e4902d8678c4a1f5f37d2c1bce759d120c142ce68747224994a1f62861bbff'
    );
  });

  it('resolves the POST-change content at the later real commit', async () => {
    const skill = await readSkillAtPin(SKILL_FILE, LATER_COMMIT);
    expect(skill).not.toBeNull();
    expect(skill.contentHash).toBe(
      '40833358c1146e8ef64adc1817f48e960d72b9b64950f596a712055b7cd9f2ae'
    );
  });

  it('the two real pins resolve to genuinely different content', async () => {
    const early = await readSkillAtPin(SKILL_FILE, EARLIER_COMMIT);
    const late = await readSkillAtPin(SKILL_FILE, LATER_COMMIT);
    expect(early.contentHash).not.toBe(late.contentHash);
  });

  it('a later commit editing the file does not change what an earlier pin resolves to', async () => {
    // Simulates the PRD's scenario: role already pinned to EARLIER_COMMIT; LATER_COMMIT exists
    // in history (already merged) but the pin is untouched until an explicit re-pin.
    const stillOldPin = await readSkillAtPin(SKILL_FILE, EARLIER_COMMIT);
    expect(stillOldPin.contentHash).toBe('c6e4902d8678c4a1f5f37d2c1bce759d120c142ce68747224994a1f62861bbff');
  });

  it('throws PinnedReadError for a nonexistent commit', async () => {
    await expect(readSkillAtPin(SKILL_FILE, '0'.repeat(40))).rejects.toBeInstanceOf(PinnedReadError);
  });

  it('throws PinnedReadError for a nonexistent skill path at a real commit', async () => {
    await expect(readSkillAtPin('does-not-exist.skill.md', LATER_COMMIT)).rejects.toBeInstanceOf(PinnedReadError);
  });
});

describe('resolveCurrentSkillPin (FR-2)', () => {
  it('returns a value for which isCommitObject() is true', async () => {
    const pin = await resolveCurrentSkillPin(SKILL_FILE);
    expect(pin).not.toBeNull();
    expect(await isCommitObject(pin)).toBe(true);
  });

  it('returns null for a skill file with no git history', async () => {
    const pin = await resolveCurrentSkillPin('never-existed-skill-file.skill.md');
    expect(pin).toBeNull();
  });
});

describe('path-traversal rejection (adversarial /ship review finding, CRITICAL)', () => {
  const TRAVERSAL_NAMES = [
    '../../CLAUDE.md',
    '../secrets.env',
    'sub/dir/file.skill.md',
    'a\\b.skill.md',
    '..',
  ];

  it.each(TRAVERSAL_NAMES)('readSkillAtPin rejects %s as a skill file name, never reaches git', async (badName) => {
    await expect(readSkillAtPin(badName, LATER_COMMIT)).rejects.toBeInstanceOf(PinnedReadError);
  });

  it.each(TRAVERSAL_NAMES)('resolveCurrentSkillPin rejects %s outright rather than silently returning null', async (badName) => {
    // A bad file name must fail loudly (thrown), NOT be swallowed into the same null result as
    // "this skill genuinely has no history yet" -- those are different conditions.
    await expect(resolveCurrentSkillPin(badName)).rejects.toBeInstanceOf(PinnedReadError);
  });

  it('accepts a plain single-segment file name', async () => {
    await expect(resolveCurrentSkillPin(SKILL_FILE)).resolves.not.toBeNull();
  });
});
