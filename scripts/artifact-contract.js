#!/usr/bin/env node
/**
 * artifact-contract.js — author-side contract tooling
 * (SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001).
 *
 * Usage:
 *   node scripts/artifact-contract.js scaffold <sd|prd>          # print a valid skeleton
 *   node scripts/artifact-contract.js check <sd|prd> <file|->    # validate a JSON payload
 *
 * npm entries: contract:scaffold / contract:check
 *
 * `check` runs AUTHORING mode (strict: required keys, min counts, exact keys,
 * canonical metrics delegation, boilerplate-smoke advisories) so authors see
 * the FULL contract before any gate does. The gates themselves consume the
 * same spec in 'shape' mode (see scripts/add-prd-to-database.js).
 *
 * Exit codes: 0 valid, 1 violations, 2 usage error.
 */
import fs from 'node:fs';
import { validateArtifact, formatViolations, scaffold } from '../lib/artifact-contracts/index.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const VALID_CLASSES = ['sd', 'prd'];

export function runCli(argv) {
  const [cmd, klass, file] = argv;

  if (!cmd || !['scaffold', 'check'].includes(cmd) || !VALID_CLASSES.includes(klass)) {
    console.error('Usage: node scripts/artifact-contract.js scaffold <sd|prd>');
    console.error('       node scripts/artifact-contract.js check <sd|prd> <file|->');
    return 2;
  }

  if (cmd === 'scaffold') {
    console.log(JSON.stringify(scaffold(klass), null, 2));
    return 0;
  }

  // check
  if (!file) {
    console.error('check: missing <file|-> argument (use - for stdin)');
    return 2;
  }
  let raw;
  try {
    raw = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`check: cannot read ${file}: ${e.message}`);
    return 2;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error(`check: INVALID_JSON: ${e.message}`);
    return 1;
  }

  const { valid, violations, warnings } = validateArtifact(klass, payload, { mode: 'authoring' });

  if (warnings.length > 0) {
    console.log(`⚠ ${warnings.length} warning(s):`);
    console.log(formatViolations(warnings));
    console.log('');
  }
  if (!valid) {
    console.error(`✗ ${klass.toUpperCase()} contract: ${violations.length} violation(s):`);
    console.error(formatViolations(violations));
    return 1;
  }
  console.log(`✓ ${klass.toUpperCase()} contract: payload valid (${warnings.length} warning(s))`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
