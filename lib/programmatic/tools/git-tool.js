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
import path from 'path';

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
    handler: async (input, { dryRun } = {}) => {
      const { branch, base = 'main' } = input;

      if (dryRun) {
        return 'lib/programmatic/tool-loop.js | 120 ++++\nscripts/programmatic/vision-scorer.js | 95 +++\n3 files changed, 215 insertions(+)';
      }

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
    handler: async (input, { dryRun } = {}) => {
      const { branch, base = 'main' } = input;

      if (dryRun) {
        return JSON.stringify([
          'lib/programmatic/tool-loop.js',
          'lib/programmatic/tools/supabase-tool.js',
          'scripts/programmatic/vision-scorer.js',
        ]);
      }

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
