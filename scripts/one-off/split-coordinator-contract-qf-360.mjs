#!/usr/bin/env node
// QF-20260906-360: split CLAUDE_COORDINATOR.md (leo_protocol_sections id=605) below the
// single-read cap, mirroring the QF-20260905-908 shape applied to Solomon (id=611).
//
// MEASURED 2026-09-06: id=605 was 37,328 chars; CLAUDE_COORDINATOR.md sat at 23,293 tokens
// with only 7 tokens below the SINGLE_READ_MARGIN_TOKENS marginal band (23,300), so the
// NEXT ratification append of any size flips the contract-read check from
// legacy_array_single_read_safe to legacy_array_marginal_unconfirmed (measured live on the
// 1afdeaac encode branch, PR #8359, +1,946 chars). The coordinator has no chunked-read
// fallback in its register path, so this file must stay single-read-safe with real headroom.
//
// Targets:
//   id=605 (coordinator_role_contract, -> CLAUDE_COORDINATOR.md)          TRIM
//   id=633 (coordinator_provenance companion, -> CLAUDE_COORDINATOR_PROVENANCE.md)  APPEND
//
// SITE-EDIT convention preserved (per QF-908): every moved clause leaves a one-line
// pointer at its original site, and every ratification bullet's BOLD HEADER (the fragment
// tracked as marker_text on the originating role's chairman_ratifications row) is left
// byte-for-byte untouched -- only the verbatim-quote / narrative-context prose after the
// header's em-dash moves. The "Coordinator share: ..." operative sentence (the actual
// binding rule text) also stays in the main file, verbatim -- only the CONTEXT that
// precedes it (dated chairman quotes, joint-rationale narrative, measured-basis detail)
// is dated rationale/provenance-class prose per the companion's own description, moves to
// PROVENANCE. Idempotent: each move is guarded by checking whether the OLD (pre-move) text
// is still present before applying it, and whether the NEW (post-move) marker is already
// present to skip a repeat run.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MARKER = 'QF-20260906-360 split';
const MAIN_ID = 605;
const PROVENANCE_ID = 633;

