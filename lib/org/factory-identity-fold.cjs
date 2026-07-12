/**
 * Factory identity fold — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-1.
 *
 * The supersession seam for lib/agents/venture-ceo-factory.js's _createAgent()/_grantTools():
 * every agent the factory creates is ALSO recorded in the spine identity substrate
 * (org_agent_roles + org_agent_identities) with ZERO implicit authority (born denied),
 * and tool grants route through the writer-authorization gate.
 *
 * FAIL-SOFT BY CONTRACT: the factory's existing behavior is greenfield-compatible —
 * if the substrate migration has not been applied yet (or any substrate write fails),
 * venture instantiation proceeds unchanged and the miss is logged once. The gate
 * ladder is off by default, so with flags absent this fold is byte-identical
 * behavior + two additive inserts.
 *
 * @module lib/org/factory-identity-fold
 */
'use strict';

const {
  resolveWriterAuthMode,
  evaluateWriterAuthorization,
  formatWriterWouldDenyLine,
  recordWriterWouldDenyEvidence,
} = require('./gates/writer-authorization.cjs');

/** agent_role values the runtime treats as routing/chief-of-staff (mirrors gate ROUTING_ROLE_KEYS). */
const ROUTING_AGENT_ROLES = ['EVA', 'CHIEF_OF_STAFF'];

/**
 * Record a factory-created agent in the spine identity substrate. Born denied:
 * this records WHO the role-specialized agent is — it grants nothing.
 *
 * @param {object} supabase - service client
 * @param {{venture_id?: string, agent_role: string, display_name?: string, agent_type?: string,
 *          capabilities?: unknown, hierarchy_path?: string}} agentData - the factory's agent payload
 * @param {{id: string}} agentRow - the created agent_registry row
 * @returns {Promise<{identity_id: string|null, recorded: boolean, reason?: string}>}
 */
async function recordIdentityForAgent(supabase, agentData, agentRow) {
  try {
    const roleKey = String(agentData.agent_role || '').toUpperCase();
    if (!roleKey) return { identity_id: null, recorded: false, reason: 'no_role_key' };

    // Ensure the role registry entry exists (additive; is_routing_role derived from the
    // known routing set — domain roles default false, which is the safe direction:
    // false only widens what the gate may grant, and grants still require authority).
    await supabase.from('org_agent_roles').upsert(
      {
        role_key: roleKey,
        title: agentData.display_name || roleKey,
        domain: agentData.agent_type || null,
        is_routing_role: ROUTING_AGENT_ROLES.includes(roleKey),
      },
      { onConflict: 'role_key', ignoreDuplicates: true },
    );

    const { data, error } = await supabase
      .from('org_agent_identities')
      .upsert(
        {
          venture_id: agentData.venture_id || null,
          role_key: roleKey,
          display_name: agentData.display_name || null,
          context_profile: {
            agent_registry_id: agentRow.id,
            agent_type: agentData.agent_type || null,
            hierarchy_path: agentData.hierarchy_path || null,
            capabilities: agentData.capabilities ?? null,
          },
        },
        { onConflict: 'venture_id,role_key', ignoreDuplicates: false },
      )
      .select('id')
      .maybeSingle();

    if (error) return { identity_id: null, recorded: false, reason: error.message };
    return { identity_id: data ? data.id : null, recorded: !!data };
  } catch (e) {
    return { identity_id: null, recorded: false, reason: (e && e.message) || String(e) };
  }
}

/**
 * Gate a factory tool grant through writer authorization. Surface: 'tool_grant'.
 * off → allow (byte-identical). observe → allow + would-deny evidence. enforce → verdict.
 *
 * @param {object} supabase
 * @param {{identity_id: string|null, role_key: string, venture_id?: string}} identityRef
 * @returns {Promise<{allow: boolean, verdict: object}>}
 */
async function gateFactoryToolGrant(supabase, identityRef) {
  const mode = await resolveWriterAuthMode();
  const identity = { id: identityRef.identity_id, role_key: identityRef.role_key, venture_id: identityRef.venture_id };
  const verdict = await evaluateWriterAuthorization(identity, 'tool_grant', supabase, { mode });
  if (verdict.would_deny) {
    console.log(formatWriterWouldDenyLine(identity, 'tool_grant', verdict));
    await recordWriterWouldDenyEvidence(supabase, identity, 'tool_grant', verdict);
  }
  return { allow: verdict.authorized !== false, verdict };
}

module.exports = { recordIdentityForAgent, gateFactoryToolGrant, ROUTING_AGENT_ROLES };
