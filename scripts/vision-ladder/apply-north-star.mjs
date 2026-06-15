#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-1b) — carry the income-replacement North Star into the
 * canonical L1 vision doc, REUSING the chairman's VERBATIM wording (never authored/paraphrased).
 *
 * SOURCE OF TRUTH (verbatim, read at runtime — never typed into this file):
 *   SD-LEO-ORCH-ADAM-PLAN-KEEPER-001
 *     metadata.chairman_amendment_2026_06_11_income_replacement.statement
 *
 * TARGET:
 *   eva_vision_documents.vision_key = 'VISION-EHG-L1-001', the '## The North Star' section in `content`.
 *   The EXISTING North-Star paragraph (the "handful of self-sustaining software businesses" vision) is
 *   PRESERVED; this APPENDS the chairman's verbatim income-replacement thread beneath it under a
 *   labeled sub-line, so the section carries BOTH the portfolio vision and the income-replacement
 *   North Star without rewriting either.
 *
 * IDEMPOTENT: if the verbatim chairman statement is already present in the section, it is a no-op.
 *
 * GOVERNANCE: this is a DB write to a chairman-approved governance doc. It is PREPARED but NOT RUN by
 * the worker. Review the diff and run with `--apply`. Without `--apply` it is a DRY RUN (prints the
 * exact before/after of the North Star section and the verbatim wording it would write).
 *
 * Verified columns only (a bad column returns data:null with a swallowed error):
 *   eva_vision_documents: content, sections, addendums, vision_key, level, status, chairman_approved
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const VISION_KEY = 'VISION-EHG-L1-001';
const PLAN_KEEPER = 'SD-LEO-ORCH-ADAM-PLAN-KEEPER-001';
const SECTION_HEADING = '## The North Star';
const SUBLINE_LABEL = '**Income-replacement North Star (chairman, 2026-06-11 — verbatim):**';

const APPLY = process.argv.includes('--apply');

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function fail(msg) { console.error('FR-1b ERROR: ' + msg); process.exit(1); }

// Replace the body of the '## The North Star' section (from its heading to the next top-level/##
// heading) with `newSectionBody`, returning the full updated content. Pure.
function spliceSection(content, headingLine, newSectionBody) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === headingLine);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  }
  const before = lines.slice(0, start);
  const after = lines.slice(end);
  return [...before, ...newSectionBody.split('\n'), ...after].join('\n');
}

(async () => {
  // 1. Read the VERBATIM chairman statement (never authored here).
  const { data: pk, error: pkErr } = await db.from('strategic_directives_v2')
    .select('metadata').eq('sd_key', PLAN_KEEPER).maybeSingle();
  if (pkErr) fail('plan-keeper read: ' + pkErr.message);
  if (!pk) fail(`plan-keeper SD ${PLAN_KEEPER} not found`);
  const statement = pk.metadata
    ?.chairman_amendment_2026_06_11_income_replacement
    ?.statement;
  if (typeof statement !== 'string' || !statement.trim()) {
    fail('chairman_amendment_2026_06_11_income_replacement.statement is absent/empty — refusing to author');
  }
  const verbatim = statement.trim();

  // 2. Read the canonical doc (verified columns only).
  const { data: doc, error: docErr } = await db.from('eva_vision_documents')
    .select('vision_key, content, status, chairman_approved')
    .eq('vision_key', VISION_KEY).maybeSingle();
  if (docErr) fail('vision doc read: ' + docErr.message);
  if (!doc) fail(`vision doc ${VISION_KEY} not found`);

  const lines = doc.content.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === SECTION_HEADING);
  if (start === -1) fail(`'${SECTION_HEADING}' section not found in ${VISION_KEY}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  }
  const existingBody = lines.slice(start, end).join('\n').replace(/\s+$/, '');

  // 3. Idempotency: the verbatim statement already present ⇒ no-op.
  if (existingBody.includes(verbatim)) {
    console.log('FR-1b: verbatim income-replacement North Star already present — no-op.');
    console.log('\n=== EXACT VERBATIM WORDING (from chairman metadata) ===\n' + verbatim + '\n');
    return;
  }

  // 4. Build the new section body: PRESERVE the existing North Star, INSERT the verbatim chairman
  // income-replacement thread directly beneath the opening paragraph (before any '---' separator /
  // operating-spec note), so it reads as part of the North Star rather than trailing after footnotes.
  const bodyLines = existingBody.split('\n');
  // heading at [0]; find the first separator/blank-run boundary after the opening paragraph.
  let insertAt = bodyLines.length;
  for (let i = 1; i < bodyLines.length; i++) {
    if (bodyLines[i].trim() === '---' || bodyLines[i].trim().startsWith('>')) { insertAt = i; break; }
  }
  // Trim a trailing blank immediately before the insertion point so spacing stays single.
  while (insertAt > 1 && bodyLines[insertAt - 1].trim() === '') insertAt--;
  const insertion = ['', SUBLINE_LABEL, '', verbatim, ''];
  const newBody = [
    ...bodyLines.slice(0, insertAt),
    ...insertion,
    ...bodyLines.slice(insertAt),
  ].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');

  const newContent = spliceSection(doc.content, SECTION_HEADING, newBody);
  if (newContent == null) fail('section splice failed unexpectedly');

  console.log('=== EXACT VERBATIM WORDING (from chairman metadata, REUSE not authored) ===');
  console.log(verbatim);
  console.log('\n=== NORTH STAR SECTION — BEFORE ===');
  console.log(existingBody);
  console.log('\n=== NORTH STAR SECTION — AFTER ===');
  console.log(newBody);

  if (!APPLY) {
    console.log('\n[DRY RUN] no write performed. Re-run with --apply to update eva_vision_documents.');
    return;
  }

  const { error: upErr } = await db.from('eva_vision_documents')
    .update({ content: newContent })
    .eq('vision_key', VISION_KEY);
  if (upErr) fail('vision doc update: ' + upErr.message);
  console.log('\nFR-1b APPLIED: North Star section updated for ' + VISION_KEY + ' (verbatim chairman wording).');
})();
