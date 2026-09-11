#!/usr/bin/env node
// SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 / FR-3 (CLAUDE_EXEC.md), FR-4 (CLAUDE_CORE.md), FR-5 (Adam
// companion-first note). The DB half of the split; the mapping/generator half is in the same PR.
//
// What this does (idempotent — every step checks its own applied-marker first):
//   1. RETYPE four rows so they can move by mapping without dragging their siblings along:
//        375, 524, 590  reference               -> exec_manual_reference   (-> CLAUDE_EXEC_MANUAL.md)
//        612            signaling_friction      -> solomon_consultation_protocol (-> CLAUDE_CORE_MANUAL.md)
//      Rows 536/537 keep the `reference` type and stay in CLAUDE_EXEC.md — both are RULES.
//   2. INSERT the three companion rows the new files are composed from (exec_manual, exec_provenance,
//      core_provenance), in the shape scripts/protocol/adam-contract-land.mjs used for adam_manual /
//      adam_provenance.
//   3. CARVE evidence/rationale (-> exec_provenance / core_provenance) and procedure (-> exec_manual)
//      out of rule sections that STAY in the gated files, via lib/protocol/contract-carve.mjs — the
//      same located-CUTS shape as the FR-2 Adam carve. Every rule keeps its site and a pointer.
//   4. FR-5: append the companion-first encode convention line to the Adam contract header (row 601),
//      beside the existing MANUAL/PROVENANCE pointers it already carries.
//
// FAIL-CLOSED: EXEC and CORE carry zero chairman_ratifications markers (PLAN-phase TESTING measured
// distinct encoded_ref.section_id = {601, 611}); this script re-measures and REFUSES if any touched
// row is referenced by a marker, so a future encode into these rows can never be carved blind.
//
// Usage:
//   node scripts/one-off/split-exec-core-contracts-sd-split-001.mjs            # dry run + previews
//   node scripts/one-off/split-exec-core-contracts-sd-split-001.mjs --apply    # write
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { applyMoves } from '../../lib/protocol/contract-carve.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD = 'SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001';
const TAG = `${SD} FR-3/FR-4 carve`;
const PROTOCOL_ID = 'leo-v4-3-3-ui-parity';

const RETYPES = [
  { id: 375, from: 'reference', to: 'exec_manual_reference' },
  { id: 524, from: 'reference', to: 'exec_manual_reference' },
  { id: 590, from: 'reference', to: 'exec_manual_reference' },
  { id: 612, from: 'signaling_friction', to: 'solomon_consultation_protocol' },
];

const COMPANIONS = [
  { section_type: 'exec_manual', order_index: 2655, title: 'EXEC Manual — carved procedure (companion)', companion_of: 'exec_implementation_requirements',
    intro: 'Procedure lifted out of rule sections that stay in CLAUDE_EXEC.md (checklist templates, command sequences, enforcement-layer lists). The rules themselves bind whether or not this file is read; each carve below is headed by the section it left and that section carries a pointer here.' },
  { section_type: 'exec_provenance', order_index: 2660, title: 'EXEC Provenance — dated evidence and rationale (companion)', companion_of: 'exec_implementation_requirements',
    intro: 'The retrospective evidence, incident narratives and measured costs behind the EXEC rules. Every rule in CLAUDE_EXEC.md is in force regardless of whether its history is read here; this file explains, it does not govern.' },
  { section_type: 'core_provenance', order_index: 2670, title: 'Core Provenance — dated rationale (companion)', companion_of: 'migration_execution_protocol',
    intro: 'The incident narratives and measurements behind the always-read CORE rules. Every rule in CLAUDE_CORE.md is in force regardless of whether its history is read here; this file explains, it does not govern.' },
];

