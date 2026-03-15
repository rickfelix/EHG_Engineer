/**
 * Specialist Persister — creates 25 Board of Directors registry entries
 * from accumulated stage context. Context capped at 2000 tokens.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MAX_CONTEXT_CHARS = 8000; // ~2000 tokens

/**
 * Persist stage specialists to specialist_registry
 * @param {string} ventureId
 * @param {object[]} journalEntries - from journal-capture
 * @returns {object} summary of persisted specialists
 */
export async function persistSpecialists(ventureId, journalEntries) {
  const specialists = [];

  for (const entry of journalEntries) {
    const context = buildSpecialistContext(entry);

    specialists.push({
      name: `Stage ${entry.stage_number} Specialist`,
      role: `venture-stage-${entry.stage_number}`,
      expertise: `Stage ${entry.stage_number} assessment expert with gap analysis and enhancement knowledge`,
      context: truncateContext(context),
      source_venture_id: ventureId,
      stage_number: entry.stage_number,
      created_by: 'proving-companion'
    });
  }

  // Check if specialist_registry table exists and has expected columns
  const { data: sample, error: checkErr } = await supabase
    .from('specialist_registry')
    .select('*')
    .limit(1);

  if (checkErr) {
    console.log(`  specialist_registry not accessible: ${checkErr.message}`);
    return { persisted: 0, skipped: specialists.length, reason: checkErr.message };
  }

  let persisted = 0;
  for (const spec of specialists) {
    const { error } = await supabase
      .from('specialist_registry')
      .upsert({
        name: spec.name,
        role: spec.role,
        expertise: spec.expertise,
        context: spec.context,
        metadata: {
          source_venture_id: spec.source_venture_id,
          stage_number: spec.stage_number,
          created_by: spec.created_by
        }
      }, { onConflict: 'role' });

    if (error) {
      console.log(`  specialist ${spec.name} upsert error: ${error.message}`);
    } else {
      persisted++;
    }
  }

  return { persisted, total: specialists.length };
}

function buildSpecialistContext(entry) {
  const parts = [];
  parts.push(`Stage ${entry.stage_number} Assessment Summary:`);

  if (entry.planned) {
    const caps = entry.planned.planned_capabilities || [];
    parts.push(`Planned: ${caps.length} capabilities, ${(entry.planned.expected_files || []).length} expected files`);
  }

  if (entry.actual) {
    parts.push(`Reality: ${(entry.actual.found_files || []).length} files found, status: ${entry.actual.implementation_status || 'unknown'}`);
  }

  if (entry.gaps && entry.gaps.length > 0) {
    parts.push(`Gaps (${entry.gaps.length}): ${entry.gaps.slice(0, 3).map(g => `[${g.severity}] ${g.description}`).join('; ')}`);
  }

  if (entry.enhancements && entry.enhancements.length > 0) {
    parts.push(`Enhancements (${entry.enhancements.length}): ${entry.enhancements.slice(0, 3).map(e => e.title).join('; ')}`);
  }

  if (entry.chairman_decision) {
    parts.push(`Chairman decision: ${entry.chairman_decision}`);
  }

  if (entry.journal_notes) {
    parts.push(`Notes: ${entry.journal_notes}`);
  }

  return parts.join('\n');
}

function truncateContext(text) {
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return text.slice(0, MAX_CONTEXT_CHARS - 3) + '...';
}
