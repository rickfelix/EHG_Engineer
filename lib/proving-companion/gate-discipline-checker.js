/**
 * Gate Discipline Checker — queries stage_proving_journal to verify
 * kill/promotion gates received real chairman decisions, not rubber stamps.
 * Deterministic, zero LLM cost.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
import { getStageRange, getGateStages } from './stage-config.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const KILL_GATES = [3, 5, 13];

/**
 * Check gate discipline for a range of stages
 * @param {string} ventureId
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {object} map of stage number to check results
 */
export async function checkGateDiscipline(ventureId, fromStage, toStage) {
  const stageConfigs = getStageRange(fromStage, toStage);
  const gateStages = getGateStages().filter(g => g >= fromStage && g <= toStage);
  const results = {};

  const { data: journalEntries, error } = await supabase
    .from('stage_proving_journal')
    .select('stage_number, chairman_decision, journal_notes, created_at')
    .eq('venture_id', ventureId)
    .in('stage_number', gateStages.length > 0 ? gateStages : [-1]);

  if (error) throw new Error(`Journal query failed: ${error.message}`);

  const journalMap = {};
  for (const j of (journalEntries || [])) {
    journalMap[j.stage_number] = j;
  }

  for (const [stageNum, config] of Object.entries(stageConfigs)) {
    const num = parseInt(stageNum);
    const checks = [];

    if (!config.gateType) {
      checks.push({ name: 'not_a_gate', pass: true, detail: 'Stage is not a decision gate' });
      results[stageNum] = { stage_number: num, stage_name: config.name, checks, pass_count: 1, fail_count: 0 };
      continue;
    }

    const journal = journalMap[num];

    checks.push({
      name: 'decision_exists',
      pass: journal?.chairman_decision != null && journal.chairman_decision !== 'pending',
      detail: journal?.chairman_decision
        ? `Decision: ${journal.chairman_decision}`
        : 'No chairman decision recorded for this gate'
    });

    if (KILL_GATES.includes(num)) {
      const notesLength = journal?.journal_notes ? journal.journal_notes.length : 0;
      checks.push({
        name: 'kill_gate_notes',
        pass: notesLength > 0,
        detail: notesLength > 0
          ? `Notes provided (${notesLength} chars)`
          : `Kill gate at Stage ${num} has no chairman notes`
      });
    }

    results[stageNum] = {
      stage_number: num,
      stage_name: config.name,
      checks,
      pass_count: checks.filter(c => c.pass).length,
      fail_count: checks.filter(c => !c.pass).length
    };
  }

  return results;
}
