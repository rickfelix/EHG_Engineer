#!/usr/bin/env node
/**
 * scripts/agent-readiness-x402-scan.mjs
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-4 / US-009.
 *
 * Mechanical, CI-runnable scan for x402 SDK imports/contract references in the payment code path.
 * AC-009-3: the scanned path set is EXPLICIT and asserted, not implied — a bounded grep's scope is
 * otherwise an unmeasured assumption (this repo's own gotcha class: GREP-SCOPE=ASSUMPTION).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// EXPLICIT scope: the agent-readiness payment path only. Not a repo-wide sweep — this SD's FR-4
// scan is about ITS OWN payment code, not a general x402-ban across the whole codebase.
export const SCANNED_PATHS = [
  'lib/agent-readiness/checkout.js',
  'lib/agent-readiness/entitlement.js'
];

const X402_PATTERN = /\bx402\b|@coinbase\/x402|x402-sdk/i;

/**
 * Strip // line comments and /* block comments *\/ before scanning, so prose explaining "we do NOT
 * depend on x402" (this file's own doc comments included) is not itself flagged as a reference.
 * Deliberately simple (no string-literal-aware tokenizer) — good enough for this repo's own JS/TS
 * source, not a general-purpose parser. A quoted string containing "//" inside actual code is the
 * known limitation this accepts.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function walk(relOrAbsPath) {
  const abs = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.join(repoRoot, relOrAbsPath);
  const stat = statSync(abs, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isDirectory()) {
    return readdirSync(abs).flatMap((entry) => walk(path.join(relOrAbsPath, entry)));
  }
  return [abs];
}

export function scan(paths = SCANNED_PATHS) {
  const files = paths.flatMap(walk);
  const violations = [];
  for (const absPath of files) {
    const content = stripComments(readFileSync(absPath, 'utf8'));
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (X402_PATTERN.test(line)) {
        violations.push({ file: path.relative(repoRoot, absPath), line: i + 1, text: line.trim() });
      }
    });
  }
  return { scannedFiles: files.map((f) => path.relative(repoRoot, f)), violations };
}

async function main() {
  const { scannedFiles, violations } = scan();
  console.log(`x402 scan: ${scannedFiles.length} file(s) scanned (scope: ${SCANNED_PATHS.join(', ')})`);
  if (violations.length > 0) {
    console.error(`\n${violations.length} x402 reference(s) found in the payment path:`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}: ${v.text}`);
    process.exit(1);
  }
  console.log('Zero x402 references found. Scan exits 0.');
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
