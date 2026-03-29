/**
 * Venture CI/CD Template Engine
 *
 * Generates GitHub Actions workflow files for ventures based on archetype.
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001-O
 *
 * @module lib/venture-cicd-template
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ARCHETYPES = {
  'web-app': { hasTests: true, hasBuild: true, hasMigrations: true },
  api: { hasTests: true, hasBuild: false, hasMigrations: true },
  library: { hasTests: true, hasBuild: true, hasMigrations: false },
};

/**
 * Generate a GitHub Actions CI workflow for a venture.
 *
 * @param {Object} opts
 * @param {string} opts.repoPath - Local path to the venture repo
 * @param {string} [opts.archetype='web-app'] - Venture archetype
 * @param {string} [opts.nodeVersion='20'] - Node.js version
 * @returns {string} Path to the generated workflow file
 */
export function generateCIWorkflow({ repoPath, archetype = 'web-app', nodeVersion = '20' }) {
  const config = ARCHETYPES[archetype] || ARCHETYPES['web-app'];

  const steps = [
    { name: 'Checkout', uses: 'actions/checkout@v4' },
    { name: 'Setup Node.js', uses: `actions/setup-node@v4`, with: { 'node-version': nodeVersion } },
    { name: 'Install dependencies', run: 'npm ci' },
    { name: 'Lint', run: 'npm run lint --if-present' },
  ];

  if (config.hasTests) {
    steps.push({ name: 'Test', run: 'npm test --if-present' });
  }
  if (config.hasBuild) {
    steps.push({ name: 'Build', run: 'npm run build --if-present' });
  }
  if (config.hasMigrations) {
    steps.push({
      name: 'Supabase migrations',
      run: 'npx supabase db push --dry-run',
      env: { SUPABASE_DB_PASSWORD: '${{ secrets.SUPABASE_DB_PASSWORD }}' },
    });
  }

  const workflow = {
    name: 'CI',
    on: { push: { branches: ['main'] }, pull_request: { branches: ['main'] } },
    jobs: {
      ci: {
        'runs-on': 'ubuntu-latest',
        steps: steps.map((s) => {
          const step = { name: s.name };
          if (s.uses) step.uses = s.uses;
          if (s.with) step.with = s.with;
          if (s.run) step.run = s.run;
          if (s.env) step.env = s.env;
          return step;
        }),
      },
    },
  };

  const workflowDir = join(repoPath, '.github', 'workflows');
  mkdirSync(workflowDir, { recursive: true });
  const outputPath = join(workflowDir, 'ci.yml');

  // Simple YAML serialization (no dependency needed for this structure)
  const yaml = toYAML(workflow);
  writeFileSync(outputPath, yaml);
  return outputPath;
}

function toYAML(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  let result = '';
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      result += `${pad}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object') {
          const entries = Object.entries(item);
          result += `${pad}  - ${entries[0][0]}: ${JSON.stringify(entries[0][1])}\n`;
          for (let i = 1; i < entries.length; i++) {
            const val = typeof entries[i][1] === 'object'
              ? '\n' + toYAML(entries[i][1], indent + 3)
              : ` ${entries[i][1]}`;
            result += `${pad}    ${entries[i][0]}:${val}\n`;
          }
        } else {
          result += `${pad}  - ${value}\n`;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      result += `${pad}${key}:\n${toYAML(value, indent + 1)}`;
    } else {
      result += `${pad}${key}: ${JSON.stringify(value)}\n`;
    }
  }
  return result;
}

export default { generateCIWorkflow, ARCHETYPES };