/** EXEC carves. manual -> exec_manual row, provenance -> exec_provenance row. */
const MOVES_EXEC = [
  { section: 210, name: 'Implementation requirements — ambiguity examples, checklist template, Gate 0 enforcement detail', key: '### MANDATORY Pre-Implementation Verification', cuts: [
    { from: `**Common Ambiguities to Watch For**:`, to: `0.5. **PRD INTEGRATION SECTION CHECK**`, with: `(Common ambiguities to watch for and a worked resolution example: MANUAL.)\n\n`, dest: 'manual' },
    { from: `### Implementation Checklist Template`, to: `### Testability-Aware Implementation`, with: `### Implementation Checklist Template\n\nThe checklist template lives in MANUAL; complete every line of it before writing code.\n\n`, dest: 'manual' },
    { from: `**Why This Matters**: Gate 0 prevents the anti-pattern`, to: `**If SD is in draft**: STOP.`, with: `Enforcement layers, the naming-illusion rationale and the full documentation pointer: MANUAL.\n\n`, dest: 'manual' },
  ]},
  { section: 297, name: 'Retrospective anti-patterns — evidence quotes', key: '**Source**: Analysis of 175 high-quality retrospectives', cuts: [
    { from: `**Evidence**: SD-VENTURE-UNIFICATION-001\n> "Manual test creation wasted`, to: `**Fix**: Always use Task tool` },
    { from: `**Evidence**: SD-VENTURE-UNIFICATION-001\n> "Zero consultation`, to: `**Fix**: Run before EXEC starts` },
    { from: `**Evidence**: SD-2025-1020-E2E-SELECTORS (Score: 100)`, to: `**Fix**: Before implementing a workaround` },
    { from: `**Evidence**: SD-VENTURE-UNIFICATION-001\n> "Environmental issues`, to: `**Fix**: 5-step minimum debug` },
    { from: `**Evidence**: SD-RECONNECT-014 (Score: 90)`, to: `**Fix**: Sub-agent results MUST have` },
    { from: `**Evidence**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143 (PAT-LES-947b3fca46cc)`, to: `**Fix**: Before writing ANY worktree-adjacent` },
  ]},
  { section: 284, name: 'Branch hygiene gate — originating incident, health-check script, why-this-matters', key: '**Evidence from Retrospectives**: SD-STAGE4-UX-EDGE-CASES-001 revealed', cuts: [
    { from: `**Evidence from Retrospectives**: SD-STAGE4-UX-EDGE-CASES-001 revealed a feature branch`, to: null, with: `**Evidence**: the SD-STAGE4-UX-EDGE-CASES-001 unsalvageable-branch incident, in PROVENANCE.` },
    { from: `### Branch Health Check Script`, to: `### Why This Matters`, with: `### Branch Health Check Script\n\nThe script lives in MANUAL.\n\n`, dest: 'manual' },
    { from: `### Why This Matters\n\n- **Prevents unsalvageable branches**`, to: `### EXEC Agent Action` },
  ]},
  { section: 305, name: 'Multi-instance coordination — worktree commands, quick reference, incident evidence', key: '**Root Cause**: Multiple Claude Code instances', cuts: [
    { from: `#### Before Starting EXEC Phase:`, to: `### Forbidden Operations (Multi-Instance)`, with: `Worktree creation and cleanup commands: MANUAL (\`node scripts/session-worktree.js --sd-key <SD> --branch <branch>\` is the recommended entry point; work ONLY in the worktree by absolute path, never \`cd\`).\n\n`, dest: 'manual' },
    { from: `**Evidence**: SD-LEO-INFRA-FIX-SESSION-REGISTER-001 retrospective`, to: `### Quick Reference` },
    { from: `### Quick Reference\n\n\`\`\`bash\n# Node CLI (recommended)`, to: `**Evidence**: SD-STAGE-09-001 + SD-EVA-DECISION-001 collision`, dest: 'manual' },
    { from: `**Evidence**: SD-STAGE-09-001 + SD-EVA-DECISION-001 collision`, to: null },
  ]},
  { section: 190, name: 'Dual test requirement — evidence, common mistakes, why-this-matters', key: '**CRITICAL**: "Smoke tests" means BOTH test types', cuts: [
    { from: `**Evidence**: SD-EXPORT-001 - Tests existed but weren't executed.`, to: null },
    { from: `**Common Mistakes** (from SD-EXPORT-001):`, to: `### Why This Matters` },
    { from: `### Why This Matters`, to: `- **Impact**: Testing enforcement` },
    { from: `- **Impact**: Testing enforcement prevents claiming "done" without proof`, to: null, with: `**Why**: the SD-EXPORT-001 and SD-EVA-MEETING-002 incidents, in PROVENANCE.` },
  ]},
  { section: 286, name: 'Completion commit/push/merge — command sequences', key: '**Every completed Strategic Directive and Quick-Fix MUST end with:**', cuts: [
    { from: `The script will:\n1. Verify tests pass and UAT completed`, to: `### For Strategic Directives`, dest: 'manual' },
    { from: `After LEAD approval, execute the following:\n\n\`\`\`bash\n# 1. Ensure all changes committed`, to: `### Merge Checklist`, with: `After LEAD approval: commit → push → \`gh pr create\` → \`node scripts/gh-merge-safe.mjs <PR#> --merge --delete-branch\` (the full command sequence and the local-merge fallback: MANUAL).\n\n`, dest: 'manual' },
  ]},
];

