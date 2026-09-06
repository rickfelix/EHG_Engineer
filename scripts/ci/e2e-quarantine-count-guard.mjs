#!/usr/bin/env node
// SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-2): CI-asserted quarantine count. The quarantine list
// (tests/e2e/quarantine.json) is the scope-bounding device for specs this SD could not repair --
// it must never grow silently. Compares the CURRENT tree's entry count against the count on
// origin/main (or an explicit --base ref); FAILS if the current count is higher.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const QUARANTINE_PATH = 'tests/e2e/quarantine.json';

function parseArgs(argv) {
  const out = { base: 'origin/main' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i];
  }
  return out;
}

/** Pure: validate + count entries in a quarantine document. Throws on structural violation
 * (a malformed entry is a defect in the list itself, not a count question). */
export function countQuarantineEntries(doc) {
  if (doc == null) return 0;
  const entries = Array.isArray(doc) ? doc : doc.quarantined;
  if (!Array.isArray(entries)) throw new Error('quarantine document must be an array, or an object with a "quarantined" array');
  for (const [i, entry] of entries.entries()) {
    if (!entry || typeof entry.spec !== 'string' || typeof entry.reason !== 'string') {
      throw new Error(`quarantine entry ${i} is malformed -- each entry needs {spec: string, reason: string}`);
    }
  }
  return entries.length;
}

/** Pure: the actual gate predicate. Growth (current > base) fails; anything else passes. */
export function evaluateQuarantineGrowth(currentCount, baseCount) {
  return {
    status: currentCount > baseCount ? 'FAIL' : 'PASS',
    current_count: currentCount,
    base_count: baseCount,
    delta: currentCount - baseCount,
  };
}

function readCurrentDoc() {
  if (!existsSync(QUARANTINE_PATH)) return [];
  return JSON.parse(readFileSync(QUARANTINE_PATH, 'utf8'));
}

function readBaseDoc(base) {
  try {
    const raw = execFileSync('git', ['show', `${base}:${QUARANTINE_PATH}`], { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch {
    // File does not exist on base ref yet (e.g. this SD's own first merge) -- 0 is the honest
    // baseline, not an error; a brand-new quarantine list cannot "grow" against nothing.
    return [];
  }
}

async function main() {
  const { base } = parseArgs(process.argv.slice(2));
  let currentCount, baseCount;
  try {
    currentCount = countQuarantineEntries(readCurrentDoc());
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: `current tree: ${e.message}` }));
    process.exitCode = 1;
    return;
  }
  try {
    baseCount = countQuarantineEntries(readBaseDoc(base));
  } catch (e) {
    console.error(JSON.stringify({ status: 'error', error: `${base}: ${e.message}` }));
    process.exitCode = 1;
    return;
  }

  const result = { ...evaluateQuarantineGrowth(currentCount, baseCount), base };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && /e2e-quarantine-count-guard\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(JSON.stringify({ status: 'error', error: e.message }));
    process.exitCode = 1;
  });
}
