/**
 * FR-1 / TS-4: parseSkillContent() extraction from parseSkillFile() is behavior-preserving.
 * SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSkillFile, parseSkillContent } from '../../../lib/skills/skill-loader.js';

const SKILLS_DIR = join(process.cwd(), '.claude', 'skills');
const realSkillFiles = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));

describe('parseSkillFile / parseSkillContent equivalence (FR-1, TS-4)', () => {
  it('found all 25 real .claude/skills/*.md files to test against', () => {
    expect(realSkillFiles.length).toBe(25);
  });

  it.each(realSkillFiles)('parseSkillFile(%s) is byte-identical to parseSkillContent(raw, {filePath})', (fileName) => {
    const filePath = join(SKILLS_DIR, fileName);
    const raw = readFileSync(filePath, 'utf-8');

    const viaFile = parseSkillFile(filePath);
    const viaContent = parseSkillContent(raw, { filePath });

    expect(viaContent).toEqual(viaFile);
  });

  it('parseSkillContent without a filePath falls back to a caller-supplied skillKey', () => {
    const raw = '---\nversion: 1.0.0\ntriggers: [x]\n---\n# Body\nSome content here.\n';
    const parsed = parseSkillContent(raw, { skillKey: 'caller-key' });
    expect(parsed).not.toBeNull();
    expect(parsed.skillKey).toBe('caller-key');
    expect(parsed.name).toBe('caller-key');
    expect(parsed.filePath).toBeUndefined();
  });

  it('parseSkillContent returns null for content without frontmatter, same as parseSkillFile', () => {
    const raw = '# No frontmatter here\nJust body text.\n';
    expect(parseSkillContent(raw)).toBeNull();
  });
});