/** CORE carves. provenance -> core_provenance row (no CORE manual carves — CORE_MANUAL is composed by mapping). */
const MOVES_CORE = [
  { section: 621, name: 'G3 definition-of-done amendment — the problem it closes', key: '**The problem this closes**', cuts: [
    { from: `**The problem this closes**:`, to: null, with: `**The problem this closes**: the cold-recovered dormant-machinery specimens, in PROVENANCE.` },
  ]},
];

const ADAM_ROW = 601;
const ADAM_ANCHOR = '> **Dated provenance** (why each clause exists, live witnesses, superseded cadences) lives in `CLAUDE_ADAM_PROVENANCE.md`. Every rule below is in force regardless of whether its history is read.';
const ADAM_FR5_LINE = '> **Companion-first encode convention** (SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-5): a new ruling is encoded here as its clause header (the ledger marker), its binding half and a site pointer; the verbatim, dated rationale and procedure are written into the companions by default — `CLAUDE_ADAM_PROVENANCE.md` for the why, `CLAUDE_ADAM_MANUAL.md` for the how. The header stays in this file so the ledger marker and the quiet-tick regression check keep resolving here.';

async function fetchRow(id) {
  const { data, error } = await supabase.from('leo_protocol_sections').select('id, section_type, title, content, metadata').eq('id', id).single();
  if (error) throw new Error(`fetch id=${id}: ${error.message}`);
  return data;
}

async function fetchMarkersFor(ids) {
  const { data, error } = await supabase.from('chairman_ratifications').select('id, encoded_ref').not('marker_text', 'is', null);
  if (error) throw new Error(`fetch markers: ${error.message}`);
  const set = new Set(ids.map(String));
  return data.filter((r) => set.has(String(r.encoded_ref?.section_id)));
}

