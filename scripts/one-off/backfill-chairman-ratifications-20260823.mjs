#!/usr/bin/env node
/**
 * ONE-OFF — SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-5. Delete this file after a single
 * successful run, per this repo's one-off convention.
 *
 * Backfills the week's ratified-and-encoded specimens from the source evidence packet
 * (git 783ac23f7f5, .artifacts/adam-plans/role-contract-evaluation-consolidated-packet-20260823.md)
 * into chairman_ratifications, using ONLY the FR-2 writer helpers (recordHistoricalRatification +
 * markRatificationEncoded) — never a hand-authored INSERT.
 *
 * ============================== 7-vs-9 RECONCILIATION (FR-5 AC #2) ==============================
 * SD scope stated "7 specimens". The source packet's headline prose says "7+ specimens found"
 * but its own enumeration lists 9 named items (comma-separated, section 1):
 *   1. drive-workers directive              2. Solomon's daily cadence
 *   3. coordinator's raise-issues-to-Adam    4. plan-of-day blessing regime
 *   5. N=4 focus budget                      6. 1-week empirical review
 *   7. mech-amend calibration conflict       8. close-out-first precedence
 *   9. Solomon-over-Adam mirror edge
 * VALIDATION's finding stands: 9, not 7 — the "7+" in the prose undercounts its own list.
 *
 * Cross-referencing against the packet's separate "9 encodings landed tonight" bullet list shows
 * item 3 (coordinator's raise-issues-to-Adam channel) is the ONLY one of the 9 NOT present in the
 * landed-tonight list — it was found but never encoded. FR-5's acceptance criteria requires "every
 * backfilled row has encoded_at populated (none land as stale)", so item 3 is OUT OF SCOPE for this
 * backfill (an unencoded seed would misrepresent it as regressed-or-never-fixed when it is simply
 * un-fixed — that is FR-3's staleness gauge's job to surface live, not this script's to fabricate).
 *
 * The landed-tonight list also names TWO items with no 1:1 match in the enumerated 9 — "verified-
 * chairman-unparkable line" and "review-as-input commitment" (both Adam §5g / §5d) — additional
 * encodings beyond the original 9-item systemic-class list, not substitutes for item 3.
 *
 * RESOLVED BACKFILL POPULATION: the 8 of the enumerated 9 that WERE encoded, plus the 2 additional
 * landed-tonight items not in the original enumeration = 10 rows below. All resolve to Adam or
 * Solomon contracts only — 'coordinator' and 'protocol' are NOT represented (per FR-5 AC #3, this
 * script must not assume all four target_contracts values appear; it pins against this resolved
 * list only).
 * ===================================================================================================
 *
 * STATUS: NOT YET RUNNABLE. Two prerequisites are outstanding and MUST be resolved before this
 * script executes for real (the guard below refuses to run until both are true):
 *   (a) database/chairman-gated/20260823_chairman_ratifications.sql is chairman-gated and has NOT
 *       been applied yet (@approved-by: <PENDING> in the migration header) — chairman_ratifications
 *       does not exist in the live DB.
 *   (b) Each SPECIMEN entry's `quote` and `manifestHash` below is a TODO placeholder, not fabricated
 *       text — the packet gives THEMES/section refs, not verbatim ratified prose, and manifestHash
 *       must be the REAL content_hash from claude-generation-manifest.json at encoding time. Filling
 *       these in requires reading the live CLAUDE_ADAM.md / CLAUDE_SOLOMON.md sections named below
 *       and the manifest as of the "9 encodings landed tonight" commit — do that before running, do
 *       not invent quote text to make the script pass.
 *
 * Usage (once both prerequisites above are resolved):
 *   node scripts/one-off/backfill-chairman-ratifications-20260823.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { recordHistoricalRatification, markRatificationEncoded } from '../../lib/chairman/ratification-writer.mjs';

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key);
}

// ratifiedAt: the chairman's verbal commission timestamp from the packet header
// ("chairman verbal 2026-08-22 ~22:5xZ"). APPROXIMATED to 22:55Z pending an exact-minute source
// -- table is append-only (no correcting this after insert), so RATIFIED_AT_CONFIRMED below is a
// SEPARATE, deliberate guard from the SPECIMENS TODOs (TESTING finding D2): confirm the exact
// minute against the source before flipping it, do not silently accept the approximation.
const RATIFIED_AT = '2026-08-22T22:55:00.000Z';
const RATIFIED_AT_CONFIRMED = false;

const SPECIMENS = [
  { quote: 'TODO — verbatim source: chairman verbal 2026-08-22 ~22:5xZ, drive-the-workers directive', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5b', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — Solomon 24-48h daily cadence (contract + QF-347 loop spec)', source: 'terminal:783ac23f7f5', targetContracts: ['solomon'], scribeSeat: 'solomon', sectionId: 'TODO-solomon-cadence', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — plan-of-day blessing regime', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5d', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — N=4 focus budget', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5d', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — 1-week empirical review', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5d', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — mech-amend calibration conflict / carve-out', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-3c', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — close-out-first precedence', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5f', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — Solomon-over-Adam mirror edge', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-2b', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — verified-chairman-unparkable line', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5g', markerText: 'TODO', manifestHash: 'TODO' },
  { quote: 'TODO — review-as-input commitment', source: 'terminal:783ac23f7f5', targetContracts: ['adam'], scribeSeat: 'adam', sectionId: 'TODO-adam-5d', markerText: 'TODO', manifestHash: 'TODO' },
];

// A head:true count on a missing table returns {error:null, count:null} — no error at all — so
// existence CANNOT be tested that way (measured false-positive in this repo's own DB gotchas
// reference). A plain non-head read errors loudly (42P01/PGRST205) instead.
async function tableExists(sb) {
  const { error } = await sb.from('chairman_ratifications').select('id').limit(1);
  if (!error) return true;
  return error.code !== '42P01' && error.code !== 'PGRST205';
}

async function main() {
  const sb = makeClient();

  if (!(await tableExists(sb))) {
    console.error('REFUSING TO RUN: chairman_ratifications does not exist yet — the FR-1 migration ' +
      '(database/chairman-gated/20260823_chairman_ratifications.sql) is chairman-gated and unapplied. ' +
      'Apply it first, then re-run this script.');
    process.exit(1);
  }

  if (SPECIMENS.some((s) => s.quote.startsWith('TODO') || s.markerText === 'TODO' || s.sectionId.startsWith('TODO') || s.manifestHash === 'TODO')) {
    console.error('REFUSING TO RUN: SPECIMENS still contains TODO placeholders for quote/sectionId/markerText/manifestHash. ' +
      'Resolve each against the live CLAUDE_ADAM.md / CLAUDE_SOLOMON.md content and the ' +
      'claude-generation-manifest.json content_hash as of the "9 encodings landed tonight" commit ' +
      'before running — do not fabricate quote text.');
    process.exit(1);
  }

  if (!RATIFIED_AT_CONFIRMED) {
    console.error(`REFUSING TO RUN: RATIFIED_AT (${RATIFIED_AT}) is an APPROXIMATION ("~22:5xZ" in the source ` +
      'packet), not a confirmed exact minute. This table is append-only — an approximated timestamp ' +
      'inserted now can never be corrected. Confirm the exact minute, then set RATIFIED_AT_CONFIRMED = true.');
    process.exit(1);
  }

  let inserted = 0;
  for (const s of SPECIMENS) {
    const row = await recordHistoricalRatification(sb, {
      quote: s.quote, source: s.source, targetContracts: s.targetContracts, scribeSeat: s.scribeSeat,
    }, RATIFIED_AT);
    const { affected } = await markRatificationEncoded(sb, row.id, {
      sectionId: s.sectionId, manifestHash: s.manifestHash, markerText: s.markerText,
    });
    if (affected !== 1) throw new Error(`markRatificationEncoded did not affect exactly 1 row for ${row.id}`);
    inserted += 1;
  }
  console.log(`Backfilled ${inserted} chairman_ratifications rows (all encoded_at populated).`);
}

main().catch((e) => { console.error('BACKFILL FAILED:', e && e.message); process.exit(1); });
