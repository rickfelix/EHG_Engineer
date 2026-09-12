import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdId = '170637e5-c8e1-4d44-ab4e-206bf39c8c50';
// Per-criterion verification, cited BEFORE the update (CLAUDE_EXEC.md acceptance-criteria rule):
const evidence = {
  'US-001': ['AC1 LEAD split, markers preserved, first processed: PR #8652 (FR-1, merged 2026-09-08) moved sd_creation_errors to CLAUDE_LEAD_MANUAL.md; LEAD carries zero ratification markers (PLAN TESTING measured section_ids {601,611}); singleReadFit now fits:true 20,756 tok.',
             'AC2 LEAD first: FR-1 landed as its own PR before FR-2..5 (commit d35fb1d8121 precedes 96b905ec695).'],
  'US-002': ['AC1 ADAM split, markers preserved, companion integrated: split-adam-contract-sd-split-001.mjs applied (rows 601/602/614 trimmed, 626/627 appended); check-ratification-markers.mjs --check vs baseline: 74/74 present, 0 regressions.',
             'AC2 all ratified clauses present and attributed: 75 section-601 markers present-before=75 present-after=75 lost=0 (script fail-closed check); each clause keeps header + binding half + PROVENANCE § <id> pointer; full text appended under a heading naming the id.'],
  'US-003': ['AC1 EXEC split, two new companions from scratch: CLAUDE_EXEC_MANUAL.md (60,305 B) and CLAUDE_EXEC_PROVENANCE.md (4,780 B) generated; CLAUDE_EXEC.md 104,128 -> 45,994 B, fits:true 19,024 tok; zero markers on touched rows (re-measured).',
             'AC2 companions carry relevant metadata/references: generated headers name purpose/load-when/source section_types; mapping entries carry per-section _move_justification and _allow_list_note.'],
  'US-004': ['AC1 CORE split, PROVENANCE companion created: CLAUDE_CORE_PROVENANCE.md generated (row 663); CLAUDE_CORE.md 75,454 -> 57,664 B, 23,851 tok (under the 25,000 target); seven reference types moved to CLAUDE_CORE_MANUAL.md; CORE carries zero markers.',
             'AC2 PROVENANCE details origin/history/changes: G3 amendment problem narrative carved under a heading naming its source section and the SD tag; companion header disclaims governing force.'],
  'US-005': ['AC1 companion-first convention published: generated headers of CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_EXEC.md carry the FR-5 convention line; Adam row 601 carries it beside its MANUAL/PROVENANCE pointers.',
             'AC2 role-specific guidance: each of the four files names ITS OWN companions (LEAD->LEAD_MANUAL; EXEC->EXEC_MANUAL/PROVENANCE; CORE->CORE_MANUAL/PROVENANCE; ADAM->ADAM_PROVENANCE/MANUAL with the marker-stays-here rule).'],
};
for (const [us, lines] of Object.entries(evidence)) {
  const key = `SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001:${us}`;
  console.log(key); for (const l of lines) console.log('   ✓', l);
  const { error } = await sb.from('user_stories').update({ status: 'completed', validation_status: 'validated' }).eq('story_key', key);
  if (error) { console.log('   ERR', error.message); process.exitCode = 1; }
}
const { data } = await sb.from('user_stories').select('story_key,status,validation_status').eq('sd_id', sdId).order('story_key');
console.log(data);
