/** Shared helpers for MAST check modules -- not itself a check. */

/** Finds a role entry (ceo/executive/crew) by its real agent_role field. */
export function findRoleByAgentRole(organization, agentRole) {
  if (organization?.ceo?.agent_role === agentRole) return organization.ceo;
  const exec = (organization?.executives ?? []).find((e) => e.agent_role === agentRole);
  if (exec) return exec;
  return (organization?.crews ?? []).find((c) => c.agent_role === agentRole);
}
