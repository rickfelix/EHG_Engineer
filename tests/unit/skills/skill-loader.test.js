/**
 * Tests for lib/skills/skill-loader.js
 * SD-EVA-FEAT-SKILL-PACKAGING-001
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseSkillFile, loadSkillsFromDirectory, validateSkill } from '../../../lib/skills/skill-loader.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

const TEST_DIR = join(os.tmpdir(), 'skill-loader-test-' + Date.now());

const VALID_SKILL = `---
name: test-skill
version: 2.1.0
triggers: [schema, table, column]
context_keywords: [database, infrastructure]
required_tools: [Bash, Read]
context_access: readonly
agent_scope: [DATABASE]
dependencies: []
---
# Test Skill

When working with database schemas:
1. Always check existing schema first
2. Use UUID primary keys
`;

const MINIMAL_SKILL = `---
name: minimal
version: 1.0.0
triggers: [trigger1]
---
# Minimal Skill
This is minimal content.
`;

const NO_FRONTMATTER = `# No Frontmatter
This file has no YAML frontmatter.
`;

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'valid.skill.md'), VALID_SKILL);
  writeFileSync(join(TEST_DIR, 'minimal.skill.md'), MINIMAL_SKILL);
  writeFileSync(join(TEST_DIR, 'no-frontmatter.skill.md'), NO_FRONTMATTER);
  writeFileSync(join(TEST_DIR, 'not-a-skill.md'), '# Not a skill file');
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('parseSkillFile', () => {
  it('parses a valid skill file with all fields', () => {
    const skill = parseSkillFile(join(TEST_DIR, 'valid.skill.md'));
    expect(skill).not.toBeNull();
    expect(skill.name).toBe('test-skill');
    expect(skill.version).toBe('2.1.0');
    expect(skill.triggers).toEqual(['schema', 'table', 'column']);
    expect(skill.contextKeywords).toEqual(['database', 'infrastructure']);
    expect(skill.requiredTools).toEqual(['Bash', 'Read']);
    expect(skill.contextAccess).toBe('readonly');
    expect(skill.agentScope).toEqual(['DATABASE']);
    expect(skill.dependencies).toEqual([]);
    expect(skill.content).toContain('# Test Skill');
    expect(skill.contentHash).toHaveLength(64);
  });

  it('parses a minimal skill file with defaults', () => {
    const skill = parseSkillFile(join(TEST_DIR, 'minimal.skill.md'));
    expect(skill).not.toBeNull();
    expect(skill.name).toBe('minimal');
    expect(skill.version).toBe('1.0.0');
    expect(skill.triggers).toEqual(['trigger1']);
    expect(skill.contextKeywords).toEqual([]);
    expect(skill.requiredTools).toEqual([]);
    expect(skill.contextAccess).toBe('readonly');
    expect(skill.agentScope).toEqual([]);
  });

  it('returns null for files without frontmatter', () => {
    const skill = parseSkillFile(join(TEST_DIR, 'no-frontmatter.skill.md'));
    expect(skill).toBeNull();
  });
});

describe('loadSkillsFromDirectory', () => {
  it('loads only .skill.md files', () => {
    const skills = loadSkillsFromDirectory(TEST_DIR);
    // valid.skill.md and minimal.skill.md should load; no-frontmatter returns null (filtered)
    // not-a-skill.md is excluded by file extension
    expect(skills.length).toBe(2);
    const names = skills.map(s => s.name).sort();
    expect(names).toEqual(['minimal', 'test-skill']);
  });

  it('returns empty array for non-existent directory', () => {
    const skills = loadSkillsFromDirectory('/nonexistent/path');
    expect(skills).toEqual([]);
  });
});

describe('validateSkill', () => {
  it('validates a correct skill', () => {
    const skill = parseSkillFile(join(TEST_DIR, 'valid.skill.md'));
    const result = validateSkill(skill);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects skill with missing name', () => {
    const result = validateSkill({ name: '', version: '1.0.0', triggers: ['x'], contextAccess: 'readonly', content: 'Long enough content here' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: name');
  });

  it('rejects skill with invalid version', () => {
    const result = validateSkill({ name: 'test', version: 'abc', triggers: ['x'], contextAccess: 'readonly', content: 'Long enough content here' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid version'))).toBe(true);
  });

  it('rejects skill with no triggers', () => {
    const result = validateSkill({ name: 'test', version: '1.0.0', triggers: [], contextAccess: 'readonly', content: 'Long enough content here' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('trigger'))).toBe(true);
  });

  it('rejects skill with invalid context_access', () => {
    const result = validateSkill({ name: 'test', version: '1.0.0', triggers: ['x'], contextAccess: 'admin', content: 'Long enough content here' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('context_access'))).toBe(true);
  });

  it('rejects skill with too-short content', () => {
    const result = validateSkill({ name: 'test', version: '1.0.0', triggers: ['x'], contextAccess: 'readonly', content: 'short' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('too short'))).toBe(true);
  });
});
