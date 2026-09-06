#!/usr/bin/env node
// @wire-check-exempt one-shot DB seed (lives under scripts/one-off/, the recognized one-shot home).
// Seed/refresh the two Michael protocol sections in leo_protocol_sections:
//   section_type=michael_role_contract  -> CLAUDE_MICHAEL.md
//   section_type=michael_model_posture  -> CLAUDE_MICHAEL_MODEL_POSTURE.md
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-4), in the shape of _seed-solomon-role-contract.mjs
// with two divergences named in the PRD: DRY-RUN BY DEFAULT (--apply to write; the precedent writes
// unconditionally) and a WORD-BUDGET REFUSAL (the contract joins MUST_FIT_SINGLE_READ, and DESIGN
// evidence 8601cbdd measured 6,200 words as the ceiling that keeps the generated file under the
// 25,000-token cap with a 20% margin; --apply refuses above 6,500).
//
// id handling: leo_protocol_sections has NO usable pkey sequence default (the sequence lags max(id),
// so a bare insert collides). We hand-assign id = max(id)+1 like the Solomon seed. Re-running UPDATES
// the existing row's content (idempotent + reproducible). context_tier='REFERENCE' (column exists;
// CHECK permits ROUTER|CORE|PHASE_LEAD|PHASE_PLAN|PHASE_EXEC|REFERENCE — VALIDATION evidence 02df770a).
//
// Path resolution: walks UP from this script to the first ancestor containing the target — works
// from the main repo root (scripts/one-off/) AND from a worktree.
//
// Usage:
//   node scripts/one-off/_michael-role-contract-section.mjs            # dry-run: print what would change
//   node scripts/one-off/_michael-role-contract-section.mjs --apply    # write + readback verify
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const WORD_CEILING = 6200;
const WORD_REFUSE = 6500;

/** First ancestor dir (incl. HERE) that contains relPath, else null. Bounded walk (no infinite loop). */
function findUp(relPath, startDir = HERE) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, relPath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Slice the clean body between the START marker and the Changelog heading; strip a trailing rule.
 * The authoring docs open with an HTML comment that NAMES both markers (so a reader knows how the
 * seed slices), so the search starts after that comment and the END search starts after START —
 * otherwise the comment's own mention of "## Changelog" is found first and the slice is empty.
 */
export function sliceBody(raw, START, END = '## Changelog') {
  // The first HTML comment may sit under a frontmatter block, so look for its close anywhere in the head.
  const close = raw.indexOf('-->');
  const commentEnd = close === -1 ? 0 : close + 3;
  const startIdx = raw.indexOf(START, commentEnd);
  const endIdx = startIdx === -1 ? -1 : raw.indexOf(END, startIdx);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`Slice markers not found (start=${startIdx}, end=${endIdx}) — doc structure changed; aborting.`);
  }
  let content = raw.slice(startIdx, endIdx).trim();
  content = content.replace(/\n+---\s*$/, '').trim();
  if (content.includes('<!-- AUTHORING') || content.includes(END) || !content.startsWith(START)) {
    throw new Error('Sliced body failed cleanliness check (HTML comment / changelog / wrong start) — aborting.');
  }
  return content;
}

export const wordCount = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;

/** The three pinned durable-duty markers; the startup check's covers[] must match these slugs. */
export const PINNED_DUTY_MARKERS = [
  '**GMAIL TAMING DUTY (durable)**',
  '**TODOIST DRIVE DUTY (durable)**',
  '**DISTRACTION MANAGEMENT DUTY (durable)**',
];

const SECTIONS = [
  {
    section_type: 'michael_role_contract',
    target_file: 'CLAUDE_MICHAEL.md',
    title: 'Michael Role Contract',
    order_index: 2660,
    source: 'docs/protocol/michael/role-contract.md',
    start: '**Role**: Michael is the chairman',
    requireMarkers: true,
  },
  {
    section_type: 'michael_model_posture',
    target_file: 'CLAUDE_MICHAEL_MODEL_POSTURE.md',
    title: 'Michael Model Posture (binding companion)',
    order_index: 2661,
    source: 'docs/protocol/michael/model-posture.md',
    start: '**Venue consequence**',
    requireMarkers: false,
  },
];

