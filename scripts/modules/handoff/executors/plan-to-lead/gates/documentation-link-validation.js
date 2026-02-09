/**
 * Documentation Link Validation Gate for PLAN-TO-LEAD
 * Part of SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-D
 *
 * Scans markdown files created/modified in the current branch,
 * extracts relative file links, and checks each referenced path exists on disk.
 * BLOCKING for sd_type=documentation, ADVISORY for others.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Regex to match markdown links: [text](path)
 * Captures: group 1 = link text, group 2 = link target
 * Excludes links inside fenced code blocks (handled separately)
 */
const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Patterns to skip - not file references
 */
const SKIP_PATTERNS = [
  /^https?:\/\//i,   // External URLs
  /^mailto:/i,        // Email links
  /^#/,               // Anchor-only links
  /^data:/i,          // Data URIs
  /^tel:/i,           // Phone links
];

/**
 * Strip fenced code blocks and inline code from markdown content
 * to avoid false positives from example links in code.
 *
 * @param {string} content - Raw markdown content
 * @returns {string} Content with code blocks and inline code removed
 */
function stripCodeBlocks(content) {
  // Remove fenced code blocks (``` ... ```)
  let stripped = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code (`...`)
  stripped = stripped.replace(/`[^`]+`/g, '');
  return stripped;
}

/**
 * Extract relative file links from markdown content.
 *
 * @param {string} content - Markdown content (already stripped of code blocks)
 * @returns {Array<{text: string, target: string}>} Array of link objects
 */
function extractRelativeLinks(content) {
  const links = [];
  let match;

  while ((match = MARKDOWN_LINK_REGEX.exec(content)) !== null) {
    const target = match[2].trim();

    // Strip optional title from link: [text](path "title")
    const targetPath = target.replace(/\s+"[^"]*"$/, '').replace(/\s+'[^']*'$/, '');

    // Skip non-file references
    if (SKIP_PATTERNS.some(pattern => pattern.test(targetPath))) {
      continue;
    }

    // Strip anchor fragments from paths (e.g., file.md#section -> file.md)
    const pathWithoutAnchor = targetPath.split('#')[0];
    if (!pathWithoutAnchor) continue; // Pure anchor link

    links.push({
      text: match[1],
      target: pathWithoutAnchor
    });
  }

  return links;
}

/**
 * Get markdown files changed in the current branch compared to main.
 *
 * @param {string} cwd - Working directory
 * @returns {string[]} Array of changed markdown file paths
 */
function getChangedMarkdownFiles(cwd) {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8', cwd, timeout: 10000
    }).trim();

    let diffOutput;
    if (currentBranch === 'main' || currentBranch === 'master') {
      // On main, check uncommitted changes
      diffOutput = execSync('git diff --name-only HEAD', {
        encoding: 'utf8', cwd, timeout: 10000
      });
    } else {
      // On feature branch, diff against main
      diffOutput = execSync('git diff --name-only main...HEAD', {
        encoding: 'utf8', cwd, timeout: 10000
      });
    }

    return diffOutput
      .split('\n')
      .map(f => f.trim())
      .filter(f => f && /\.md$/i.test(f));
  } catch {
    return [];
  }
}

/**
 * Validate that all relative links in a markdown file point to existing files.
 *
 * @param {string} filePath - Absolute path to the markdown file
 * @param {string} repoRoot - Repository root directory
 * @returns {{valid: Array, broken: Array}} Validation results
 */
function validateFileLinks(filePath, repoRoot) {
  const valid = [];
  const broken = [];

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return { valid, broken: [{ file: filePath, target: '(unreadable)', reason: 'File could not be read' }] };
  }

  const strippedContent = stripCodeBlocks(content);
  const links = extractRelativeLinks(strippedContent);
  const fileDir = dirname(filePath);

  for (const link of links) {
    // Resolve the link target relative to the file's directory
    const resolvedPath = resolve(fileDir, link.target);

    // Also try resolving from repo root (for absolute-style relative paths like docs/foo.md)
    const repoResolvedPath = resolve(repoRoot, link.target);

    if (existsSync(resolvedPath) || existsSync(repoResolvedPath)) {
      valid.push({ file: filePath, target: link.target });
    } else {
      broken.push({
        file: filePath,
        target: link.target,
        text: link.text,
        reason: `Referenced file not found: ${link.target}`
      });
    }
  }

  return { valid, broken };
}

/**
 * Create the GATE_DOCUMENTATION_LINK_VALIDATION gate validator
 *
 * @param {Object} _supabase - Supabase client (unused but follows gate pattern)
 * @returns {Object} Gate configuration
 */
export function createDocumentationLinkValidationGate(_supabase) {
  return {
    name: 'GATE_DOCUMENTATION_LINK_VALIDATION',

    validator: async (ctx) => {
      console.log('\n📎 GATE: Documentation Link Validation');
      console.log('-'.repeat(50));

      const sd = ctx.sd || {};
      const sdType = (sd.sd_type || '').toLowerCase();
      const isDocSD = sdType === 'documentation';
      const severity = isDocSD ? 'BLOCKING' : 'ADVISORY';

      console.log(`   SD Type: ${sdType || 'unknown'}`);
      console.log(`   Severity: ${severity}`);

      // Determine repo root
      const repoRoot = process.cwd();

      // Get changed markdown files
      const changedFiles = getChangedMarkdownFiles(repoRoot);

      if (changedFiles.length === 0) {
        console.log('   ℹ️  No markdown files changed in this branch');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: []
        };
      }

      console.log(`   📄 Found ${changedFiles.length} changed markdown file(s)`);

      const allBroken = [];
      const allValid = [];

      for (const relPath of changedFiles) {
        const absPath = resolve(repoRoot, relPath);
        if (!existsSync(absPath)) continue; // File was deleted

        const { valid, broken } = validateFileLinks(absPath, repoRoot);
        allValid.push(...valid);
        allBroken.push(...broken);
      }

      console.log(`   ✅ Valid links: ${allValid.length}`);
      console.log(`   ❌ Broken links: ${allBroken.length}`);

      if (allBroken.length > 0) {
        console.log('\n   Broken links:');
        for (const b of allBroken) {
          const relFile = b.file.replace(repoRoot, '').replace(/\\/g, '/').replace(/^\//, '');
          console.log(`   ❌ ${relFile} → ${b.target} (${b.reason})`);
        }
      }

      const issues = allBroken.map(b => {
        const relFile = b.file.replace(repoRoot, '').replace(/\\/g, '/').replace(/^\//, '');
        return `Broken link in ${relFile}: [${b.text || ''}](${b.target})`;
      });

      const score = allBroken.length === 0
        ? 100
        : Math.max(0, 100 - (allBroken.length * 15));

      if (isDocSD && allBroken.length > 0) {
        // BLOCKING for documentation SDs
        console.log(`\n   🚫 BLOCKING: ${allBroken.length} broken link(s) in documentation SD`);
        return {
          passed: false,
          score,
          max_score: 100,
          issues,
          warnings: [],
          remediation: `Fix ${allBroken.length} broken documentation link(s) before proceeding`
        };
      }

      // ADVISORY for non-documentation SDs
      if (allBroken.length > 0) {
        console.log(`\n   ⚠️  ADVISORY: ${allBroken.length} broken link(s) found (non-blocking for ${sdType} SD)`);
      }

      return {
        passed: true,
        score,
        max_score: 100,
        issues: [],
        warnings: issues.length > 0 ? issues : [],
        details: {
          changed_files: changedFiles.length,
          valid_links: allValid.length,
          broken_links: allBroken.length,
          severity
        }
      };
    },

    required: true
  };
}

// Exported for testing
export { stripCodeBlocks, extractRelativeLinks, getChangedMarkdownFiles, validateFileLinks };
