/**
 * Skill File Parser
 *
 * Parses all .md and .skill.md files in .claude/skills/,
 * extracting YAML frontmatter (description field), filename, and metadata.
 *
 * @module scripts/modules/skill-assessment/skill-parser
 */

import fs from 'fs';
import path from 'path';

/**
 * @typedef {Object} ParsedSkill
 * @property {string} name - Skill name derived from filename (without extension)
 * @property {string} filename - Original filename
 * @property {string} filePath - Full file path
 * @property {string|null} description - Extracted description or null
 * @property {boolean} hasDescription - Whether description frontmatter exists
 * @property {Object} frontmatter - All parsed frontmatter fields
 * @property {number} fileSize - File size in bytes
 * @property {string} lastModified - ISO date of last modification
 */

/**
 * Parse YAML frontmatter from file content.
 * Handles both `description:` as a standalone field and within broader YAML blocks.
 *
 * @param {string} content - File content
 * @returns {Object} Parsed frontmatter fields
 */
export function parseFrontmatter(content) {
  const frontmatter = {};
  // Handle both \n and \r\n line endings
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return frontmatter;

  const yamlBlock = match[1];
  for (const line of yamlBlock.split('\n')) {
    const kvMatch = line.match(/^(\w[\w_-]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value = kvMatch[2].trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Parse arrays like [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim());
      }
      frontmatter[key] = value;
    }
  }
  return frontmatter;
}

/**
 * Derive skill name from filename.
 * Removes .skill.md or .md extension.
 *
 * @param {string} filename
 * @returns {string}
 */
export function skillNameFromFilename(filename) {
  return filename.replace(/\.skill\.md$/, '').replace(/\.md$/, '');
}

/**
 * Parse a single skill file.
 *
 * @param {string} filePath - Absolute path to skill file
 * @returns {ParsedSkill}
 */
export function parseSkillFile(filePath) {
  const filename = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  const frontmatter = parseFrontmatter(content);

  return {
    name: skillNameFromFilename(filename),
    filename,
    filePath,
    description: frontmatter.description || null,
    hasDescription: !!frontmatter.description,
    frontmatter,
    fileSize: stat.size,
    lastModified: stat.mtime.toISOString(),
  };
}

/**
 * Parse all skill files in the skills directory.
 *
 * @param {string} [skillsDir] - Path to skills directory (defaults to .claude/skills/)
 * @returns {ParsedSkill[]}
 */
export function parseAllSkills(skillsDir) {
  const dir = skillsDir || path.resolve(process.cwd(), '.claude/skills');
  if (!fs.existsSync(dir)) {
    throw new Error(`Skills directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') || f.endsWith('.skill.md'))
    // Deduplicate — .skill.md files are also matched by .md
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .sort();

  return files.map(f => parseSkillFile(path.join(dir, f)));
}
