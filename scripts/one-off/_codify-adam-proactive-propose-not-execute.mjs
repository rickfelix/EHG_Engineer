#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001
 * Codify the chairman's "proactivity is PROPOSE, not auto-execute" posture into the Adam Role
 * Contract (leo_protocol_sections id=601, section_type=adam_role_contract). The clause is
 * inserted BEFORE the "Reviewer / augmentation, NOT a safety-net" bullet (it qualifies the
 * proactive-assistant behavior described just above it). After running, regenerate CLAUDE_ADAM.md:
 *   node scripts/generate-claude-md-from-db.js
 *
 * Idempotent: re-running is a no-op once the clause is present. Clause text lives in the sibling
 * file _adam-proactive-propose-not-execute-clause.md (keeps markdown/quotes out of JS escaping).
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECTION_ID = 601;
const CLAUSE_MARKER = 'Proactivity is PROPOSE, not auto-execute';
const ANCHOR = '- **Reviewer / augmentation, NOT a safety-net (hard line)**:';
const HISTORICAL_NOTE =
  '\n\n**2026-06-08**: Added the "Proactivity is PROPOSE, not auto-execute" clause (SD-LEO-INFRA-CODIFY-ADAM-PROACTIVE-001). Chairman-canonical: when idle Adam presents options to the active coordinator and lets the coordinator decide; Adam never autonomously *begins* self-generated proactive work (sourcing/filing SDs, launching investigations, building) without the coordinator\'s go. Surfacing findings/canary/options is always in-bounds.';

const CLAUSE = fs.readFileSync(
  path.join(__dirname, '_adam-proactive-propose-not-execute-clause.md'),
  'utf8'
);

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
  content = content.replace(ANCHOR, `${CLAUSE.trimEnd()}\n\n${ANCHOR}`);

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
