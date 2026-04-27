/**
 * Sub-flow: decision.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 */

import { runSubFlow } from './_internal/sub-flow-base.js';

const FLOW_GUIDANCE = `Mode: decision frame. The chairman is choosing between two or more concrete options.

Your reply MUST:
- Frame at least two tradeoff axes (e.g. cost vs speed, reversibility vs upside, optionality vs focus)
- For each option, state which axis it wins on and which it loses on
- Recommend a default, explicitly — but flag that this is a recommendation, not a command

If the framing is binary and a third option exists, name it. If criteria haven't been stated, ask for them before choosing — pushback, not yielding.`;

export default async function decision(subtask, { history = [], operatorInput = '', client, model } = {}) {
  return runSubFlow({
    flow: 'decision',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
  });
}
