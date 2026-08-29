#!/usr/bin/env node
/**
 * scripts/audit-static-prefix.mjs — SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4).
 *
 * Per-seat static-prefix composition audit CLI. Prints a per-component bytes +
 * calibrated-harness-token breakdown for one or more seats, and a total.
 *
 * Usage:
 *   node scripts/audit-static-prefix.mjs --seat worker
 *   node scripts/audit-static-prefix.mjs --seat adam
 *   node scripts/audit-static-prefix.mjs --seat worker --seat adam   (default: both)
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { auditSeat, SEAT_PROFILES } from '../lib/protocol/static-prefix-audit.mjs';
import { isMainModule } from '../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function parseSeats(argv) {
  const seats = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seat' && argv[i + 1]) seats.push(argv[i + 1]);
  }
  return seats.length ? seats : Object.keys(SEAT_PROFILES);
}

export function runAudit(seats, { repoRoot = REPO_ROOT } = {}) {
  const results = {};
  for (const seat of seats) {
    results[seat] = auditSeat(seat, { repoRoot });
  }
  return results;
}

function printReport(results) {
  for (const [seat, r] of Object.entries(results)) {
    console.log(`\n=== ${seat} seat ===`);
    for (const c of r.components) {
      console.log(`  ${c.component.padEnd(30)} ${String(c.bytes).padStart(8)} bytes  ~${c.harnessTokens} harness-tokens`);
    }
    if (r.unmeasurable.length) console.log(`  UNMEASURABLE (excluded from total): ${r.unmeasurable.join(', ')}`);
    console.log(`  ${'TOTAL'.padEnd(30)} ${String(r.totalBytes).padStart(8)} bytes  ~${r.totalHarnessTokens} harness-tokens`);
  }
}

async function main() {
  const seats = parseSeats(process.argv.slice(2));
  const results = runAudit(seats);
  printReport(results);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