async function companionRow(section_type) {
  const { data, error } = await supabase.from('leo_protocol_sections').select('id, content, metadata').eq('section_type', section_type).limit(2);
  if (error) throw new Error(`select ${section_type}: ${error.message}`);
  if (data.length > 1) throw new Error(`${section_type} has ${data.length} rows — refusing to guess which one renders.`);
  return data[0] || null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const plan = [];

  // ── 1. Retypes ──────────────────────────────────────────────────────────────────────────
  const retypeWrites = [];
  for (const r of RETYPES) {
    const row = await fetchRow(r.id);
    if (row.section_type === r.to) { plan.push(`retype ${r.id}: already ${r.to}`); continue; }
    if (row.section_type !== r.from) throw new Error(`retype ${r.id}: expected section_type ${r.from}, found ${row.section_type} — drifted; refusing.`);
    retypeWrites.push({ id: r.id, section_type: r.to, metadata: { ...(row.metadata || {}), publication_note: `Routed via section-file-mapping by section_type (${SD}: retyped ${r.from} -> ${r.to}).` } });
    plan.push(`retype ${r.id}: ${r.from} -> ${r.to}`);
  }

  // ── 2. Companion rows ─────────────────────────────────────────────────────────────────
  const companionIds = {};
  const inserts = [];
  for (const c of COMPANIONS) {
    const existing = await companionRow(c.section_type);
    if (existing) { companionIds[c.section_type] = existing; plan.push(`companion ${c.section_type}: exists (row ${existing.id})`); continue; }
    const payload = {
      protocol_id: PROTOCOL_ID, section_type: c.section_type, title: c.title, content: c.intro, order_index: c.order_index,
      context_tier: 'REFERENCE', priority: 'STANDARD',
      metadata: { sd: SD, companion_of: c.companion_of, governed: true, publication_status: 'file',
        publication_note: 'Routed via section-file-mapping by section_type.',
        rider: 'no auto-default — governed explicitly via section_type + mapping, never by a fallback path',
        provenance: { actor_type: 'worker', actor_id: 'split-exec-core-contracts-sd-split-001' } },
    };
    inserts.push(payload);
    companionIds[c.section_type] = { id: null, content: c.intro };
    plan.push(`companion ${c.section_type}: INSERT (order_index ${c.order_index})`);
  }

  // ── 3. Carves ──────────────────────────────────────────────────────────────────────────
  const touched = [...new Set([...MOVES_EXEC, ...MOVES_CORE].map((m) => m.section))];
  const markers = await fetchMarkersFor(touched);
  if (markers.length) throw new Error(`MARKERS PRESENT on touched rows (${markers.map((m) => m.id.slice(0, 8)).join(', ')}) — refusing to carve blind; add a marker-preserving check first.`);
  plan.push(`markers on touched rows ${touched.join(',')}: 0 (measured)`);

  const before = {};
  for (const id of touched) before[id] = (await fetchRow(id)).content;
  const execCarve = applyMoves(before, MOVES_EXEC, { manual: companionIds.exec_manual.content, provenance: companionIds.exec_provenance.content }, TAG);
  const coreCarve = applyMoves(execCarve.contents, MOVES_CORE, { manual: '', provenance: companionIds.core_provenance.content }, TAG);
  const after = coreCarve.contents;
  const bytes = (s) => Buffer.byteLength(s, 'utf8');
  for (const id of touched) plan.push(`carve ${id}: ${bytes(before[id])} -> ${bytes(after[id])} bytes`);
  plan.push(`carves applied=${execCarve.applied.length + coreCarve.applied.length} skipped(already)=${execCarve.skipped.length + coreCarve.skipped.length}`);
  const newManual = execCarve.companions.manual;
  const newExecProv = execCarve.companions.provenance;
  const newCoreProv = coreCarve.companions.provenance;

  // ── 4. FR-5 Adam header line ──────────────────────────────────────────────────────────
  const adam = await fetchRow(ADAM_ROW);
  let adamAfter = adam.content;
  if (adamAfter.includes('Companion-first encode convention')) plan.push('adam FR-5 line: already present');
  else if (!adamAfter.includes(ADAM_ANCHOR)) throw new Error('adam FR-5: anchor line not found in row 601 — drifted; refusing.');
  else { adamAfter = adamAfter.replace(ADAM_ANCHOR, `${ADAM_ANCHOR}\n${ADAM_FR5_LINE}`); plan.push('adam FR-5 line: APPEND under the PROVENANCE pointer'); }

  console.log(plan.map((p) => '  - ' + p).join('\n'));
  const outDir = path.resolve('.artifacts'); fs.mkdirSync(outDir, { recursive: true });
  for (const id of touched) fs.writeFileSync(path.join(outDir, `exec-core-after-${id}.md`), after[id]);
  fs.writeFileSync(path.join(outDir, 'exec-core-after-exec_manual.md'), newManual);
  fs.writeFileSync(path.join(outDir, 'exec-core-after-exec_provenance.md'), newExecProv);
  fs.writeFileSync(path.join(outDir, 'exec-core-after-core_provenance.md'), newCoreProv);
  if (!apply) { console.log('DRY RUN — pass --apply to write.'); return; }

  for (const w of retypeWrites) {
    const { error } = await supabase.from('leo_protocol_sections').update({ section_type: w.section_type, metadata: w.metadata }).eq('id', w.id);
    if (error) throw new Error(`retype ${w.id}: ${error.message}`);
  }
  for (const payload of inserts) {
    const { data, error } = await supabase.from('leo_protocol_sections').insert(payload).select('id').single();
    if (error) throw new Error(`insert ${payload.section_type}: ${error.message}`);
    companionIds[payload.section_type].id = data.id;
    console.log(`INSERTED ${payload.section_type} (row ${data.id})`);
  }
  for (const id of touched) if (after[id] !== before[id]) {
    const { error } = await supabase.from('leo_protocol_sections').update({ content: after[id] }).eq('id', id);
    if (error) throw new Error(`update ${id}: ${error.message}`);
  }
  for (const [type, content] of [['exec_manual', newManual], ['exec_provenance', newExecProv], ['core_provenance', newCoreProv]]) {
    const row = companionIds[type];
    if (row.content === content) continue;
    const { error } = await supabase.from('leo_protocol_sections').update({ content }).eq('id', row.id);
    if (error) throw new Error(`update ${type}: ${error.message}`);
  }
  if (adamAfter !== adam.content) {
    const { error } = await supabase.from('leo_protocol_sections').update({ content: adamAfter }).eq('id', ADAM_ROW);
    if (error) throw new Error(`update 601: ${error.message}`);
  }
  console.log('DB updated.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e.message || e); process.exitCode = 1; });
}

export { MOVES_EXEC, MOVES_CORE, RETYPES, TAG };
