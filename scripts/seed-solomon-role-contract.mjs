#!/usr/bin/env node
// One-shot (idempotent): seed/refresh the solomon_role_contract section in leo_protocol_sections.
// FR-5 of SD-LEO-INFRA-SOLOMON-CONSULT-001E-B.
//
// Seeds ONLY the clean role-contract body (from the `**Role**:` line through the end of §11),
// mirroring the Adam (id=601) / Coordinator (id=605) convention — NOT the whole authoring doc.
// The doc's HTML comment, Status/Model-Strategy preamble, the §"Solomon Role Contract" heading
// (re-added by formatSection from the section title), the Changelog, and the footer are stripped:
// seeding them embeds a self-contradicting "<!-- NOT a generated file -->" comment + a superseded
// "PARKED/HARD-GATED on Fable" changelog + a now-false footer into the generated CLAUDE_SOLOMON.md.
//
// id handling: leo_protocol_sections has NO usable pkey sequence default (the sequence lags max(id),
// so a bare insert collides). We hand-assign id = max(id)+1 like one-off/_role-partnership-contract-
// section.mjs. Re-running UPDATES the existing row's content (idempotent + reproducible).
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// docs/ lives in the main repo root (3 levels up from a worktree's scripts/; 2 levels in the main repo).
const candidatePaths = [
  join(__dirname, '../docs/architecture/solomon-agent-definition.md'),
  join(__dirname, '../../..', 'docs/architecture/solomon-agent-definition.md'),
];
const sourcePath = candidatePaths.find((p) => fs.existsSync(p));
if (!sourcePath) {
  console.error('Could not locate solomon-agent-definition.md in:', candidatePaths);
  process.exit(1);
}
const raw = fs.readFileSync(sourcePath, 'utf8');

// Slice the clean contract body: from the **Role**: line through just before the Changelog.
const START = '**Role**: Solomon is the LEO harness';
const END = '## Changelog';
const startIdx = raw.indexOf(START);
const endIdx = raw.indexOf(END);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error(`Slice markers not found (start=${startIdx}, end=${endIdx}) — doc structure changed; aborting.`);
  process.exit(1);
}
let content = raw.slice(startIdx, endIdx).trim();
// Drop a trailing horizontal rule left over from the section boundary.
content = content.replace(/\n+---\s*$/, '').trim();

// Defensive: the seeded body must be clean.
if (content.includes('<!-- AUTHORED') || content.includes(END) || !content.startsWith('**Role**:')) {
  console.error('Sliced body failed cleanliness check (HTML comment / changelog / wrong start) — aborting.');
  process.exit(1);
}

const { data: protocol, error: protoErr } = await sb
  .from('leo_protocols')
  .select('id, version')
  .eq('status', 'active')
  .single();
if (protoErr || !protocol) {
  console.error('Could not get active protocol:', protoErr?.message);
  process.exit(1);
}
console.log('Active protocol:', protocol.id, protocol.version, '| body length:', content.length);

const fields = {
  protocol_id: protocol.id,
  section_type: 'solomon_role_contract',
  target_file: 'CLAUDE_SOLOMON.md',
  order_index: 2640,
  title: 'Solomon Role Contract',
  content,
};

const { data: existing } = await sb
  .from('leo_protocol_sections')
  .select('id')
  .eq('section_type', 'solomon_role_contract')
  .maybeSingle();

if (existing) {
  const { error } = await sb.from('leo_protocol_sections').update(fields).eq('id', existing.id);
  if (error) { console.error('UPDATE ERR:', error.message); process.exit(1); }
  console.log('Updated solomon_role_contract (id=' + existing.id + ') with clean body.');
} else {
  // Hand-assign id = max(id)+1 (no usable sequence default on this table).
  const { data: maxRow, error: maxErr } = await sb
    .from('leo_protocol_sections')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();
  if (maxErr) { console.error('max(id) lookup ERR:', maxErr.message); process.exit(1); }
  const nextId = maxRow.id + 1;
  const { error } = await sb.from('leo_protocol_sections').insert({ id: nextId, ...fields });
  if (error) { console.error('INSERT ERR:', error.message); process.exit(1); }
  console.log('Inserted solomon_role_contract (id=' + nextId + ') with clean body.');
}

// Verify the persisted row.
const { data: verify } = await sb
  .from('leo_protocol_sections')
  .select('id, section_type, order_index, target_file, content')
  .eq('section_type', 'solomon_role_contract')
  .single();
console.log('Verified id=' + verify.id + ' target=' + verify.target_file + ' order=' + verify.order_index
  + ' len=' + verify.content.length + ' head=' + JSON.stringify(verify.content.slice(0, 40)));
if (verify.content.includes('<!-- AUTHORED') || verify.content.includes('## Changelog')) {
  console.error('POST-WRITE CHECK FAILED: persisted content still contains cruft.');
  process.exit(1);
}
console.log('OK — clean role-contract body persisted.');
