/**
 * Sub-flow: pure_human.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 *
 * Replies short and explicitly defer — no LLM-elaborated content
 * for actions only the chairman can take (phone call, in-person meeting).
 */

import { runSubFlow } from './_internal/sub-flow-base.js';

const FLOW_GUIDANCE = `Mode: pure-human action. The subtask requires a phone call, an in-person meeting, or a physical action only the chairman can do.

Your reply MUST:
- Be ≤120 characters
- Explicitly defer ("This is on you" / "I can't do this for you" / "Pick up the phone")
- Optionally name one preparation step (e.g. "Have the X document open"), but only if obviously useful

Do NOT roleplay the conversation. Do NOT draft what to say (that's the draft flow).`;

export default async function pureHuman(subtask, { history = [], operatorInput = '', client, model } = {}) {
  return runSubFlow({
    flow: 'pure_human',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
  });
}