// Generic moves: bullets shaped "- **HEADER (ratification XXXX...)** — <quote/context>
// Coordinator share: <operative>." -- the quote/context (everything between the header's
// em-dash and "Coordinator share:") moves to PROVENANCE; the header and the operative
// "Coordinator share: ..." sentence stay in place, verbatim, with a pointer appended.
const GENERIC_RE = /^(- \*\*.*?\*\*) — (.*?)\s*Coordinator share:\s*(.*?)\s*$/s;
const TITLE_RE = /\*\*(.+?)\s*\(ratification/;

// Anchor substrings for the 8 bullets worth splitting (quote/context > ~180 chars each --
// below that the pointer overhead isn't worth the indirection, matching QF-908's own
// judgment call on which clauses to touch).
const GENERIC_ANCHORS = [
  'Gate-evidence provenance (ratification 6c263823',
  'Single-scribe encode (ratification c44cd9d8',
  'Labelled claims to the chairman (ratification 558cf9c3',
  'Harness-week composition (ratification b046d398',
  'CHAIRMAN MENTION IS PROVENANCE, NEVER A RANK BUMP',
  'MICHAEL ROLE FORMALIZATION: chairman decisions on the Solomon adjudication',
  'LEG4 CAPACITY EARNS IN POINTS',
  'ALTIFYAI ELEVEN-001 STAYS COMPLETED AS SHIPPED-ACCEPTANCE-PENDING',
];

// Custom move: no "Coordinator share:" literal, so the generic regex doesn't apply --
// hand-split keeping the Rule + Coordinator dispatch step, moving the joint-rationale and
// measured-basis narrative.
const CUSTOM_MOVE = {
  name: 'Orchestrator Parent Lifecycle',
  old: `- **ORCHESTRATOR PARENT LIFECYCLE: the parent's own two setup handoffs run once, by the seat claiming its first child (spec-conflict resolution 2026-09-05)** — Joint rationale (coordinator source request cfa06ecd on Golf-3 row 316c7b65; Adam reading 15:2xZ; Solomon answer d61d78ba/3d370d6e, 2026-09-05 15:54Z; no chairman ratification, this resolves a wording conflict between never-do boundary 2 and the Orchestrator Parent Lifecycle table in the SD Continuation Truth Table). Rule: A parent orchestrator is never dispatched for implementation and closes on its children; its own LEAD-TO-PLAN and PLAN-TO-EXEC (reduced set) are run once, by the seat claiming its first child, before that child's own LEAD-TO-PLAN, and the parent claim is released when PLAN-TO-EXEC is accepted; a child advanced under a parent short of EXEC is a dispatch-order defect, not a child defect. Measured basis: the lifecycle table gives the parent LEAD-TO-PLAN (standard) and PLAN-TO-EXEC (reduced set: PARENT_PRD_EXISTS + CHILDREN_STRUCTURE_VALID) before "children may be claimed and run independently while the parent is in EXEC"; scripts/phase-preflight.js:362/:445 encode "parent must be in EXEC phase for child to be activated"; SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A's PLAN-TO-EXEC was accepted 13:13Z with the parent at PLAN_PRD and the parent's PLAN-TO-EXEC has never run, so the live reconciliation is LOOSER than the rule (a coordinator-lane fix, site to be traced). Coordinator dispatch step: before directing or allowing the first child of any orchestrator, confirm the parent has LEAD-TO-PLAN and PLAN-TO-EXEC accepted; if not, the first assignment is the parent's two setup handoffs, run by that seat, which then releases the parent. No new assignment kind (a parent_setup kind would need a selector exemption and a registered reader, machinery under 76a3c081); the seat uses handoff.js as phase-preflight already instructs. "Never work a parent" means never build implementation on it.`,
  new: `- **ORCHESTRATOR PARENT LIFECYCLE: the parent's own two setup handoffs run once, by the seat claiming its first child (spec-conflict resolution 2026-09-05)** — Rule: A parent orchestrator is never dispatched for implementation and closes on its children; its own LEAD-TO-PLAN and PLAN-TO-EXEC (reduced set) are run once, by the seat claiming its first child, before that child's own LEAD-TO-PLAN, and the parent claim is released when PLAN-TO-EXEC is accepted; a child advanced under a parent short of EXEC is a dispatch-order defect, not a child defect. Coordinator dispatch step: before directing or allowing the first child of any orchestrator, confirm the parent has LEAD-TO-PLAN and PLAN-TO-EXEC accepted; if not, the first assignment is the parent's two setup handoffs, run by that seat, which then releases the parent. "Never work a parent" means never build implementation on it. (provenance: PROVENANCE § Orchestrator Parent Lifecycle — joint rationale, measured basis)`,
  heading: `### Orchestrator Parent Lifecycle — joint rationale, measured basis (${MARKER})`,
  body: `Joint rationale (coordinator source request cfa06ecd on Golf-3 row 316c7b65; Adam reading 15:2xZ; Solomon answer d61d78ba/3d370d6e, 2026-09-05 15:54Z; no chairman ratification, this resolves a wording conflict between never-do boundary 2 and the Orchestrator Parent Lifecycle table in the SD Continuation Truth Table). Measured basis: the lifecycle table gives the parent LEAD-TO-PLAN (standard) and PLAN-TO-EXEC (reduced set: PARENT_PRD_EXISTS + CHILDREN_STRUCTURE_VALID) before "children may be claimed and run independently while the parent is in EXEC"; scripts/phase-preflight.js:362/:445 encode "parent must be in EXEC phase for child to be activated"; SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A's PLAN-TO-EXEC was accepted 13:13Z with the parent at PLAN_PRD and the parent's PLAN-TO-EXEC has never run, so the live reconciliation is LOOSER than the rule (a coordinator-lane fix, site to be traced). No new assignment kind (a parent_setup kind would need a selector exemption and a registered reader, machinery under 76a3c081); the seat uses handoff.js as phase-preflight already instructs.`,
};

async function fetchContent(id) {
  const { data, error } = await supabase.from('leo_protocol_sections').select('content').eq('id', id).single();
  if (error) throw new Error(`fetch id=${id}: ${error.message}`);
  return data.content;
}

async function updateContent(id, content) {
  const { error } = await supabase.from('leo_protocol_sections').update({ content }).eq('id', id);
  if (error) throw new Error(`update id=${id}: ${error.message}`);
}

/** Locate the full bullet (from its anchor to the next "\n- **" or end of string). */
function extractBullet(content, anchor) {
  const start = content.indexOf(anchor);
  if (start === -1) return null;
  const bulletStart = content.lastIndexOf('- **', start + 1);
  const rest = content.slice(bulletStart);
  const nextIdx = rest.indexOf('\n- **', 4);
  const bullet = nextIdx === -1 ? rest.trimEnd() : rest.slice(0, nextIdx);
  return { bulletStart, bullet: bullet.trimEnd() };
}

async function main() {
  let main605 = await fetchContent(MAIN_ID);
  let provenance = await fetchContent(PROVENANCE_ID);
  const applied = [];
  const skipped = [];

  for (const anchor of GENERIC_ANCHORS) {
    const found = extractBullet(main605, anchor);
    if (!found) { skipped.push(`${anchor} (anchor not found -- already applied or drifted)`); continue; }
    const m = GENERIC_RE.exec(found.bullet);
    if (!m) { skipped.push(`${anchor} (regex did not match -- already trimmed or drifted)`); continue; }
    const [, header, quote, share] = m;
    const titleMatch = TITLE_RE.exec(header);
    const shortTitle = titleMatch ? titleMatch[1] : header.replace(/^- \*\*/, '').replace(/\*\*$/, '');
    const pointer = `(provenance: PROVENANCE § ${shortTitle} — ratified quote/context)`;
    const newBullet = `${header} — Coordinator share: ${share} ${pointer}`;
    const heading = `### ${shortTitle} — ratified quote/context (${MARKER})`;
    if (provenance.includes(heading)) { skipped.push(`${anchor} (already applied)`); continue; }

    main605 = main605.slice(0, found.bulletStart) + newBullet + main605.slice(found.bulletStart + found.bullet.length);
    provenance = provenance.trimEnd() + `\n\n---\n\n${heading}\n\n${quote}\n`;
    applied.push(shortTitle);
  }

  if (main605.includes(CUSTOM_MOVE.new) && !main605.includes(CUSTOM_MOVE.old)) {
    skipped.push(`${CUSTOM_MOVE.name} (already applied)`);
  } else if (!main605.includes(CUSTOM_MOVE.old)) {
    skipped.push(`${CUSTOM_MOVE.name} (old text not found -- drifted, skipping)`);
  } else {
    main605 = main605.replace(CUSTOM_MOVE.old, CUSTOM_MOVE.new);
    if (!provenance.includes(CUSTOM_MOVE.heading)) {
      provenance = provenance.trimEnd() + `\n\n---\n\n${CUSTOM_MOVE.heading}\n\n${CUSTOM_MOVE.body}\n`;
    }
    applied.push(CUSTOM_MOVE.name);
  }

  console.log('Applied:', applied.length ? applied.join(', ') : '(none)');
  console.log('Skipped:', skipped.length ? skipped.join('; ') : '(none)');

  const beforeBytes = Buffer.byteLength(await fetchContent(MAIN_ID), 'utf8');
  const afterBytes = Buffer.byteLength(main605, 'utf8');
  console.log(`id=${MAIN_ID} bytes: ${beforeBytes} -> ${afterBytes} (freed ${beforeBytes - afterBytes})`);

  if (applied.length > 0) {
    await updateContent(MAIN_ID, main605);
    await updateContent(PROVENANCE_ID, provenance);
    console.log(`DB updated: id=${MAIN_ID} (trimmed), id=${PROVENANCE_ID} (provenance, appended)`);
  } else {
    console.log('No changes to apply (idempotent no-op).');
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
}

export { GENERIC_ANCHORS, CUSTOM_MOVE, MARKER };
