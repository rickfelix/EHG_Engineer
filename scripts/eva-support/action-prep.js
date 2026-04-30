/**
 * Sub-flow: action_prep.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 */

import { runSubFlow } from './_internal/sub-flow-base.js';

const FLOW_GUIDANCE = `Mode: concrete next-step planning.

Your reply MUST:
- Be a numbered checklist of at least 3 items — distinguishable from prose by leading numerals
- Each item is a single concrete action (verb-led: "Send…", "Open…", "Add…", "Confirm…"), not a category ("Marketing")
- If the chairman seems to be planning the wrong action, push back — do not produce a checklist for a doomed plan

Order matters: items must be in the actual sequence the chairman should execute them.`;

export default async function actionPrep(subtask, { history = [], operatorInput = '', client, model } = {}) {
  return runSubFlow({
    flow: 'action_prep',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
  });
}
