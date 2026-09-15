/**
 * role-skill-tools — pin a role's skills to immutable git-commit references, and check
 * call-time tool authorization against a resolved role's own tool list.
 * SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001, FR-3 + FR-4.
 *
 * Neither function touches a database or the filesystem. `roleFunctionLayer` is the shape of
 * org_role_base_versions.function (a JSONB object); its OPTIONAL `skills` key holds
 * [{skill_key, pinned_commit, version_label}] — pinned_commit (FR-2's immutable git-commit
 * pin) is load-bearing, version_label is cosmetic display only. `resolvedRole` is the flat
 * shape lib/org/role-registry-resolver.mjs's resolveVentureRoles() returns (has a flat
 * `.tools` array merged in from the function layer).
 */
'use strict';

/** Syntactic shape of a git object name (7-40 hex chars) -- a cheap, sync sanity check that a
 *  pin is at least SHA-shaped. This is NOT a substitute for isCommitObject() (lib/skills/
 *  pinned-skill-read.mjs) -- that requires a git call and would make this function impure/async,
 *  crossing the module boundary this function deliberately stays on the pure side of (TR-2). It
 *  only rejects the cheapest, most damaging mistake: an empty string, a branch name, or garbage. */
const SHA_SHAPED = /^[0-9a-f]{7,40}$/i;

/**
 * Return a NEW function-layer object with `skillKey` pinned to `pin` — never mutates the
 * input. Re-pinning an already-pinned skill_key replaces exactly that entry; every other
 * pinned skill on the role is untouched.
 * @param {object} roleFunctionLayer
 * @param {string} skillKey
 * @param {{pinned_commit: string, version_label?: string}} pin
 * @returns {object} a new function-layer object
 * @throws {TypeError} if roleFunctionLayer is not an object, skillKey is not a non-empty
 *   string, or pin.pinned_commit is not SHA-shaped
 */
export function pinSkillForRole(roleFunctionLayer, skillKey, pin) {
  if (!roleFunctionLayer || typeof roleFunctionLayer !== 'object') {
    throw new TypeError('pinSkillForRole: roleFunctionLayer must be an object');
  }
  if (typeof skillKey !== 'string' || skillKey === '') {
    throw new TypeError(`pinSkillForRole: skillKey must be a non-empty string, got: ${JSON.stringify(skillKey)}`);
  }
  if (typeof pin?.pinned_commit !== 'string' || !SHA_SHAPED.test(pin.pinned_commit)) {
    throw new TypeError(`pinSkillForRole: pin.pinned_commit must be a SHA-shaped string, got: ${JSON.stringify(pin?.pinned_commit)}`);
  }

  const existingSkills = Array.isArray(roleFunctionLayer.skills) ? roleFunctionLayer.skills : [];
  const withoutTarget = existingSkills.filter((entry) => entry.skill_key !== skillKey);
  const newEntry = {
    skill_key: skillKey,
    pinned_commit: pin.pinned_commit,
    version_label: pin.version_label,
  };

  return {
    ...roleFunctionLayer,
    skills: [...withoutTarget, newEntry],
  };
}

/**
 * Current skill pins on a role's function layer, or an empty array if none (including when
 * roleFunctionLayer itself is null/undefined -- a read, so it fails closed to "no pins" rather
 * than throwing). Returns a shallow copy -- a caller mutating the returned array can never
 * corrupt roleFunctionLayer in place, matching pinSkillForRole's own never-mutates contract.
 * @param {object} roleFunctionLayer
 * @returns {{skill_key: string, pinned_commit: string, version_label?: string}[]}
 */
export function listPinnedSkillsForRole(roleFunctionLayer) {
  if (!roleFunctionLayer || !Array.isArray(roleFunctionLayer.skills)) return [];
  return [...roleFunctionLayer.skills];
}

/**
 * Fail-closed call-time tool authorization: true iff `toolName` is present in the resolved
 * role's own `.tools` array. Never throws; never defaults to true for a missing/empty/absent
 * `.tools` field. Does NOT read or write tool_access_grants — that is a separate, existing,
 * grant-time mechanism bound to a concrete agent_id, not duplicated here (TR-3).
 * @param {{tools?: string[]}} resolvedRole
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolGrantedForRole(resolvedRole, toolName) {
  if (!resolvedRole || !Array.isArray(resolvedRole.tools)) return false;
  return resolvedRole.tools.includes(toolName);
}
