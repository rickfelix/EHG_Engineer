#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-6:
 * Insert the Orchestrator Parent Lifecycle subsection into leo_protocol_sections id=439
 * (SD Continuation Truth Table) BEFORE the Conflict Resolution subsection.
 *
 * Also append a Historical Notes entry.
 *
 * Subsection content lives in _truth-table-orch-parent-lifecycle-subsection.md (sibling file)
 * to keep backticks/quotes out of JS template-literal escaping hell.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NEW_SUBSECTION = fs.readFileSync(
  path.join(__dirname, '_truth-table-orch-parent-lifecycle-subsection.md'),
  'utf8'
);

const HISTORICAL_NOTE = '\n**2026-05-27 (v4)**: Added Orchestrator Parent Lifecycle subsection (SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001). Codifies that parent orchestrator SDs use reduced gate sets at PLAN-TO-EXEC and EXEC-TO-PLAN, and that PREREQUISITE_HANDOFF_CHECK at PLAN-TO-LEAD returns a WAIT verdict (distinct from FAIL) when children are incomplete — no retry budget burn, no RCA trigger. Closes CronGenius pilot F6/F7/F8/F8a/F8b.';

(async () => {
  const { data: row, error: readErr } = await supabase
    .from('leo_protocol_sections')
    .select('content')
    .eq('id', 439)
    .single();

  if (readErr || !row) {
    console.error('Failed to read truth-table section:', readErr?.message);
    process.exit(1);
  }

  let content = row.content;

  if (content.includes('### Orchestrator Parent Lifecycle')) {
    console.log('Subsection already present — skipping insert');
    process.exit(0);
  }

  const anchor = '### Conflict Resolution';
  if (!content.includes(anchor)) {
    console.error('Could not find anchor "### Conflict Resolution" — aborting');
    process.exit(1);
  }

  content = content.replace(anchor, NEW_SUBSECTION + anchor);

  if (!content.includes('2026-05-27 (v4)')) {
    content = content.trimEnd() + HISTORICAL_NOTE + '\n';
  }

  const { error: writeErr } = await supabase
    .from('leo_protocol_sections')
    .update({ content })
    .eq('id', 439);

  if (writeErr) {
    console.error('Failed to update truth-table section:', writeErr.message);
    process.exit(1);
  }

  console.log(`✓ Updated leo_protocol_sections id=439 — new length: ${content.length} chars`);
  console.log('Next step: regenerate CLAUDE.md via node scripts/generate-claude-md-from-db.js');
})();
