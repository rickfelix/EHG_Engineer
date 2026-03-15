/**
 * Journal Capture — writes stage_proving_journal entries.
 * Ensures journal_completeness: all JSONB fields populated.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Write a journal entry for a stage assessment
 * @param {string} ventureId
 * @param {number} stageNumber
 * @param {object} assessment - { plan, reality, gaps, enhancements, decision, notes, durationMs }
 * @returns {object} inserted journal row
 */
export async function writeJournalEntry(ventureId, stageNumber, assessment) {
  const { getGateStages } = await import('./stage-config.js');
  const gateStages = getGateStages();

  const entry = {
    venture_id: ventureId,
    stage_number: stageNumber,
    gate_stage: gateStages.includes(stageNumber) ? stageNumber : null,
    planned: assessment.plan || {},
    actual: assessment.reality || {},
    gaps: assessment.gaps || [],
    enhancements: assessment.enhancements || [],
    chairman_decision: assessment.decision || null,
    journal_notes: assessment.notes || null,
    assessment_duration_ms: assessment.durationMs || null
  };

  const { data, error } = await supabase
    .from('stage_proving_journal')
    .upsert(entry, { onConflict: 'venture_id,stage_number' })
    .select()
    .single();

  if (error) throw new Error(`Journal write failed: ${error.message}`);
  return data;
}

/**
 * Get all journal entries for a venture
 * @param {string} ventureId
 * @returns {object[]}
 */
export async function getJournalEntries(ventureId) {
  const { data, error } = await supabase
    .from('stage_proving_journal')
    .select('*')
    .eq('venture_id', ventureId)
    .order('stage_number', { ascending: true });

  if (error) throw new Error(`Journal read failed: ${error.message}`);
  return data || [];
}
