/**
 * MAST FM-2.1 broken fixture: conversation reset (proxy). Breaks turn 2's refs_prior_turn chain
 * so it no longer points at turn 1, simulating a dropped/reset conversation.
 */
import { buildMockVentureOrganization, cloneOrganization } from '../mock-venture.mjs';

export function buildBrokenFixture() {
  const org = cloneOrganization(buildMockVentureOrganization());
  const turn2 = org.conversation_log.find((entry) => entry.turn === 2);
  turn2.refs_prior_turn = null;
  return org;
}
