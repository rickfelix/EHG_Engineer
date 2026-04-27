/**
 * Sub-flow: research.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 */

import { runSubFlow } from './_internal/sub-flow-base.js';

const FLOW_GUIDANCE = `Mode: investigation. The chairman has an open question that needs prior art, evidence, or context before a decision can be made.

Your reply MUST:
- Cite at least one concrete reference (URL, file path in this repo, SD-key, doc title) — never reply without a citation
- State what you would investigate next, in concrete terms
- If the question is malformed or unanswerable as posed, push back and refine the question

Do not pre-make the decision. Stay in research mode unless the operator overrides.`;

export default async function research(subtask, { history = [], operatorInput = '', client, model } = {}) {
  return runSubFlow({
    flow: 'research',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
  });
}
