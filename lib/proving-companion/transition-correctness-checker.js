/**
 * Transition Correctness Checker — queries venture_stage_transitions to verify
 * stages execute in order, prerequisites met, timestamps reasonable.
 * Deterministic, zero LLM cost.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getStageRange } from './stage-config.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIN_TRANSITION_SECONDS = 60;

/**
 * Check transition correctness for a range of stages
 * @param {string} ventureId
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {object} map of stage number to check results
 */
export async function checkTransitionCorrectness(ventureId, fromStage, toStage) {
  const stageConfigs = getStageRange(fromStage, toStage);
  const results = {};

  const { data: transitions, error } = await supabase
    .from('venture_stage_transitions')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: true });

  if (error) {
    for (const [stageNum, config] of Object.entries(stageConfigs)) {
      results[stageNum] = {
        stage_number: parseInt(stageNum),
        stage_name: config.name,
        checks: [{ name: 'transition_data', pass: false, detail: `No transition data available: ${error.message}` }],
        pass_count: 0, fail_count: 1
      };
    }
    return results;
  }

  const transitionList = transitions || [];

  for (const [stageNum, config] of Object.entries(stageConfigs)) {
    const num = parseInt(stageNum);
    const checks = [];

    if (num === 1) {
      checks.push({ name: 'first_stage', pass: true, detail: 'Stage 1 has no prerequisite transition' });
      results[stageNum] = { stage_number: num, stage_name: config.name, checks, pass_count: 1, fail_count: 0 };
      continue;
    }

    const inbound = transitionList.find(t => t.to_stage === num);

    if (!inbound) {
      checks.push({ name: 'transition_exists', pass: false, detail: `No transition record into Stage ${num}` });
      results[stageNum] = { stage_number: num, stage_name: config.name, checks, pass_count: 0, fail_count: 1 };
      continue;
    }

    checks.push({
      name: 'sequential_order',
      pass: inbound.from_stage === num - 1,
      detail: inbound.from_stage === num - 1
        ? `Sequential: Stage ${inbound.from_stage} -> ${num}`
        : `Non-sequential: Stage ${inbound.from_stage} -> ${num} (expected ${num - 1} -> ${num})`
    });

    checks.push({
      name: 'transition_recorded',
      pass: inbound.created_at != null,
      detail: inbound.created_at != null
        ? `Recorded at ${inbound.created_at}`
        : 'Transition has no timestamp'
    });

    const prevTransition = transitionList.find(t => t.to_stage === num - 1);
    if (prevTransition?.created_at && inbound.created_at) {
      const prevTime = new Date(prevTransition.created_at).getTime();
      const thisTime = new Date(inbound.created_at).getTime();
      const gapSeconds = Math.round((thisTime - prevTime) / 1000);

      checks.push({
        name: 'time_on_stage',
        pass: gapSeconds >= MIN_TRANSITION_SECONDS,
        detail: gapSeconds >= MIN_TRANSITION_SECONDS
          ? `${gapSeconds}s between stages (min ${MIN_TRANSITION_SECONDS}s)`
          : `Only ${gapSeconds}s between stages — possible rubber-stamping (min ${MIN_TRANSITION_SECONDS}s)`
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
