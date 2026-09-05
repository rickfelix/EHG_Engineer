/**
 * Git Operations Tool for Programmatic Tool Calling
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 *
 * Provides git diff and changed-files tools used by retrospective-generator.js
 * to reference actual code changes in retrospective content.
 *
 * @module lib/programmatic/tools/git-tool
 */

import { execSync } from 'child_process';

const DEFAULT_REPO = process.cwd();

/**
 * Create git diff and changed-files tools.
 *
 * @param {string} [repoPath] - Absolute path to git repo root
 * @returns {{ gitDiff: Object, changedFiles: Object }} Tool objects
 */
export function createGitTools(repoPath = DEFAULT_REPO) {
  const gitDiff = {
    definition: {
      name: 'git_diff',
      description:
        'Get git diff stats between a feature branch and main. ' +
        'Returns --stat --unified=0 output (file names + line counts, no full diffs).',
      input_schema: {
        type: 'object',
        properties: {
          branch: {
            type: 'string',
            description: 'Feature branch name (e.g. feat/SD-LEO-INFRA-001)',
          },
          base: {
            type: 'string',
            description: 'Base branch to diff against (default: main)',
          },
        },
        required: ['branch'],
      },
    },
    handler: async (input) => {
      const { branch, base = 'main' } = input;

      // Read-only (no repo mutation): always run the real command, including under
      // --dry-run. A prior fixture here returned fabricated file paths unconditionally,
      // which a caller then reported as real diff content (QF-20260903-177).
      try {
        const cmd = `git -C "${repoPath}" diff --stat --unified=0 ${base}...${branch}`;
        const output = execSync(cmd, { timeout: 15000, encoding: 'utf8' });
        // Truncate to reasonable size
        const lines = output.split('\n').slice(0, 100);
        return lines.join('\n');
      } catch (err) {
        return `Error running git diff: ${err.message}`;
      }
    },
  };

  const changedFiles = {
    definition: {
      name: 'git_changed_files',
      description:
        'Get list of files changed between a feature branch and main. ' +
        'Returns file paths only (no diff content).',
      input_schema: {
        type: 'object',
        properties: {
          branch: {
            type: 'string',
            description: 'Feature branch name',
          },
          base: {
            type: 'string',
            description: 'Base branch (default: main)',
          },
        },
        required: ['branch'],
      },
    },
    handler: async (input) => {
      const { branch, base = 'main' } = input;

      // Read-only (no repo mutation): always run the real command, including under
      // --dry-run. See gitDiff above for why this must not fabricate file paths.
      try {
        const cmd = `git -C "${repoPath}" diff --name-only ${base}...${branch}`;
        const output = execSync(cmd, { timeout: 15000, encoding: 'utf8' });
        const files = output.trim().split('\n').filter(Boolean);
        return JSON.stringify(files);
      } catch (err) {
        return JSON.stringify({ error: `git changed-files failed: ${err.message}` });
      }
    },
  };

  return { gitDiff, changedFiles };
}
