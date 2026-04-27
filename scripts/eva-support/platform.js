/**
 * Sub-flow: platform.
 * SD: SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A
 */

import { runSubFlow } from './_internal/sub-flow-base.js';

const FLOW_GUIDANCE = `Mode: tool/service selection or configuration.

Your reply MUST:
- Name at least one concrete platform/tool/service by name (e.g. "Stripe", "Postgres on Supabase", "GitHub Actions") — never reply with "a payment provider" or "a database"
- For each named option, give one concrete strength and one concrete drawback for THIS chairman's solo-execution context
- Recommend a default

If the chairman is reaching for a heavyweight platform when a flat file or a spreadsheet would do, push back.`;

export default async function platform(subtask, { history = [], operatorInput = '', client, model } = {}) {
  return runSubFlow({
    flow: 'platform',
    flowGuidance: FLOW_GUIDANCE,
    subtask,
    history,
    operatorInput,
    client,
    model,
  });
}
