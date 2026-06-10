#!/usr/bin/env node
// SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-1): one-time classification batch.
// Writes metadata.publication_status (+ publication_note) to every leo_protocol_sections row
// via read-modify-merge of ONLY those two keys. CLASSIFICATION IS ADVISORY — nothing acts on it.
// Bulk rule: section_type mapped in either section-file-mapping JSON OR target_file set => 'file'.
// Dark sections (59) classified per the evidence-grounded DECISIONS table below.
// Audit afterwards: npm run protocol:pub-audit (scripts/protocol-publication-audit.cjs).
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');

// Evidence-grounded per-id decisions for TRUE-dark sections (no target_file, type unmapped).
// runtime = a live consumer queries the section (by id or section_type) outside the generator.
// retired = zero live consumers AND superseded by another live source (advisory flag only).
// file    = unrendered content that plausibly belongs in a context file — chairman routing review.
const DECISIONS = {
  345: { status: 'runtime', note: 'Queried by id 345 from the /document skill (.claude/commands/document.md:30,186) — Documentation Information Architecture is loaded at runtime.' },
  372: { status: 'runtime', note: "Live consumer: scripts/modules/learning/improvement-appliers.js creates/updates sections with section_type='sub_agent_workflow'." },
  398: { status: 'retired', note: 'CONST-001 copy superseded by the protocol_constitution table (14 rows) which live code (risk-classifier, governance) reads; this sections-table copy has zero live consumers.' },
  399: { status: 'retired', note: 'CONST-002 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  400: { status: 'retired', note: 'CONST-003 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  401: { status: 'retired', note: 'CONST-004 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  402: { status: 'retired', note: 'CONST-005 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  403: { status: 'retired', note: 'CONST-006 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  404: { status: 'retired', note: 'CONST-007 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  405: { status: 'retired', note: 'CONST-008 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  406: { status: 'retired', note: 'CONST-009 copy superseded by protocol_constitution table; zero live consumers of the sections copy.' },
  416: { status: 'retired', note: "auto_proceed_mode full text superseded: section-file-mapping.json _removed_sections_note records it was deliberately removed; the router generator hardcodes the condensed AUTO-PROCEED summary and CLAUDE.md carries the canonical pause-point list from other sections." },
};
const DEFAULT_DARK = { status: 'file', note: 'No live runtime consumer found (git grep lib/scripts/server excluding archive/one-off/generator); content is unrendered — candidate for chairman routing review. Classified 2026-06-10 (SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001).' };

async function main() {
  const sb = createSupabaseServiceClient();
  const repoRoot = path.resolve(__dirname, '../..');
  const mapping = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/section-file-mapping.json'), 'utf8'));
  const digestMapping = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/section-file-mapping-digest.json'), 'utf8'));
  const mapped = new Set();
  for (const f of Object.values(mapping)) (f.sections || []).forEach((s) => mapped.add(s));
  for (const f of Object.values(digestMapping)) (f.sections || []).forEach((s) => mapped.add(s));

  const { data: rows, error } = await sb.from('leo_protocol_sections').select('id, section_type, target_file, title, metadata');
  if (error) throw new Error(error.message);
  console.log(`sections: ${rows.length}`);

  const report = { file_bulk: 0, runtime: [], retired: [], file_dark: [], errors: [] };
  for (const r of rows) {
    const isMapped = mapped.has(r.section_type) || !!r.target_file;
    let verdict;
    if (isMapped) {
      verdict = { status: 'file', note: r.target_file ? `Routed via target_file=${r.target_file}.` : 'Routed via section-file-mapping by section_type.' };
      report.file_bulk++;
    } else {
      verdict = DECISIONS[r.id] || DEFAULT_DARK;
      report[verdict.status === 'file' ? 'file_dark' : verdict.status].push(`${r.id} ${r.section_type} — ${(r.title || '').slice(0, 60)}`);
    }
    // Surgical read-modify-merge: only the two publication keys change.
    const metadata = { ...(r.metadata || {}), publication_status: verdict.status, publication_note: verdict.note };
    const { error: upErr } = await sb.from('leo_protocol_sections').update({ metadata }).eq('id', r.id);
    if (upErr) report.errors.push(`${r.id}: ${upErr.message}`);
  }

  console.log(JSON.stringify({
    bulk_file: report.file_bulk,
    runtime: report.runtime,
    retired: report.retired,
    dark_as_file: report.file_dark.length,
    errors: report.errors,
  }, null, 2));
  if (report.errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
