#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158 — records metadata.mechanism_verifications so
 * GATE_MECHANISM_CLAIM_VERIFIER (scripts/modules/handoff/executors/lead-to-plan/gates/
 * mechanism-claim-verifier.js) has a named verifier + file:line citation for each mechanism
 * claim in the SD's spine, per two independent sub-agent passes (Explore, then Validation)
 * that both actually opened these files and confirmed the cited lines directly (recorded in
 * sub_agent_execution_results, phase=LEAD).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

const mechanism_verifications = [
  {
    verified_by: 'validation-agent (independent LEAD-phase re-derivation)',
    verified_at: 'scripts/modules/learning/filter.mjs:122',
    note: 'checkSingleSDClosedSource: gated on firstId !== lastId at :126 — confirmed via own file read that this guard abstains whenever a pattern touches more than one sd_id, regardless of whether those sd_ids are genuinely independent occurrences or sibling SDs from one batch.',
  },
  {
    verified_by: 'validation-agent (independent LEAD-phase re-derivation)',
    verified_at: 'scripts/modules/learning/filter.mjs:189',
    note: 'checkSingleSDRetroLikeCategory: same firstId !== lastId gate at :195, for session_retrospective/handoff_failure categories — confirmed this is the third of three single-SD guards, all defeated identically by sibling-SD fan-out.',
  },
  {
    verified_by: 'Explore sub-agent + validation-agent (independent LEAD-phase passes)',
    verified_at: 'lib/learning/class-escalation.js:70',
    note: "mergeSite: first_seen: now.toISOString() where now defaults to new Date() (class-escalation.js:57) — confirmed by both passes as the wall-clock stamping defect, though validation-agent additionally confirmed this field is NOT read by filter.mjs's scoring (only a display string at class-escalation.js:98), so it is a secondary, not primary, defect.",
  },
  {
    verified_by: 'Explore sub-agent + validation-agent (independent LEAD-phase passes)',
    verified_at: 'scripts/extract-pending-retro-patterns.mjs:34',
    note: "await extractFn(row.id) — confirmed only the retrospective's id is passed onward; created_at (selected at :23-28) is never threaded through to the extraction call, which both passes independently verified by grepping scripts/auto-extract-patterns-from-retro.js for created_at (zero matches).",
  },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const newMetadata = { ...(sd.metadata || {}), mechanism_verifications };

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key, metadata')
  .single();

if (error) { console.error('UPDATE FAILED:', error); process.exit(1); }
console.log('mechanism_verifications recorded:', data.metadata.mechanism_verifications.length);
