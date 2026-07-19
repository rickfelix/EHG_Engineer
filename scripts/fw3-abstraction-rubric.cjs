#!/usr/bin/env node
'use strict';

/**
 * FW-3 abstraction/depth detection rubric — thin manual dry-run CLI (FR-4,
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-F). Mirrors sibling Child C's scripts/fw3-cmv-rejecter.cjs
 * pure-core/CLI split: this file owns arg parsing and stdout only. Zero env vars, zero DB I/O —
 * the core (lib/governance/fw3-abstraction-rubric.cjs) has no I/O to configure. Always exits 0
 * (pure classification is never a CLI failure mode of its own); a malformed input fails soft
 * with a defined message rather than throwing.
 *
 * Usage:
 *   node scripts/fw3-abstraction-rubric.cjs --json '{"sd_tree_effect":"add_leaf"}'
 *   node scripts/fw3-abstraction-rubric.cjs --file @candidate.json
 */

const fs = require('fs');
const path = require('path');
const { computeFramingClass, explainFramingClass } = require(path.join(__dirname, '..', 'lib', 'governance', 'fw3-abstraction-rubric.cjs'));

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function loadCandidate() {
  const jsonArg = argValue('--json');
  if (jsonArg != null) return JSON.parse(jsonArg);
  const fileArg = argValue('--file');
  if (fileArg != null) {
    const filePath = fileArg.startsWith('@') ? fileArg.slice(1) : fileArg;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  throw new Error("--json '<candidate>' or --file @<path> is required");
}

function main() {
  let candidate;
  try {
    candidate = loadCandidate();
  } catch (err) {
    console.log(`PICK: fail-soft — could not parse candidate input (${err.message})`);
    process.exit(0);
  }
  console.log(explainFramingClass(candidate));
  console.log(JSON.stringify(computeFramingClass(candidate), null, 2));
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
