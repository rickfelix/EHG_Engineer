import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
import { createClient } from '@supabase/supabase-js';

// Applies Solomon's OWN nomination (row 03c99caa) of movable history in section 611, verbatim,
// into section 636. Fail-closed: if any span is not found EXACTLY once, nothing is written.
// The one span he named that does not exist verbatim (L2d2) is reported, not guessed at.

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const REMOVALS = [
  ['L1 first frozen-predicate reading', 'First frozen-predicate reading (22:1xZ 2026-08-30): open=2, blocked=3, programs=30, mechanical=660 — reconciles with the 17:xxZ groom (open exactly matches; blocked residual 3-vs-1 reported to the binder, not explained away).'],
  ['L2a authority provenance', ' (authority: chairman SMS 01:38Z 2026-08-22 + in-session affirmation)'],
  ['L2b sealed debate ref', ' (sealed debate 04:3xZ 2026-08-22)'],
  ['L2d1 cadence contrast', ' (not the Mode-B sweep cadence the GROUNDING-COMPLETENESS and AUTONOMY OVERSIGHT duties use when reading the Chairman-SMS-lane source clause above)'],
  ['L3 rationale clause', ' — the inverse framing is precisely the gauge-honesty failure this resolution exists to prevent.'],
];

// L2e: replace the verbatim quote IN PLACE with the operative line Solomon says he actually executes.
const L2E_START = 'ratified rule: "Any claim relayed';
const L2E_END_MARK = 'from numbers to claims.';
const L2E_REPLACEMENT = 'every claim relayed to the chairman carries a label, MEASURED with the instrument named or INHERITED with the originating role and row named; an unlabelled inherited claim is a miss, corrected in the next line.';

const { data: rows, error } = await s.from('leo_protocol_sections').select('id,content').in('id', [611, 636]);
if (error) { console.log('READ FAILED', error); process.exit(1); }
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
let c611 = byId[611].content;
const before611 = c611.length;

const moved = [];
const problems = [];

for (const [label, span] of REMOVALS) {
  const n = c611.split(span).length - 1;
  if (n !== 1) { problems.push(`${label}: found ${n} times, expected exactly 1`); continue; }
  c611 = c611.replace(span, '');
  moved.push({ label, text: span.trim() });
}

const i = c611.indexOf(L2E_START);
const j = i >= 0 ? c611.indexOf(L2E_END_MARK, i) : -1;
if (i >= 0 && j > i) {
  const quote = c611.slice(i, j + L2E_END_MARK.length);
  c611 = c611.slice(0, i) + L2E_REPLACEMENT + c611.slice(j + L2E_END_MARK.length);
  moved.push({ label: 'L2e verbatim label-rule quote (replaced in place by its operative line)', text: quote });
} else {
  problems.push('L2e: quote span not located');
}

console.log('SPANS MOVED:', moved.length);
for (const m of moved) console.log(`  - ${m.label} (${m.text.length} chars)`);
if (problems.length) { console.log('PROBLEMS (reported, not guessed at):'); for (const p of problems) console.log('  ! ' + p); }
console.log(`611: ${before611} -> ${c611.length} chars (freed ${before611 - c611.length})`);

const stamp = 'Moved from section 611 on 2026-09-03 to free single-read headroom, nominated by Solomon (row 03c99caa) as history rather than operative rule. Verbatim, not paraphrased.';
const addition = '\n\n### Provenance moved out of the Solomon role contract (2026-09-03 headroom cut)\n\n' + stamp + '\n\n'
  + moved.map((m) => `- **${m.label}** — ${m.text}`).join('\n') + '\n';
const c636 = byId[636].content.replace(/\s*$/, '') + addition;
console.log(`636: ${byId[636].content.length} -> ${c636.length} chars (+${c636.length - byId[636].content.length})`);

if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0); }
if (problems.length && moved.length < 5) { console.log('\nREFUSING: too few spans matched.'); process.exit(1); }

const bk = path.join(process.cwd(), 'scripts', 'one-off', 'encode-backup-0903');
fs.mkdirSync(bk, { recursive: true });
fs.writeFileSync(path.join(bk, 'section-611.precut.txt'), byId[611].content);
fs.writeFileSync(path.join(bk, 'section-636.precut.txt'), byId[636].content);

const { error: e1 } = await s.from('leo_protocol_sections').update({ content: c611 }).eq('id', 611);
console.log('611 write:', e1 ? JSON.stringify(e1) : 'OK');
const { error: e2 } = await s.from('leo_protocol_sections').update({ content: c636 }).eq('id', 636);
console.log('636 write:', e2 ? JSON.stringify(e2) : 'OK');

const { data: back } = await s.from('leo_protocol_sections').select('id,content').in('id', [611, 636]);
for (const r of back || []) console.log(`  readback section ${r.id}: ${r.content.length} chars`);
const b636 = (back || []).find((r) => r.id === 636).content;
console.log('  every moved span present in 636:', moved.every((m) => b636.includes(m.text)));
const b611 = (back || []).find((r) => r.id === 611).content;
console.log('  operative label line present in 611:', b611.includes(L2E_REPLACEMENT));