async function main() {
  const envPath = findUp('.env');
  if (envPath) config({ path: envPath });
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: protocol, error: protoErr } = await sb.from('leo_protocols').select('id, version').eq('status', 'active').single();
  if (protoErr || !protocol) { console.error('Could not get active protocol:', protoErr?.message); process.exit(1); }
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — active protocol: ${protocol.id} ${protocol.version}`);

  let problems = 0;
  for (const s of SECTIONS) {
    const sourcePath = findUp(s.source);
    if (!sourcePath) { console.error(`  ${s.section_type}: source ${s.source} not found upward from ${HERE}`); problems++; continue; }
    let content;
    try { content = sliceBody(fs.readFileSync(sourcePath, 'utf8'), s.start); }
    catch (e) { console.error(`  ${s.section_type}: ${e.message}`); problems++; continue; }
    const words = wordCount(content);
    const missing = s.requireMarkers ? PINNED_DUTY_MARKERS.filter((m) => !content.includes(m)) : [];
    const { data: existing } = await sb.from('leo_protocol_sections').select('id, content').eq('section_type', s.section_type).maybeSingle();
    const changed = !existing || existing.content !== content;
    console.log(`  ${s.section_type} -> ${s.target_file}: ${words} words (ceiling ${WORD_CEILING}), ${existing ? `existing id=${existing.id}` : 'NEW'}, ${changed ? 'content differs' : 'unchanged'}${missing.length ? `, MISSING MARKERS: ${missing.join(' ')}` : ''}`);
    if (missing.length) { problems++; continue; }
    if (words > WORD_CEILING) console.warn(`  ⚠ ${s.section_type} is over the ${WORD_CEILING}-word ceiling`);
    if (words > WORD_REFUSE) { console.error(`  ✗ ${s.section_type} exceeds ${WORD_REFUSE} words — refusing (would breach the 25,000-token single-read cap)`); problems++; continue; }
    if (!APPLY || !changed) continue;

    const fields = { protocol_id: protocol.id, section_type: s.section_type, target_file: s.target_file, order_index: s.order_index, title: s.title, content, context_tier: 'REFERENCE' };
    if (existing) {
      const { error } = await sb.from('leo_protocol_sections').update(fields).eq('id', existing.id);
      if (error) { console.error('  UPDATE ERR:', error.message); problems++; continue; }
      console.log(`  updated ${s.section_type} (id=${existing.id})`);
    } else {
      const { data: maxRow, error: maxErr } = await sb.from('leo_protocol_sections').select('id').order('id', { ascending: false }).limit(1).single();
      if (maxErr) { console.error('  max(id) lookup ERR:', maxErr.message); problems++; continue; }
      const nextId = maxRow.id + 1;
      const { error } = await sb.from('leo_protocol_sections').insert({ id: nextId, ...fields });
      if (error) { console.error('  INSERT ERR:', error.message); problems++; continue; }
      console.log(`  inserted ${s.section_type} (id=${nextId})`);
    }
    const { data: verify } = await sb.from('leo_protocol_sections').select('id, section_type, target_file, order_index, context_tier, content').eq('section_type', s.section_type).single();
    const ok = verify && verify.content === content && verify.context_tier === 'REFERENCE' && verify.target_file === s.target_file;
    console.log(`  readback id=${verify?.id} target=${verify?.target_file} order=${verify?.order_index} tier=${verify?.context_tier} len=${verify?.content?.length} ${ok ? 'OK' : 'MISMATCH'}`);
    if (!ok) problems++;
  }
  console.log(problems ? `done with ${problems} problem(s)` : (APPLY ? 'OK — both sections persisted and verified.' : 'OK — dry-run complete (pass --apply to write).'));
  process.exit(problems ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e?.message || e); process.exit(1); });
}
