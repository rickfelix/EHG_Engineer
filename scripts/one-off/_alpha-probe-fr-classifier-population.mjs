/**
 * Population probe for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * The specimen classified 0/6 delivered. Before concluding anything about the FR-id
 * linkage, measure the POPULATION: run the real classifier over recent COMPLETED SDs
 * that have a PRD with FRs, and report the distribution of delivery ratios.
 *
 * This decides the fix: if delivered>0 is rare across the board, the DELIVERED test
 * (story text must contain the FR id) does not match how stories are actually authored,
 * and enabling enforcement today would hard-fail nearly every SD. Read-only.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { classifyFrDelivery } from '../modules/handoff/gates/fr-delivery-classifier.js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LIMIT = Number(process.argv[2] || 60);

const { data: sds } = await s
  .from('strategic_directives_v2')
  .select('id, sd_key, metadata, updated_at')
  .eq('status', 'completed')
  .order('updated_at', { ascending: false })
  .limit(LIMIT);

let withPrd = 0;
const buckets = { full: 0, partial: 0, zero: 0 };
// SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001: the ratio alone no longer decides anything. What
// matters now is WHY an SD is short — a genuinely missing FR (the convention is in use here)
// versus an unmeasurable one (it is not). Only the former is a real hard-fail under enforcement.
const kinds = { allUnverifiable: 0, someUndelivered: 0, clean: 0, mixed: 0 };
const rows = [];

for (const sd of sds || []) {
  const c = await classifyFrDelivery(s, {
    sdId: sd.id,
    directiveId: sd.sd_key,
    sdMetadata: sd.metadata || {},
  });
  if (c.total === 0) continue;
  withPrd++;
  const satisfied = c.delivered + c.descoped;
  const pct = Math.round((satisfied / c.total) * 100);
  if (pct === 100) buckets.full++;
  else if (pct > 0) buckets.partial++;
  else buckets.zero++;

  const unver = c.unverifiable || 0;
  if (c.undelivered > 0 && unver > 0) kinds.mixed++;
  else if (c.undelivered > 0) kinds.someUndelivered++;
  else if (unver === c.total) kinds.allUnverifiable++;
  else kinds.clean++;

  rows.push({
    key: sd.sd_key, total: c.total, delivered: c.delivered, descoped: c.descoped,
    undelivered: c.undelivered, unverifiable: unver, conventionInUse: c.convention_in_use, pct,
  });
}

console.log(`Scanned ${sds.length} most-recent COMPLETED SDs; ${withPrd} had a PRD with >=1 FR.\n`);
console.log('DISTRIBUTION OF FR-DELIVERY RATIO (as the shipped classifier computes it):');
console.log(`  100% satisfied : ${buckets.full}`);
console.log(`  partial (1-99%): ${buckets.partial}`);
console.log(`  0% satisfied   : ${buckets.zero}`);
const ratioShort = buckets.partial + buckets.zero;
console.log(`\n  (ratio-short, the OLD hard-fail set): ${ratioShort}/${withPrd}` +
  (withPrd ? ` (${Math.round((ratioShort / withPrd) * 100)}%)` : ''));

console.log('\nWHY EACH SD IS SHORT (the distinction the repair introduces):');
console.log(`  fully UNVERIFIABLE (convention not in use — blindness, not absence): ${kinds.allUnverifiable}`);
console.log(`  has genuinely UNDELIVERED FR(s) (convention IS in use here)        : ${kinds.someUndelivered}`);
console.log(`  mixed undelivered + unverifiable                                    : ${kinds.mixed}`);
console.log(`  clean (all delivered or approver-descoped)                          : ${kinds.clean}`);

const realFail = kinds.someUndelivered + kinds.mixed;
console.log(`\nWOULD HARD-FAIL UNDER ENFORCEMENT, AFTER THE REPAIR: ${realFail}/${withPrd}` +
  (withPrd ? ` (${Math.round((realFail / withPrd) * 100)}%)` : '') +
  `\n  — down from ${ratioShort}/${withPrd}. The difference is SDs that were being blamed for` +
  `\n    non-delivery when the gate simply could not see them.`);

console.log('\nPer-SD detail (satisfied/total | undelivered | unverifiable | convention-in-use):');
for (const r of rows) {
  console.log(`  ${String(r.pct).padStart(3)}%  ${r.delivered + r.descoped}/${r.total}  undel=${r.undelivered} unver=${r.unverifiable} conv=${r.conventionInUse ? 'YES' : 'no '}  ${r.key}`);
}
