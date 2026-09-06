#!/usr/bin/env node
// QF-20260905-908 follow-up fix: 4 ratification marker_text values were broken by the
// initial split (their HEADER text was paraphrased instead of kept verbatim, violating
// the "move bodies, never marker headers" rule). Restores the exact header wording while
// keeping the trimmed bodies/pointers already in place. Idempotent.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FIXES = [
  {
    name: 'Cross-review duty block header restoration',
    old: `- **Solomon performs a WEEKLY full role-contract adherence review of Adam** (scope: the CLAUDE_ADAM duty set) plus a **DAILY duty-firing omission audit** at the 7:00 AM ET anchor. **Paired both directions:** Adam or the coordinator reviews Solomon's adherence — Solomon never adjudicates his own. **Durable-row requirement:** every cross-review and daily audit MUST write a row in the adherence instrument of record at review time.
- **Ring extension**: THE REVIEW RING — Solomon reviews Adam; Adam reviews the coordinator; the coordinator reviews Solomon. Weekly, role-contract-scoped, durable row per review.
- **Oversight purpose**: detect BUSY-WORK SOURCING and verify ROADMAP PROGRESSION, not merely conduct — every belt refill classified against the THREE LEGITIMATE SOURCES (roadmap-traced / witnessed-defect repair / explicit chairman order); a thin belt with idle workers is an ACCEPTABLE diagnosis outcome, never a mandate to fill-with-anything.
(procedure: MANUAL § Cross-review duty — ring extension, daily audit, oversight-purpose predicates, full ratification text)`,
    new: `- **Solomon performs a WEEKLY full role-contract adherence review of Adam** (scope: the CLAUDE_ADAM duty set). **Paired both directions:** Adam or the coordinator reviews Solomon's adherence — Solomon never adjudicates his own. **Durable-row requirement:** every cross-review MUST write a row in the adherence instrument of record at review time.
- **Ring extension (chairman-ratified 2026-08-31, ratification 58750c5b-3a0e-42a5-a1a2-f6ed84f6ea3d):** THE REVIEW RING — Solomon reviews Adam; Adam reviews the coordinator; the coordinator reviews Solomon. (procedure: MANUAL § Cross-review duty — ring extension detail)
- **Daily duty-firing audit (chairman-directed 2026-08-31, ratification 7ec412a7-9426-4b76-90eb-04c701d7a559):** DAILY omission audit of Adam at the 7:00 AM ET anchor. (procedure: MANUAL § Cross-review duty — daily audit detail)
- **Oversight purpose clause (chairman-ratified 2026-08-31, ratification 889dcaa0-744e-4e40-8d93-b34940bc3fae):** detect BUSY-WORK SOURCING and verify ROADMAP PROGRESSION, not merely conduct. (procedure: MANUAL § Cross-review duty — oversight-purpose predicates)`,
  },
  {
    name: 'ALTIFYAI bullet header restoration',
    old: `- **ALTIFYAI STAGE 23: BUILD THE ELEVEN SURFACES, the fourteen-journey set is the specification of record (ratification 767b288f)** — re-keying is closed. (procedure: MANUAL § Foundation CAPA bullets — full Solomon-share elaboration)`,
    new: `- **ALTIFYAI STAGE 23: BUILD THE ELEVEN SURFACES, and the fourteen-journey set is the specification of record (ratification 767b288f)** — re-keying is closed. (procedure: MANUAL § Foundation CAPA bullets — full Solomon-share elaboration)`,
  },
];

async function main() {
  const { data, error } = await supabase.from('leo_protocol_sections').select('content').eq('id', 611).single();
  if (error) throw error;
  let content = data.content;
  const applied = [];
  const skipped = [];
  for (const fix of FIXES) {
    if (content.includes(fix.new) && !content.includes(fix.old)) {
      skipped.push(fix.name);
      continue;
    }
    if (!content.includes(fix.old)) {
      throw new Error(`FIX FAILED — old text not found for "${fix.name}".`);
    }
    content = content.replace(fix.old, fix.new);
    applied.push(fix.name);
  }
  console.log('Applied:', applied.length ? applied.join(', ') : '(none)');
  console.log('Skipped (already applied):', skipped.length ? skipped.join(', ') : '(none)');
  if (applied.length > 0) {
    const { error: upErr } = await supabase.from('leo_protocol_sections').update({ content }).eq('id', 611);
    if (upErr) throw upErr;
    console.log('DB updated: id=611');
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
}
