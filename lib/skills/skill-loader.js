/**
 * Skill Loader - Parses SKILL.md files with YAML frontmatter
 * SD-EVA-FEAT-SKILL-PACKAGING-001
 *
 * SKILL.md format:
 * ---
 * name: schema-design
 * version: 1.0.0
 * triggers: [schema, table, column, create table, alter table]
 * context_keywords: [database, infrastructure]
 * required_tools: [Bash, Read]
 * context_access: readonly
 * agent_scope: [DATABASE, API]
 * dependencies: []
 * ---
 * # Schema Design Skill
 * ... skill content ...
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/**
 * Parse YAML-like frontmatter (simple key: value parser, no external deps)
 */
function parseFrontmatter(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Parse arrays: [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      result[key] = inner
        ? inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
        : [];
      continue;
    }

    // Parse booleans
    if (value === 'true') { result[key] = true; continue; }
    if (value === 'false') { result[key] = false; continue; }

    // Strip quotes
    result[key] = value.replace(/^["']|["']$/g, '');
  }
  return result;
}

/**
 * Parse a single SKILL.md file
 * @param {string} filePath - Absolute path to SKILL.md file
 * @returns {object|null} Parsed skill object or null if invalid
 */
export function parseSkillFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const match = raw.match(FRONTMATTER_REGEX);
  if (!match) return null;

  const frontmatter = parseFrontmatter(match[1]);
  const content = match[2].trim();
  const contentHash = createHash('sha256').update(content).digest('hex');

  return {
    skillKey: frontmatter.name || basename(filePath, '.md'),
    name: frontmatter.name || basename(filePath, '.md'),
    version: frontmatter.version || '1.0.0',
    triggers: frontmatter.triggers || [],
    contextKeywords: frontmatter.context_keywords || [],
    requiredTools: frontmatter.required_tools || [],
    contextAccess: frontmatter.context_access || 'readonly',
    agentScope: frontmatter.agent_scope || [],
    dependencies: frontmatter.dependencies || [],
    content,
    contentHash,
    filePath
  };
}

/**
 * Load all SKILL.md files from a directory
 * @param {string} skillsDir - Directory containing SKILL.md files
 * @returns {object[]} Array of parsed skill objects
 */
export function loadSkillsFromDirectory(skillsDir) {
  if (!existsSync(skillsDir)) return [];

  const files = readdirSync(skillsDir)
    .filter(f => f.endsWith('.skill.md') || f.endsWith('.SKILL.md'));

  return files
    .map(f => parseSkillFile(join(skillsDir, f)))
    .filter(Boolean);
}

/**
 * Validate a parsed skill object
 * @param {object} skill - Parsed skill from parseSkillFile
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSkill(skill) {
  const errors = [];

  if (!skill.name) errors.push('Missing required field: name');
  if (!skill.version || !/^\d+\.\d+\.\d+$/.test(skill.version)) {
    errors.push(`Invalid version format: ${skill.version} (expected semver X.Y.Z)`);
  }
  if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
    errors.push('Skill must have at least one trigger keyword');
  }
  if (!['full', 'readonly', 'minimal'].includes(skill.contextAccess)) {
    errors.push(`Invalid context_access: ${skill.contextAccess}`);
  }
  if (!skill.content || skill.content.length < 10) {
    errors.push('Skill content is too short (minimum 10 characters)');
  }

  return { valid: errors.length === 0, errors };
}
