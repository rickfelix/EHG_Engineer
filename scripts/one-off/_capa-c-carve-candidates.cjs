require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ANALYSIS ONLY — this script WRITES NOTHING. It builds the pre-declared move allow-list required by
// FR-6 before any carve runs, and its whole job is to say which spans are UNSAFE to move.
//
// Three exclusion sets, in decreasing order of how loudly they fail if violated:
//  1. RATIFICATION MARKERS. ratification-writer.mjs resolves a SCALAR target_file from the manifest and
//     throws unless marker_text is a literal substring of that ONE file. adam-quiet-tick runs a
//     regression sweep every tick with the same scalar resolution, and markerInvalid is only true when
//     the marker was absent at ENCODE time -- so a moved marker yields regressed=true, not "unknown".
//     These are mid-word truncated prefixes, so a reflow inside the span breaks them silently.
//  2. DURABLE DUTY MARKERS. parseDurableDutyMarkers matches '**<NAME> DUTY (durable)**' in the LIVE
//     CLAUDE_ADAM.md; renderContractParity reads only that file. A duty that leaves 601 blinds it.
//  3. BINDING LANGUAGE. MUST / MANDATORY / GATE / NEVER / ALWAYS / CRITICAL. A binding clause may not
//     be routed to MANUAL or PROVENANCE, whose generated headers explicitly disclaim binding content.
//
// A candidate is only reported SAFE when it intersects none of the three.

const SECTION_ID = Number(process.argv[2] || 601);
const MIGRATION = 'database/chairman-gated/20260902_repair_ratification_markers_601.sql';
const BINDING = /\b(MUST|MANDATORY|GATE|NEVER|ALWAYS|CRITICAL|REQUIRED|FORBIDDEN)\b/;
const DUTY = /\*\*[^*]*DUTY \(durable\)\*\*/gi;

// A provenance span is a line whose informational payload is "who ratified this, and when" rather than
// "what the rule is". These patterns are deliberately conservative: they select CANDIDATES for human
// review, they do not authorise anything.
const PROVENANCE_HINTS = [
  /ratification\s+[0-9a-f]{6,}/i,
  /chairman\s+(verbal|in-terminal|ruling)/i,
  /\(chairman[^)]*20\d\d-\d\d-\d\d/i,
  /ratified\s+20\d\d-\d\d-\d\d/i,
];

function extractMarkers(sql) {
  const out = [];
  const re = /marker_text\s*=\s*'((?:[^']|'')*)'/g;
  let m;
  while ((m = re.exec(sql)) !== null) out.push(m[1].replace(/''/g, "'"));
  return out;
}

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error } = await sb.from('leo_protocol_sections')
    .select('id, section_type, title, content').eq('id', SECTION_ID).maybeSingle();
  if (error) { console.log('READ FAILED:', error.message); return; }
  if (!row) { console.log('section', SECTION_ID, 'not found'); return; }

  const content = row.content || '';
  console.log('SECTION ' + SECTION_ID + ' (' + row.section_type + ') = ' + content.length + ' chars');

  // Markers, and whether each is actually present. A marker the migration claims but the row lacks is
  // itself a finding -- it means the repair migration and the live row have already diverged.
  const markersRaw = fs.existsSync(MIGRATION) ? extractMarkers(fs.readFileSync(MIGRATION, 'utf8')) : [];
  const markers = [...new Set(markersRaw)];
  const present = markers.filter((t) => content.includes(t));
  console.log('RATIFICATION MARKERS: ' + markersRaw.length + ' statements, ' + markers.length +
    ' DISTINCT, ' + present.length + ' present as literal substrings of section ' + SECTION_ID);
  if (markers.length !== markersRaw.length) {
    console.log('  NOTE: ' + (markersRaw.length - markers.length) + ' duplicate marker_text value(s) — a Set-size assertion against the statement count would fail.');
  }
  markers.filter((t) => !content.includes(t)).forEach((t) => console.log('  ABSENT (already diverged): ' + JSON.stringify(t.slice(0, 70))));

  const duties = [...new Set(content.match(DUTY) || [])];
  console.log('DURABLE DUTY MARKERS in this row: ' + duties.length + (duties.length ? ' -> ' + duties.join(', ') : ''));

  // Split into paragraph-ish blocks; a carve moves contiguous spans, not individual lines.
  const blocks = content.split(/\n{2,}/);
  let safeChars = 0, unsafeChars = 0;
  const safe = [], unsafe = [];

  for (const b of blocks) {
    const isProvenance = PROVENANCE_HINTS.some((re) => re.test(b));
    if (!isProvenance) continue;
    const hitMarkers = present.filter((t) => b.includes(t));
    const hitDuty = DUTY.test(b); DUTY.lastIndex = 0;
    const hitBinding = BINDING.test(b);
    const rec = { chars: b.length, head: b.slice(0, 95).replace(/\s+/g, ' '), hitMarkers: hitMarkers.length, hitDuty, hitBinding };
    if (hitMarkers.length || hitDuty || hitBinding) { unsafe.push(rec); unsafeChars += b.length; }
    else { safe.push(rec); safeChars += b.length; }
  }

  console.log('\n--- PROVENANCE-SHAPED BLOCKS ---');
  console.log('SAFE to move   : ' + safe.length + ' blocks, ' + safeChars + ' chars');
  console.log('UNSAFE (excluded): ' + unsafe.length + ' blocks, ' + unsafeChars + ' chars');
  console.log('\nTOP EXCLUSIONS (why each is held back):');
  unsafe.sort((a, b) => b.chars - a.chars).slice(0, 8).forEach((r) => console.log(
    '  [' + String(r.chars).padStart(5) + 'ch] markers=' + r.hitMarkers + ' duty=' + r.hitDuty + ' binding=' + r.hitBinding + ' :: ' + r.head));
  console.log('\nLARGEST SAFE CANDIDATES:');
  safe.sort((a, b) => b.chars - a.chars).slice(0, 10).forEach((r) => console.log('  [' + String(r.chars).padStart(5) + 'ch] ' + r.head));

  // The gap this SD has to close, stated against the actual target rather than a percentage.
  const TARGET = Number(process.argv[3] || 40000);
  console.log('\n--- FEASIBILITY ---');
  console.log('row 601 now: ' + content.length + ' chars; target ~' + TARGET + '; must shed ~' + (content.length - TARGET));
  console.log('safe provenance available: ' + safeChars + ' chars');
  console.log(safeChars >= (content.length - TARGET)
    ? 'VERDICT: provenance alone is SUFFICIENT for the target.'
    : 'VERDICT: provenance alone is INSUFFICIENT — short by ' + ((content.length - TARGET) - safeChars) +
      ' chars. The remainder cannot come from these blocks, so either the target moves, more content types are opened up (with review), or the SD reports the shortfall rather than deleting to hit a number.');
})();
