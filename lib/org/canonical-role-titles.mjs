/**
 * Canonical, venture-agnostic titles for org_agent_roles — SD-LEO-INFRA-STOP-ORG-ROLE-001.
 *
 * org_agent_roles is the SHARED role registry (role_key TEXT PRIMARY KEY, no venture_id) --
 * its `title` must never carry a per-venture display name. This module is the single source
 * of truth for what each role_key's canonical title SHOULD be, derived directly from
 * STANDARD_VENTURE_TEMPLATE / EHG_SHARED_OPERATORS (lib/agents/venture-ceo-factory.js) --
 * the same structures the factory itself uses to build a PER-VENTURE display_name at
 * instantiation time, with the venture-name portion stripped back out.
 *
 * Consumed by:
 *   - lib/org/factory-identity-fold.cjs (dynamic import): the safe, non-venture-specific
 *     fallback title on a role_key's first-ever insert into org_agent_roles.
 *   - scripts/one-off/restore-org-agent-roles-canonical-titles.mjs: the one-time repair of
 *     the 28 rows a prior test run clobbered with a venture-named title.
 *   - scripts/lint/org-agent-roles-canonical-titles-check.mjs: the live CI check (E2).
 *
 * @module lib/org/canonical-role-titles
 */
import { STANDARD_VENTURE_TEMPLATE, EHG_SHARED_OPERATORS } from '../agents/venture-ceo-factory.js';

/** '{venture_name} VP Strategy' -> 'VP Strategy'. Matches every CEO/VP display_name_template
 *  in STANDARD_VENTURE_TEMPLATE, which are all literally "{venture_name} <Role>". */
function templateToCanonicalTitle(displayNameTemplate) {
  return String(displayNameTemplate).replace('{venture_name}', '').trim();
}

/**
 * @returns {Map<string, string>} role_key (UPPERCASE) -> canonical title, for every role
 *   STANDARD_VENTURE_TEMPLATE / EHG_SHARED_OPERATORS currently defines.
 */
export function computeCanonicalRoleTitles() {
  const titles = new Map();

  titles.set(
    String(STANDARD_VENTURE_TEMPLATE.ceo.agent_role).toUpperCase(),
    templateToCanonicalTitle(STANDARD_VENTURE_TEMPLATE.ceo.display_name_template),
  );

  for (const exec of STANDARD_VENTURE_TEMPLATE.executives) {
    titles.set(String(exec.agent_role).toUpperCase(), templateToCanonicalTitle(exec.display_name_template));
  }

  // Crews carry no display_name_template -- the factory itself derives their per-venture
  // display_name as `${ventureName} ${crew.agent_role.replace(/_/g, ' ')}` (venture-ceo-factory.js
  // instantiateVenture() Step 3). The canonical form is that same suffix, venture-name-free.
  for (const crew of STANDARD_VENTURE_TEMPLATE.crews) {
    titles.set(String(crew.agent_role).toUpperCase(), String(crew.agent_role).replace(/_/g, ' '));
  }

  // EHG_SHARED_OPERATORS instantiate ONCE at the holdco level -- their display_name is
  // ALREADY venture-agnostic ("EHG Finance/Billing Operator"), used verbatim.
  for (const operator of EHG_SHARED_OPERATORS) {
    titles.set(String(operator.agent_role).toUpperCase(), String(operator.display_name));
  }

  return titles;
}
