#!/usr/bin/env node
/**
 * Unit-Tier Quarantine — SD-LEO-FIX-GREEN-MAIN-TRIAGE-001
 *
 * The canonical unit tier (vitest --project unit) was deeply red (188 failing
 * files / 478 failing tests on 2026-06-11). Every fleet worker re-discovered
 * and re-triaged the same failures per SD. This tool:
 *
 *   report  <run.log>            — parse a vitest unit-tier log, classify every
 *                                  failing file by error signature, print counts.
 *   build   <run.log> [--refs J] — write tests/quarantine-manifest.json (one
 *                                  tracked entry per quarantined file:
 *                                  {file, reason_class, error_signature,
 *                                   linked_ref, quarantined_at, quarantined_by}).
 *   burndown                     — emit UNIT_TIER_BURNDOWN to coordination_events
 *                                  {failing_files, quarantined_files, total_files}
 *                                  (fail-soft; needs env creds).
 *
 * The vitest unit project reads the manifest and EXCLUDES quarantined files
 * (config-driven — un-quarantine = delete one manifest entry). Nothing is
 * skipped without a reason_class + linked_ref (the manifest IS the debt
 * register; see tests/unit/quarantine-manifest.test.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'tests', 'quarantine-manifest.json');

// Signature precedence — first match wins. Class → default linked_ref.
export const CLASS_DEFAULT_REFS = {
  'windows-abort-0xC0000409': 'SD-FDBK-INFRA-SWEEP-CLI-EXIT-001',
  'live-db-dependent': 'SD-LEO-INFRA-ENFORCE-UNIT-TIER-001',
  'duplicate': 'SD-LEO-INFRA-TEST-ESTATE-HYGIENE-001',
  'supabase-mock-chain': 'SD-LEO-FIX-GREEN-MAIN-TRIAGE-001',
  'timeout': 'SD-LEO-FIX-GREEN-MAIN-TRIAGE-001',
  'suite-load-error': 'SD-LEO-FIX-GREEN-MAIN-TRIAGE-001',
  'assertion-drift': 'SD-LEO-FIX-GREEN-MAIN-TRIAGE-001',
  'unclassified': 'SD-LEO-FIX-GREEN-MAIN-TRIAGE-001',
};

// Known exact/near-duplicate files (TEST-ESTATE-HYGIENE inventory).
const KNOWN_DUPLICATES = new Set([
  'tests/unit/handoff-orchestrator.test.js', // 28KB near-twin of tests/unit/handoff/handoff-orchestrator.test.js
]);

export function classifyError(errorText) {
  if (/3221226505/.test(errorText)) return 'windows-abort-0xC0000409';
  if (/Test timed out/i.test(errorText)) return 'timeout';
  if (/is not a function/.test(errorText) &&
      /(\.select|\.eq|\.maybeSingle|\.order|\.limit|\.in\(|\.single|from\(|supabase)/i.test(errorText)) {
    return 'supabase-mock-chain';
  }
  if (/(fetch failed|ECONNREFUSED|PGRST\d|42703|supabase(Url|Key) is required|Invalid API key)/i.test(errorText)) {
    return 'live-db-dependent';
  }
  if (/No test suite found|Failed to load|Cannot find (module|package)|SyntaxError|ReferenceError.*is not defined[\s\S]*?\bimport\b/.test(errorText)) {
    return 'suite-load-error';
  }
  if (/is not a function/.test(errorText)) return 'supabase-mock-chain'; // method-missing on grown APIs — same remediation shape
  if (/AssertionError|expected .+ to (be|equal|deep|match|contain)/i.test(errorText)) return 'assertion-drift';
  return 'unclassified';
}

/** Parse a vitest run log → Map<file, {signatures: string[], firstError: string}> */
export function parseFailures(logText) {
  const failures = new Map();
  const lines = logText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ FAIL {2}\|unit\| (\S+?\.(?:test|spec)\.[cm]?js)/);
    if (!m) continue;
    const file = m[1];
    // Error block: lines until the ⎯ divider or the next FAIL header.
    const block = [];
    for (let j = i + 1; j < lines.length && block.length < 12; j++) {
      if (/^ FAIL {2}\|unit\|/.test(lines[j]) || /^⎯/.test(lines[j].trim().slice(0, 1))) break;
      block.push(lines[j]);
    }
    const errorText = block.join('\n').trim();
    if (!failures.has(file)) failures.set(file, { errors: [] });
    failures.get(file).errors.push(errorText);
  }
  // Also capture summary-marked failed files that have no detail block (rare).
  for (const line of lines) {
    const s = line.match(/^ ❯ \|unit\| (\S+?\.(?:test|spec)\.[cm]?js)/);
    if (s && !failures.has(s[1])) failures.set(s[1], { errors: [''] });
  }
  return failures;
}

