/**
 * Tool Policy Module - Per-Agent Tool Policy Profiles
 * SD: SD-EVA-FEAT-TOOL-POLICIES-001
 *
 * Canonical source of truth for tool allowlists per profile.
 * Used by both the agent compiler and runtime validation gate.
 */

/** @typedef {'full' | 'coding' | 'readonly' | 'minimal'} ToolPolicyProfile */

/**
 * Canonical tool allowlists per profile.
 * Order: most permissive → most restrictive.
 */
const PROFILE_ALLOWLISTS = {
  full: null, // null means ALL tools allowed (no filtering)
  coding: [
    'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit',
    'Task', 'TeamCreate', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'SendMessage'
  ],
  readonly: ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
  minimal: ['Read']
};

/**
 * Check if a tool is allowed for a given profile.
 * @param {ToolPolicyProfile} profile
 * @param {string} toolName
 * @returns {boolean}
 */
export function canUseTool(profile, toolName) {
  const allowlist = PROFILE_ALLOWLISTS[profile];
  if (allowlist === null || allowlist === undefined) return true; // full profile
  return allowlist.includes(toolName);
}

/**
 * Get the allowlist for a profile.
 * @param {ToolPolicyProfile} profile
 * @returns {string[] | null} null means all tools allowed
 */
export function getAllowedTools(profile) {
  return PROFILE_ALLOWLISTS[profile] ?? null;
}

/**
 * Filter an array of tool names by profile.
 * Returns only the tools that are allowed for the given profile.
 * If profile is 'full' or unknown, returns the original array unchanged.
 *
 * @param {ToolPolicyProfile} profile
 * @param {string[]} tools - Current tool list
 * @returns {string[]} Filtered tool list
 */
export function filterToolsByProfile(profile, tools) {
  const allowlist = PROFILE_ALLOWLISTS[profile];
  if (!allowlist) return tools; // full profile or unknown → no filtering
  return tools.filter(t => allowlist.includes(t));
}

/**
 * Validate a profile name.
 * @param {string} profile
 * @returns {boolean}
 */
export function isValidProfile(profile) {
  return profile in PROFILE_ALLOWLISTS;
}

/**
 * Create a structured TOOL_NOT_ALLOWED error.
 * @param {string} subAgentId
 * @param {ToolPolicyProfile} profile
 * @param {string} toolName
 * @returns {{ type: string, subAgentId: string, profile: string, toolName: string, allowed: string[], reason: string }}
 */
export function createToolNotAllowedError(subAgentId, profile, toolName) {
  const allowed = PROFILE_ALLOWLISTS[profile] || [];
  return {
    type: 'TOOL_NOT_ALLOWED',
    subAgentId,
    profile,
    toolName,
    allowed,
    reason: `Tool '${toolName}' is not allowed for profile '${profile}'. Allowed tools: ${allowed.join(', ')}`
  };
}

/**
 * All valid profile names.
 */
export const VALID_PROFILES = Object.keys(PROFILE_ALLOWLISTS);

export default {
  canUseTool,
  getAllowedTools,
  filterToolsByProfile,
  isValidProfile,
  createToolNotAllowedError,
  VALID_PROFILES,
  PROFILE_ALLOWLISTS
};
