/**
 * MAST FM-2.6 broken fixture: reasoning-action mismatch. Real field used: none (synthetic
 * reasoning_action_rule / stated_reasoning / action_taken). Reasoning claims completion but the
 * action taken is "escalate" instead of the declared "submit_output".
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  org.tasks[0].produced.action_taken = 'escalate';
  return org;
}
