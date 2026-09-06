import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { singleReadFit } = require('../../lib/protocol/contract-read-coverage.cjs');

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

// Markers must be byte-identical across every target file: one ledger row carries one marker,
// and it has to be a literal substring of each rendered target. These three already sit in 601
// and (for two of them) 605, so they are copied here rather than re-derived.
const M_CAPA = 'FOUNDATION CAPA PROGRAMME: corrective AND preventive, every workstream carrying a CI-asserted exit predicate (ratification 49656c8c)';
const M_LEDGER = 'LEDGER REPAIR PRECEDES THE FRESHNESS LEVER (ratification 1726f11d)';
const M_SURFACES = 'ALTIFYAI STAGE 23: BUILD THE ELEVEN SURFACES, and the fourteen-journey set is the specification of record (ratification 767b288f)';
const M_REPEAL = 'HEADROOM LAUNCH CONDITION REPEALED (ratification 584e3e0e, repealing f7303528)';

// Terse by necessity: CLAUDE_SOLOMON.md is the one contract whose cap generation ENFORCES, and the
// measured headroom after Solomon's own nomination is ~363 tokens. Operative only; the provenance
// lives on the ratification rows and in section 636.
const SOLOMON_ADDITIONS = [
  `- **${M_CAPA}** — Solomon: define each exit predicate, sequence against the roadmap on measured capacity, re-run weekly.`,
  `- **${M_LEDGER}** — Solomon: the ledger cannot grade advice; report no uptake rate until decision and outcome discriminate.`,
  `- **${M_SURFACES}** — Solomon: re-keying is closed; report zero stages/day as expected and issue the deferred addendum.`,
];

// SITE-EDIT repeal: a superseded sentence carries its repeal at its own site (ratification c44cd9d8).
const REPEAL_FIND = 'when the active window has at least sixty percent headroom (f7303528), ';
const REPEAL_REPLACE = `(**${M_REPEAL}**) `;

const ADAM_REPEAL_CLAUSE = `- **${M_REPEAL}** — Chairman in-terminal 2026-09-03 ~13:0xZ, verbatim: "Please remove the headroom rule." Repeals f7303528, which had required at least sixty percent of the active window remaining before the standing Friday foundation audit could launch. The Friday cadence itself is unchanged; only the headroom precondition is removed. Recorded at the repealed sentence's own site in the Solomon contract per ratification c44cd9d8.`;

const { data: rows, error } = await s.from('leo_protocol_sections').select('id,content').in('id', [601, 611]);
if (error) { console.log('READ FAILED', error); process.exit(1); }
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

// ---- 611 ----
let c611 = byId[611].content;
const before611 = c611.length;
const problems = [];

const nRepeal = c611.split(REPEAL_FIND).length - 1;
if (nRepeal !== 1) problems.push(`repeal site: found ${nRepeal} times, expected 1`);
else c611 = c611.replace(REPEAL_FIND, REPEAL_REPLACE);

const toAdd611 = SOLOMON_ADDITIONS.filter((a) => {
  const marker = [M_CAPA, M_LEDGER, M_SURFACES].find((m) => a.includes(m));
  return !c611.includes(marker);
});
if (toAdd611.length) c611 = c611.replace(/\s*$/, '') + '\n' + toAdd611.join('\n') + '\n';

console.log(`611: ${before611} -> ${c611.length} chars (${c611.length - before611 >= 0 ? '+' : ''}${c611.length - before611})`);
if (problems.length) { for (const p of problems) console.log('  ! ' + p); }

// ---- 601 ----
let c601 = byId[601].content;
const before601 = c601.length;
if (!c601.includes(M_REPEAL)) c601 = c601.replace(/\s*$/, '') + '\n' + ADAM_REPEAL_CLAUSE + '\n';
console.log(`601: ${before601} -> ${c601.length} chars (+${c601.length - before601})`);

// ---- HARD SIZE CHECK before writing: predict the rendered Solomon file ----
const currentFit = singleReadFit(process.cwd(), 'CLAUDE_SOLOMON.md');
const deltaChars = c611.length - before611;
const predictedTokens = currentFit.tokens + Math.ceil(deltaChars / 2.42);
console.log(`\nCLAUDE_SOLOMON.md now ${currentFit.tokens} tokens; predicted after edit ~${predictedTokens} (cap 25000)`);
if (predictedTokens >= 25000) {
  console.log('REFUSING TO WRITE: this would push the one enforced contract over its cap. More headroom is needed first.');
  process.exit(1);
}
if (problems.length) { console.log('REFUSING TO WRITE: unresolved problems above.'); process.exit(1); }

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0); }

const bk = path.join(process.cwd(), 'scripts', 'one-off', 'encode-backup-0903');
fs.mkdirSync(bk, { recursive: true });
fs.writeFileSync(path.join(bk, 'section-611.pre-solomon-shares.txt'), byId[611].content);
fs.writeFileSync(path.join(bk, 'section-601.pre-repeal.txt'), byId[601].content);

const { error: e1 } = await s.from('leo_protocol_sections').update({ content: c611 }).eq('id', 611);
console.log('611 write:', e1 ? JSON.stringify(e1) : 'OK');
const { error: e2 } = await s.from('leo_protocol_sections').update({ content: c601 }).eq('id', 601);
console.log('601 write:', e2 ? JSON.stringify(e2) : 'OK');

const { data: back } = await s.from('leo_protocol_sections').select('id,content').in('id', [601, 611]);
const b611 = back.find((r) => r.id === 611).content;
const b601 = back.find((r) => r.id === 601).content;
console.log('\nREADBACK markers in DB content:');
for (const [n, m] of [['49656c8c', M_CAPA], ['1726f11d', M_LEDGER], ['767b288f', M_SURFACES], ['584e3e0e', M_REPEAL]]) {
  console.log(`  ${n}: 611=${b611.includes(m) ? 'PRESENT' : 'missing'}  601=${b601.includes(m) ? 'PRESENT' : 'missing'}`);
}
console.log('  repealed condition text gone from 611:', !b611.includes(REPEAL_FIND));
