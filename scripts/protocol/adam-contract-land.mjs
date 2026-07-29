#!/usr/bin/env node
/**
 * FR-3 — land the corrected Adam contract + companions into leo_protocol_sections.
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001.
 *
 * DRY-RUN BY DEFAULT. Writing here changes what every live Adam session loads, so it takes two
 * independent gates, mirroring scripts/solomon-judgment-expiry-run.mjs:
 *     LEO_ADAM_CONTRACT_LAND=1   and   --apply
 * Neither alone writes anything.
 *
 * WHY IT IS NOT ARMED YET (do not remove these gates to "make it work"):
 *   1. CORRECTED is the chairman-approved shortened file PLUS two restorations (5q, 5r). Those
 *      restore content he had already approved being IN the contract, but the composite is not
 *      literally the artifact he signed off.
 *   2. 340 of 533 inventory obligations still carry no disposition.
 *   3. TEMPORARY CADENCE OVERRIDE is unresolved and is his call: a verbal set the SMS heartbeat
 *      to 30min "until he restores hourly", and the shortened contract reverts it silently.
 *
 * ORDERING IS A SAFETY PROPERTY, NOT A PREFERENCE. The shortened contract references
 * CLAUDE_ADAM_MANUAL.md and CLAUDE_ADAM_PROVENANCE.md by name. Landing it before those rows exist
 * does not shorten the contract, it deletes ~60KB and leaves the remainder pointing at nothing.
 * This script therefore writes companions FIRST and refuses to proceed if that order is violated.
 */
import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply') && process.env.LEO_ADAM_CONTRACT_LAND === '1';
const DIR = 'docs/protocol/adam-contract-review-2026-07-29/';
const read = (f) => fs.readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const CONTRACT = read('CLAUDE_ADAM.CORRECTED-2026-07-29.md');
const MANUAL = read('CLAUDE_ADAM_MANUAL.DRAFT-2026-07-29.md');
const PROVENANCE = read('CLAUDE_ADAM_PROVENANCE.DRAFT-2026-07-29.md');

/** Preflight refusals — every one of these has already bitten this SD once. */
async function preflight() {
  const fail = [];

  // Row 610 is INCLUDED by both CLAUDE_ADAM.md and CLAUDE_COORDINATOR.md. Copying its body into
  // an adam_role_contract row reads identically on landing day and drifts the first time 610 is
  // edited — and the drift check stays green, because it compares DB-to-file, not duplication.
  const { data: partnership } = await supabase
    .from('leo_protocol_sections').select('id, content')
    .eq('section_type', 'role_partnership_contract').maybeSingle();
  if (partnership) {
    const probe = partnership.content.slice(0, 120).replace(/\s+/g, ' ').trim();
    if (probe && CONTRACT.replace(/\s+/g, ' ').includes(probe)) {
      fail.push('SHARED-ROW COPY: the partnership body (row ' + partnership.id + ') appears inside the contract text. It must be INCLUDED via role_partnership_contract, never copied.');
    }
  }

  // The whole point of the SD. A byte proxy is what mis-sized this contract originally, so this
  // is a floor check, not the acceptance step — the un-paginated read of the GENERATED file is.
  const projected = CONTRACT.length / 2.507;
  if (projected > 25000) fail.push(`CONTRACT OVER CAP: ~${Math.round(projected)} projected tokens.`);

  // A companion that exists but is empty is worse than absent: the contract points at it by name.
  if (MANUAL.length < 2000) fail.push('MANUAL companion is suspiciously small — refusing to land a stub the contract references.');
  if (PROVENANCE.length < 1000) fail.push('PROVENANCE companion is suspiciously small — same reason.');

  return fail;
}

const plan = [
  { order: 1, target: 'adam_manual (NEW section_type)', bytes: MANUAL.length, note: 'companion FIRST — the contract references it by name' },
  { order: 2, target: 'adam_provenance (NEW section_type)', bytes: PROVENANCE.length, note: 'companion FIRST — partial by design, coverage disclosed in-file' },
  { order: 3, target: 'adam_role_contract row 601 (REPLACE 70,049 B)', bytes: CONTRACT.length, note: 'only AFTER both companions exist' },
];

(async () => {
  const fail = await preflight();
  console.log('=== FR-3 LANDING PLAN ===');
  for (const p of plan) console.log(`  ${p.order}. ${p.target}  [${p.bytes} B]  — ${p.note}`);
  console.log('');
  console.log('preflight refusals:', fail.length ? '\n  * ' + fail.join('\n  * ') : 'none');
  console.log('');

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Both gates are required: LEO_ADAM_CONTRACT_LAND=1 and --apply.');
    console.log('This step is deliberately unarmed; see the header for the three open items that must');
    console.log('close first (chairman review of the composite, 340 undispositioned obligations, and');
    console.log('the TEMPORARY CADENCE OVERRIDE question).');
    process.exit(0);
  }
  if (fail.length) {
    console.error('REFUSING TO APPLY — preflight failed.');
    process.exit(1);
  }
  console.error('APPLY path intentionally not implemented yet — see header. Close the three open items first.');
  process.exit(1);
})();
