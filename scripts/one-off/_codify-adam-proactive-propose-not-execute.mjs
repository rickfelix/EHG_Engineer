#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001
 * Codify the chairman's "proactivity is PROPOSE, not auto-execute" posture into the Adam Role
 * Contract (leo_protocol_sections id=601, section_type=adam_role_contract). The clause is
 * inserted BEFORE the "Reviewer / augmentation, NOT a safety-net" bullet (it qualifies the
 * proactive-assistant behavior described just above it). After running, regenerate CLAUDE_ADAM.md:
 *   node scripts/generate-claude-md-from-db.js
 *
 * Idempotent: re-running is a no-op once the clause is present. The clause text is inlined here
 * (no DOCMON-flagged sibling .md in scripts/ — RULE-PROHIB-003/NAMING-UNDERSCORE/META-MISSING).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECTION_ID = 601;
const CLAUSE_MARKER = 'Proactivity is PROPOSE, not auto-execute';
const ANCHOR = '- **Reviewer / augmentation, NOT a safety-net (hard line)**:';

const CLAUSE = `- **Proactivity is PROPOSE, not auto-execute (operator-canonical 2026-06-08)**: When idle, Adam **scans, identifies options, and PRESENTS them to the active coordinator with rationale**, then lets the **coordinator decide** which (if any) Adam works on. Adam does **NOT** autonomously *begin* self-generated proactive work — sourcing/filing SDs, launching investigations, building — without the coordinator's confirmation. Surfacing findings, canary observations, and proposing options is **always in-bounds**; **beginning** proactive work requires the coordinator's go. Chairman-directed tasks Adam executes directly. This keeps the coordinator the decider/manager and Adam the proposing assistant (augmentation; the coordinator stays 100% accountable). Operator-canonical: *"get confirmation from the coordinator before you begin any of them — give options + your rationale, let the coordinator decide what you work on."*`;

const HISTORICAL_NOTE =
  '\n\n**2026-06-08**: Added the "Proactivity is PROPOSE, not auto-execute" clause (SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001). Chairman-canonical: when idle Adam presents options to the active coordinator and lets the coordinator decide; Adam never autonomously *begins* self-generated proactive work (sourcing/filing SDs, launching investigations, building) without the coordinator\'s go. Surfacing findings/canary/options is always in-bounds.';

(async () => {
  const { data: row, error: readErr } = await supabase
    .from('leo_protocol_sections')
    .select('content')
    .eq('id', SECTION_ID)
    .single();

  if (readErr || !row) {
    console.error('Failed to read section 601:', readErr?.message);
    process.exit(1);
  }

  let content = row.content;

  if (content.includes(CLAUSE_MARKER)) {
    console.log('Clause already present — skipping (idempotent no-op).');
    process.exit(0);
  }

  if (!content.includes(ANCHOR)) {
    console.error(`Could not find anchor "${ANCHOR}" — aborting (section structure changed).`);
    process.exit(1);
  }

  // Insert the clause immediately before the safety-net bullet.
  content = content.replace(ANCHOR, `${CLAUSE}\n\n${ANCHOR}`);

  // Append a dated historical note if not already present.
  if (!content.includes('2026-06-08**: Added the "Proactivity is PROPOSE')) {
    content = content.trimEnd() + HISTORICAL_NOTE + '\n';
  }

  const { error: writeErr } = await supabase
    .from('leo_protocol_sections')
    .update({ content })
    .eq('id', SECTION_ID);

  if (writeErr) {
    console.error('Failed to update section 601:', writeErr.message);
    process.exit(1);
  }

  console.log('Section 601 updated. Now run: node scripts/generate-claude-md-from-db.js');
})();
