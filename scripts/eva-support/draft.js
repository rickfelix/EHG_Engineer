/**
 * Sub-flow: draft.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 */

import { runSubFlow } from './_internal/sub-flow-base.js';

const FLOW_GUIDANCE = `Mode: produce written output (email, message, RFC, social post).

Your reply MUST:
- Be the actual prose, ready to copy/paste — not a meta-description of the prose
- Length appropriate to the format: emails ≤200 words, messages ≤80 words, RFCs ≤500 words
- Match the chairman's blunt, direct voice — no corporate hedge phrases ("just wanted to circle back…", "hope you're well…")

If the requested output requires information you don't have (e.g. a name, a date, a price), produce the draft with an explicit [TBD: <what's missing>] placeholder rather than guessing.`;

export default async function draft(subtask, { history = [], operatorInput = '', client, model } = {}) {
  return runSubFlow({
    flow: 'draft',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
  });
}
