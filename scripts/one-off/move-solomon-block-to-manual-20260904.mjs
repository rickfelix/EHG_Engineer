#!/usr/bin/env node
// Companion move for the CLAUDE_SOLOMON.md single-Read cap (MUST_FIT_SINGLE_READ), decided by Solomon on his
// own contract (consult 71d29137 -> reply 3f93d9a4, 2026-09-04 12:45Z): move TWO reference-shaped blocks from
// section 611 (solomon_role_contract) to section 629 (solomon_manual), leaving the exact pointer text he
// specified at each original site. Idempotent: guarded by the pointer markers.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const POINTER_6 = 'Inputs and triggers (five sources, three gate types): MANUAL § Inputs & Triggers; the gates themselves bind in §3.';
const POINTER_WRITER = '**SELF-ASSESSMENT DUTY (durable)**: wired as an alias of the `deep-sweep` loop in `SOLOMON_LOOPS`. The rubric self-score writer (`category=\'solomon_self_assessment\'`, RUBRIC QUALITY) is a SEPARATE signal from `solomon_adherence_drift` (DUTY COMPLIANCE); procedure: MANUAL § Self-score writer, procedure.';
const MANUAL_H6 = '## Inputs & Triggers (moved from CLAUDE_SOLOMON.md 2026-09-04)';
const MANUAL_HW = '### Self-score writer, procedure (moved from CLAUDE_SOLOMON.md 2026-09-04)';

async function load(id) {
  const { data, error } = await supabase.from('leo_protocol_sections').select('content').eq('id', id).single();
  if (error) throw new Error(`load ${id}: ${error.message}`);
  return data.content;
}
async function save(id, before, after) {
  if (after === before) { console.log(`  [noop] ${id}`); return; }
  const { error } = await supabase.from('leo_protocol_sections').update({ content: after }).eq('id', id);
  if (error) throw new Error(`update ${id}: ${error.message}`);
  const { data, error: e2 } = await supabase.from('leo_protocol_sections').select('content').eq('id', id).single();
  if (e2 || data.content !== after) throw new Error(`readback ${id} mismatch`);
  console.log(`  [saved] ${id}: ${Buffer.byteLength(before, 'utf8')} -> ${Buffer.byteLength(after, 'utf8')} bytes (readback verified)`);
}

const c611 = await load(611);
const c629 = await load(629);
let n611 = c611;
let n629 = c629;
const moved = [];

// ---- move 1: "## 6. Inputs & Triggers" (whole block up to the next same-or-higher heading)
if (!n611.includes(POINTER_6)) {
  const start = n611.indexOf('\n## 6. Inputs & Triggers');
  if (start < 0) throw new Error('611: "## 6. Inputs & Triggers" not found');
  const re = /\n#{1,2} /g; re.lastIndex = start + 1;
  const m = re.exec(n611);
  const end = m ? m.index : n611.length;
  const block = n611.slice(start + 1, end);
  const body = block.replace(/^## 6\. Inputs & Triggers\n/, '').replace(/\n---\s*$/, '\n');
  n611 = n611.slice(0, start + 1) + `## 6. Inputs & Triggers\n\n${POINTER_6}\n\n---\n` + n611.slice(end);
  n629 = n629.replace(/\n?$/, '\n') + `\n${MANUAL_H6}\n\nMoved verbatim from the gated contract on 2026-09-04 (companion move for the single-Read cap; Solomon decision 3f93d9a4). Reference: the five-source table of the three gate types; every gate binds in the contract's §3 at the mode that owns it.\n\n${body}`;
  moved.push(`§6 (${Buffer.byteLength(block, 'utf8')} bytes)`);
} else console.log('  [skip] §6 already moved');

// ---- move 2: the "Rubric self-score writer" paragraph inside the Self-assessment section
if (!n611.includes(POINTER_WRITER)) {
  const i = n611.indexOf('**Rubric self-score writer (durable; additive channel');
  if (i < 0) throw new Error('611: writer paragraph not found');
  const ps = n611.lastIndexOf('\n\n', i) + 2;
  const pe = n611.indexOf('\n\n', i);
  const para = n611.slice(ps, pe);
  if (!para.includes('SELF-ASSESSMENT DUTY (durable)')) throw new Error('611: writer paragraph bounds wrong (duty sentence not inside)');
  n611 = n611.slice(0, ps) + POINTER_WRITER + n611.slice(pe);
  n629 = n629.replace(/\n?$/, '\n') + `\n${MANUAL_HW}\n\nMoved verbatim from the gated contract's Self-assessment section on 2026-09-04 (companion move for the single-Read cap; Solomon decision 3f93d9a4). The binding sentence (SELF-ASSESSMENT DUTY wired as an alias of the deep-sweep loop) and the category distinction stay in the contract as a two-line pointer; this is the script path, invocation and schema detail.\n\n${para}\n`;
  moved.push(`writer paragraph (${Buffer.byteLength(para, 'utf8')} bytes)`);
} else console.log('  [skip] writer paragraph already moved');

// binding-word tripwire on what leaves the contract (review, not a gate: Solomon dispositioned both blocks)
const removed = c611.length - n611.length;
console.log(`moved: ${moved.join(', ') || 'nothing'}; 611 shrinks by ${removed} chars`);
await save(611, c611, n611);
await save(629, c629, n629);
console.log(`611 bytes now: ${Buffer.byteLength(n611, 'utf8')} (budget by bytes 60,442; the generator's token estimate is the instrument that decides)`);
