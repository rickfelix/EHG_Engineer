#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 -- FR-1 follow-up fix, same EXEC window.
 *
 * ssot-dedup-reconcile-001.mjs gave rows 308/309/310 an IDENTICAL archived-duplicate marker
 * string, which is itself a duplicate-content violation under the new FR-3c uniqueness check
 * (protocol-publication-audit.cjs's evaluateContentUniqueness) -- caught by running that exact
 * check live immediately after the FR-1 mutation, before EXEC-TO-PLAN. Fixed by making each
 * row's archived-marker content name its own distinct original section_type, which is both
 * accurate and sufficient to break the duplicate.
 *
 * Usage: node scripts/one-off/ssot-dedup-fix-family1-uniqueness-001.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FIXES = [
  { id: 308, original_type: 'mandatory_phase_transitions_lead' },
  { id: 309, original_type: 'mandatory_phase_transitions_plan' },
  { id: 310, original_type: 'mandatory_phase_transitions_exec' },
];

async function main() {
  for (const fix of FIXES) {
    const content = `_[Archived duplicate (originally section_type='${fix.original_type}') -- see canonical row 307 (mandatory_phase_transitions, renders in CLAUDE_CORE.md) for the live Phase Transition Commands rule. This row diverged from 307 and never rendered anywhere (excluded from section-file-mapping.json). Reconciled by SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001, not content-copied from 307 because 307 itself carried a since-superseded bypass-quota claim at reconciliation time.]_`;
    const { error } = await supabase
      .from('leo_protocol_sections')
      .update({ content })
      .eq('id', fix.id);
    if (error) { console.error(`FAILED row ${fix.id}: ${error.message}`); process.exitCode = 1; continue; }
    console.log(`Row ${fix.id}: content made distinguishable (${fix.original_type})`);
  }
}

if (isMainModule(import.meta.url)) main();
