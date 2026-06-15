#!/usr/bin/env node
/**
 * Workflow-YAML lint guard — SD-LEO-FIX-UNIT-TIER-STARTUP-001 (FR-2, the class fix).
 *
 * Fail-loud parse of every .github/workflows/*.yml|*.yaml so a plain-scalar ': '
 * (or any YAML parse) defect FAILS at author time instead of shipping a phantom-green
 * workflow. The line-34 defect that broke unit-tier.yml on every run since #4619 was a
 * top-level YAML parse rejection invisible to byte/BOM/tab scans and "looks-valid"
 * eyeballing — exactly the class this guard catches.
 *
 * Usage:
 *   node scripts/check-workflow-yaml.mjs            # walk .github/workflows/
 *   node scripts/check-workflow-yaml.mjs <file...>  # check specific file(s)
 *
 * Exit 0 if every checked file parses; non-zero (naming each offender + the parse
 * error) otherwise. Scope is intentionally a YAML PARSE check, not actionlint-level
 * schema validation — any parseable workflow passes.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const WORKFLOW_DIR = '.github/workflows';

/**
 * PURE: validate a single workflow YAML string. Returns {ok:true} on a clean parse,
 * else {ok:false, error} carrying the js-yaml first-line message. Never throws.
 * @param {string} yamlString
 * @returns {{ok:boolean, error?:string}}
 */
export function validateWorkflowYaml(yamlString) {
  try {
    yaml.load(yamlString);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e).split('\n')[0] };
  }
}

/**
 * Resolve the list of workflow files to check: explicit CLI args when given, else a
 * sorted walk of .github/workflows/*.yml|*.yaml.
 * @param {string[]} args
 * @returns {string[]}
 */
export function resolveWorkflowFiles(args = []) {
  if (args.length > 0) return args;
  if (!existsSync(WORKFLOW_DIR)) return [];
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => ['.yml', '.yaml'].includes(extname(f)))
    .sort()
    .map((f) => join(WORKFLOW_DIR, f));
}

function main() {
  const files = resolveWorkflowFiles(process.argv.slice(2));
  if (files.length === 0) {
    console.error('[WORKFLOW_YAML] no workflow files found to check');
    process.exitCode = 1;
    return;
  }
  let failures = 0;
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`✗ ${file}: cannot read: ${e.message}`);
      failures++;
      continue;
    }
    const res = validateWorkflowYaml(raw);
    if (res.ok) {
      console.log(`✓ ${file}`);
    } else {
      console.error(`✗ ${file}: ${res.error}`);
      failures++;
    }
  }
  if (failures > 0) {
    console.error(`[WORKFLOW_YAML] ${failures} workflow file(s) failed to parse`);
    process.exitCode = 1;
  } else {
    console.log(`[WORKFLOW_YAML] all ${files.length} workflow file(s) parse OK`);
  }
}

// ESM main-module guard: only run main() when invoked directly, not on import (tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
