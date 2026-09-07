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
 * (a malformed entry is a defect in the list itself, not a count question).
 * KNOWN LIMITATION, disclosed rather than fixed here: this bounds a COUNT, not a SET. A PR that
 * removes one genuinely-repaired spec and adds a different, newly-broken spec in the same change
 * leaves the count flat and passes, even though outstanding e2e debt did not shrink -- it moved.
 * Closing that needs per-spec set-membership tracking across base and current, which is a real
 * enhancement beyond this SD's own promised scope (FR-2 asks only for a non-growth COUNT
 * assertion) -- left as a follow-up rather than scope-creeping this guard. */
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

/** Pure: the actual gate predicate. Growth (current > base) fails; anything else passes.
 * A base count of 0 (no quarantine.json on the base ref yet) is the FIRST-EVER population of
 * the list -- there is nothing to have "grown from", so any current_count is a bootstrap
 * baseline being established, not a regression, and always passes. Growth is only a meaningful
 * concept once a real (nonzero) baseline exists. */
export function evaluateQuarantineGrowth(currentCount, baseCount) {
  const isBootstrap = baseCount === 0;
  return {
    status: (!isBootstrap && currentCount > baseCount) ? 'FAIL' : 'PASS',
    current_count: currentCount,
    base_count: baseCount,
    delta: currentCount - baseCount,
    bootstrap: isBootstrap,
  };
}

function readCurrentDoc() {
  if (!existsSync(QUARANTINE_PATH)) return [];
  return JSON.parse(readFileSync(QUARANTINE_PATH, 'utf8'));
}

/** Adversarial review finding (deep-tier /ship gate, PR #8382): the original version of this
 * function caught EVERY failure of `git show` -- a legitimately-absent path on a brand-new base,
 * but ALSO a bad/unresolvable --base ref, a transient git error, or a corrupt JSON file on the
 * base ref -- identically, collapsing all of them to []. evaluateQuarantineGrowth() then reads a
 * base count of 0 as "bootstrap" and unconditionally PASSes. The net effect: any error reading
 * the base document made the one guard whose entire job is "never let this grow silently" fail
 * OPEN instead of closed. Only "the path does not exist at this ref" (git's own message for that
 * exact condition) is now treated as absence; every other git failure, and any JSON parse
 * failure on a file that DOES exist at the base ref, throws and reaches main()'s existing
 * catch -> exitCode=1 (fail closed), never a silent bootstrap-PASS. */
export function readBaseDoc(base) {
  let raw;
  try {
    raw = execFileSync('git', ['show', `${base}:${QUARANTINE_PATH}`], { encoding: 'utf8' });
  } catch (e) {
    const stderr = String(e.stderr ?? e.message ?? '');
    if (/does not exist in|exists on disk, but not in/.test(stderr)) {
      // The one legitimate case: quarantine.json genuinely does not exist yet at this ref
      // (e.g. this SD's own first merge) -- 0 is the honest baseline, not an error.
      return [];
    }
    throw new Error(`git show ${base}:${QUARANTINE_PATH} failed: ${stderr.trim() || e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${base}:${QUARANTINE_PATH} is not valid JSON: ${e.message}`);
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
