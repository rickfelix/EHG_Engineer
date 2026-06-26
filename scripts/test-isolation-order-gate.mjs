#!/usr/bin/env node
/**
 * test-isolation-order-gate.mjs — SD-LEO-INFRA-UNIT-TEST-ISOLATION-POLLUTION-001 FR-4
 *
 * Order-independence regression gate (preventive hardening). Runs the unit project under TWO
 * distinct fork configurations and asserts the SET of failing test files is IDENTICAL. If a future
 * change introduces fork-distribution-dependent shared-state leakage (the class this SD originally
 * suspected — found to be absent today; the current unit-tier reds are DETERMINISTIC test debt,
 * routed to UNIT-TEST-DEBT-TRIAGE-001), the two configs will diverge and this gate fails LOUDLY.
 *
 * It does NOT assert the suite is GREEN (the deterministic test-debt failures are expected until the
 * triage SD lands) — it asserts the failing set is STABLE across fork distributions = no order/
 * isolation pollution. Pairs with tests/setup.unit.js's per-test process.env restore (FR-1).
 *
 * Usage:
 *   node scripts/test-isolation-order-gate.mjs                 # full unit project
 *   node scripts/test-isolation-order-gate.mjs <fileGlob...>   # a subset (fast local check)
 */
import { spawnSync } from 'node:child_process';

const targets = process.argv.slice(2);

// Extract the set of failing test FILES from a vitest text run (reporter-agnostic, matches the
// "FAIL  <path>" and "❯ <path> (.. failed)" lines vitest prints).
function failingFiles(stdout) {
  const set = new Set();
  const re = /(?:FAIL|❯)\s+(?:\|unit\|\s+)?([^\s]+\.test\.js)/g;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    // Only count a "❯ <file> (.. failed)" line as a failure, not a passing "✓" summary line.
    const line = stdout.slice(stdout.lastIndexOf('\n', m.index) + 1, stdout.indexOf('\n', m.index));
    if (/FAIL/.test(line) || /failed\)/.test(line)) set.add(m[1].replace(/\\/g, '/'));
  }
  return set;
}

function runUnit(extraArgs, label) {
  const args = ['vitest', 'run', '--project', 'unit', ...extraArgs, ...targets];
  process.stderr.write(`[order-gate] run ${label}: npx ${args.join(' ')}\n`);
  const res = spawnSync('npx', args, { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  return failingFiles((res.stdout || '') + (res.stderr || ''));
}

// Config A: default multi-fork distribution. Config B: single-fork sequential (strongest sharing).
const a = runUnit([], 'A (multi-fork default)');
const b = runUnit(['--no-file-parallelism'], 'B (single-fork sequential)');

const onlyA = [...a].filter((f) => !b.has(f)).sort();
const onlyB = [...b].filter((f) => !a.has(f)).sort();

if (onlyA.length === 0 && onlyB.length === 0) {
  process.stdout.write(`[order-gate] PASS — failing set is IDENTICAL across fork configs (${a.size} file(s)); no order/isolation pollution.\n`);
  process.exit(0);
}
process.stdout.write('[order-gate] FAIL — fork-distribution-DEPENDENT failures detected (isolation pollution):\n');
if (onlyA.length) process.stdout.write(`  fail only under multi-fork: ${onlyA.join(', ')}\n`);
if (onlyB.length) process.stdout.write(`  fail only under single-fork: ${onlyB.join(', ')}\n`);
process.exit(1);