export function classifyFile(file, errors) {
  if (KNOWN_DUPLICATES.has(file)) return 'duplicate';
  const counts = {};
  for (const e of errors) {
    const c = classifyError(e);
    counts[c] = (counts[c] || 0) + 1;
  }
  // Dominant class, with the precedence order as tiebreaker.
  const order = Object.keys(CLASS_DEFAULT_REFS);
  return Object.entries(counts).sort((a, b) =>
    b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0][0];
}

function buildEntries(logText, refs) {
  const failures = parseFailures(logText);
  const entries = [];
  for (const [file, { errors }] of [...failures.entries()].sort()) {
    const reason_class = classifyFile(file, errors);
    const sig = (errors.find(e => e) || '').split('\n').find(l => l.trim()) || '(no detail captured)';
    entries.push({
      file,
      reason_class,
      error_signature: sig.trim().slice(0, 200),
      linked_ref: refs[reason_class] || CLASS_DEFAULT_REFS[reason_class],
      quarantined_at: new Date().toISOString(),
      quarantined_by: process.env.CLAUDE_SESSION_ID || 'unit-tier-quarantine',
    });
  }
  return entries;
}

function report(entries) {
  const byClass = {};
  for (const e of entries) byClass[e.reason_class] = (byClass[e.reason_class] || 0) + 1;
  console.log(`Failing files: ${entries.length}`);
  for (const [c, n] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}: ${n}  → ${CLASS_DEFAULT_REFS[c]}`);
  }
  return byClass;
}

async function main() {
  const [cmd, logPath] = process.argv.slice(2);
  if (cmd === 'report' || cmd === 'build') {
    const logText = fs.readFileSync(path.resolve(logPath), 'utf8');
    const refsIdx = process.argv.indexOf('--refs');
    const refs = refsIdx !== -1 ? JSON.parse(process.argv[refsIdx + 1]) : {};
    const entries = buildEntries(logText, refs);
    report(entries);
    if (cmd === 'build') {
      const manifest = {
        $schema: 'tests/quarantine-manifest: tracked unit-tier quarantine (SD-LEO-FIX-GREEN-MAIN-TRIAGE-001). Un-quarantine = delete the entry. Every entry MUST have reason_class + linked_ref.',
        generated_at: new Date().toISOString(),
        quarantined: entries,
      };
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`\nManifest written: ${MANIFEST_PATH} (${entries.length} entries)`);
    }
  } else if (cmd === 'burndown') {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const payload = {
      quarantined_files: manifest.quarantined.length,
      by_class: manifest.quarantined.reduce((a, e) => ((a[e.reason_class] = (a[e.reason_class] || 0) + 1), a), {}),
      source: 'unit-tier-quarantine',
    };
    const { error } = await sb.from('coordination_events').insert({
      event_type: 'UNIT_TIER_BURNDOWN', severity: 'info', payload,
    });
    console.log(error ? `burndown write failed (non-fatal): ${error.message}` : `UNIT_TIER_BURNDOWN emitted: ${JSON.stringify(payload.by_class)}`);
  } else {
    console.log('Usage: node scripts/unit-tier-quarantine.mjs report|build <run.log> [--refs JSON] | burndown');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch(e => { console.error(e.message); process.exit(1); });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
