#!/usr/bin/env node
/**
 * scripts/agent-readiness-scaffold-route.mjs
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 TR-3 / US-005.
 *
 * Emits lib/agent-readiness/templates/llm-txt-route.template.ts into a TARGET VENTURE repo's
 * functions/llm.txt.ts (Cloudflare Pages Functions convention), never into EHG_Engineer's own
 * deploy surface. Per TR-1, this repo does not vendor tooling into venture codebases automatically —
 * this script requires an explicit --target path so a human/CI step in the venture repo controls
 * when the scaffold lands.
 *
 * Usage: node scripts/agent-readiness-scaffold-route.mjs --target <path-to-venture-repo>
 *
 * @wire-check-exempt: operator-invoked CLI requiring an explicit --target path into a DIFFERENT
 * (venture) repo — cannot be wired into a package.json script or imported by a caller in this
 * repo by construction (TR-1: never vendored/auto-invoked against a venture codebase).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = path.join(repoRoot, 'lib/agent-readiness/templates/llm-txt-route.template.ts');

export function resolveTargetFile(targetRepoPath) {
  // Cloudflare Pages Functions convention: functions/llm.txt.ts serves GET /llm.txt.
  return path.join(targetRepoPath, 'functions', 'llm.txt.ts');
}

export function scaffold(targetRepoPath, { force = false } = {}) {
  if (!existsSync(targetRepoPath)) {
    throw new Error(`Target repo path does not exist: ${targetRepoPath}`);
  }
  const targetFile = resolveTargetFile(targetRepoPath);
  if (existsSync(targetFile) && !force) {
    throw new Error(`${targetFile} already exists — pass --force to overwrite`);
  }
  const content = readFileSync(TEMPLATE_PATH, 'utf8');
  mkdirSync(path.dirname(targetFile), { recursive: true });
  writeFileSync(targetFile, content, 'utf8');
  return targetFile;
}

function parseArgs(argv) {
  const out = { force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') out.target = argv[++i];
    else if (argv[i] === '--force') out.force = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error('Usage: node scripts/agent-readiness-scaffold-route.mjs --target <path-to-venture-repo> [--force]');
    process.exit(2);
  }
  try {
    const written = scaffold(args.target, { force: args.force });
    console.log(`Scaffolded llm.txt route at: ${written}`);
    console.log('NOTE: set AGENT_READINESS_VENTURE_URL and AGENT_READINESS_SERVICE_URL in the venture\'s Cloudflare Worker env before deploying.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
