/**
 * Feature Flag Registry Service
 * SD-LEO-SELF-IMPROVE-001D - Phase 1.5: Feature Flag Foundation
 *
 * Provides CRUD operations for feature flags, policies, and kill switches.
 * All operations are logged to the audit table for compliance.
 *
 * @module lib/feature-flags/registry
 */

import { createClient } from '@supabase/supabase-js';

// Singleton Supabase client
let supabaseClient = null;

/**
 * Get or create Supabase client
 * @returns {Object} Supabase client instance
 */
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase credentials for feature flag registry');
    }

    supabaseClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseClient;
}

/**
 * Log an action to the audit trail
 * @param {Object} params - Audit parameters
 * @param {string} params.flagKey - Flag key being modified
 * @param {string} params.action - Action performed
 * @param {Object} params.previousState - State before change
 * @param {Object} params.newState - State after change
 * @param {string} params.changedBy - Who made the change
 * @param {string} params.environment - Target environment
 */
async function logAudit({ flagKey, action, previousState, newState, changedBy, environment }) {
  const supabase = getSupabase();

  await supabase.from('leo_feature_flag_audit_log').insert({
    flag_key: flagKey,
    action,
    previous_state: previousState,
    new_state: newState,
    changed_by: changedBy || 'system',
    environment: environment || null
  });
}

// =============================================================================
// Feature Flag CRUD Operations
// =============================================================================

/**
 * Create a new feature flag
 * @param {Object} params - Flag parameters
 * @param {string} params.flagKey - Unique key (e.g., 'quality_layer_sanitization')
 * @param {string} params.displayName - Human-readable name
 * @param {string} params.description - Flag description
 * @param {boolean} params.isEnabled - Initial enabled state (default: false)
 * @param {string} params.changedBy - Who is creating the flag
 * @param {string} params.ownerType - Owner type: 'user' or 'team' (required per FR-3)
 * @param {string} params.ownerId - Owner ID (required per FR-3)
 * @param {string} params.riskTier - Risk tier: 'low', 'medium', 'high' (default: 'medium')
 * @param {boolean} params.isTemporary - Whether flag is temporary (default: false)
 * @param {string} params.expiryAt - Expiry date for temporary flags (required if isTemporary=true)
 * @returns {Promise<Object>} Created flag
 */
export async function createFlag({ flagKey, displayName, description, isEnabled = false, changedBy, ownerType, ownerId, riskTier = 'medium', isTemporary = false, expiryAt }) {
  const supabase = getSupabase();

  // Validate ownership (FR-3: Every flag must have owner)
  if (!ownerType || !ownerId) {
    throw new Error('Creating a flag requires owner_type and owner_id (FR-3 governance requirement)');
  }
  if (!['user', 'team'].includes(ownerType)) {
    throw new Error(`Invalid owner_type '${ownerType}'. Must be 'user' or 'team'`);
  }

  // Validate risk tier
  if (!['low', 'medium', 'high'].includes(riskTier)) {
    throw new Error(`Invalid risk_tier '${riskTier}'. Must be 'low', 'medium', or 'high'`);
  }

  // Validate temporary flag expiry (FR-3)
  if (isTemporary) {
    if (!expiryAt) {
      throw new Error('Temporary flags must have expiry_at set (FR-3 governance requirement)');
    }
    const expiryDate = new Date(expiryAt);
    if (expiryDate <= new Date()) {
      throw new Error('expiry_at must be in the future for temporary flags');
    }
  }

  const { data, error } = await supabase
    .from('leo_feature_flags')
    .insert({
      flag_key: flagKey,
      display_name: displayName,
      description,
      is_enabled: isEnabled,
      lifecycle_state: isEnabled ? 'enabled' : 'draft',
      owner_type: ownerType,
      owner_id: ownerId,
      risk_tier: riskTier,
      is_temporary: isTemporary,
      expiry_at: expiryAt || null
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create flag '${flagKey}': ${error.message}`);
  }

  await logAudit({
    flagKey,
    action: 'created',
    previousState: null,
    newState: data,
    changedBy
  });

  return data;
}

/**
 * Get a feature flag by key
 * @param {string} flagKey - Flag key to retrieve
 * @returns {Promise<Object|null>} Flag data or null if not found
 */
export async function getFlag(flagKey) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('leo_feature_flags')
    .select('*, leo_feature_flag_policies(*)')
    .eq('flag_key', flagKey)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    throw new Error(`Failed to get flag '${flagKey}': ${error.message}`);
  }

  return data || null;
}

/**
 * List all feature flags
 * @param {Object} options - List options
 * @param {boolean} options.includeDisabled - Include disabled flags (default: true)
 * @returns {Promise<Array>} Array of flags
 */
export async function listFlags({ includeDisabled = true } = {}) {
  const supabase = getSupabase();

  let query = supabase
    .from('leo_feature_flags')
    .select('*, leo_feature_flag_policies(*)')
    .order('flag_key');

  if (!includeDisabled) {
    query = query.eq('is_enabled', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list flags: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a feature flag
 * @param {string} flagKey - Flag key to update
 * @param {Object} updates - Fields to update
 * @param {string} updates.displayName - New display name
 * @param {string} updates.description - New description
 * @param {boolean} updates.isEnabled - New enabled state
 * @param {string} changedBy - Who is making the change
 * @returns {Promise<Object>} Updated flag
 */
export async function updateFlag(flagKey, updates, changedBy) {
  const supabase = getSupabase();

  // Get current state for audit
  const currentFlag = await getFlag(flagKey);
  if (!currentFlag) {
    throw new Error(`Flag '${flagKey}' not found`);
  }

  const updateData = {};
  if (updates.displayName !== undefined) updateData.display_name = updates.displayName;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.isEnabled !== undefined) updateData.is_enabled = updates.isEnabled;

  const { data, error } = await supabase
    .from('leo_feature_flags')
    .update(updateData)
    .eq('flag_key', flagKey)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update flag '${flagKey}': ${error.message}`);
  }

  await logAudit({
    flagKey,
    action: 'updated',
    previousState: currentFlag,
    newState: data,
    changedBy
  });

  return data;
}

/**
 * Delete a feature flag
 * @param {string} flagKey - Flag key to delete
 * @param {string} changedBy - Who is deleting the flag
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteFlag(flagKey, changedBy) {
  const supabase = getSupabase();

  // Get current state for audit
  const currentFlag = await getFlag(flagKey);
  if (!currentFlag) {
    throw new Error(`Flag '${flagKey}' not found`);
  }

  const { error } = await supabase
    .from('leo_feature_flags')
    .delete()
    .eq('flag_key', flagKey);

  if (error) {
    throw new Error(`Failed to delete flag '${flagKey}': ${error.message}`);
  }

  await logAudit({
    flagKey,
    action: 'deleted',
    previousState: currentFlag,
    newState: null,
    changedBy
  });

  return true;
}

// =============================================================================
// Lifecycle State Transitions (SD-LEO-SELF-IMPROVE-001K)
// =============================================================================

/**
 * Valid lifecycle state transitions
 * draft → enabled, disabled
 * enabled → disabled, expired, archived
 * disabled → enabled, expired, archived
 * expired → archived
 * archived → (none - terminal state)
 */
const VALID_TRANSITIONS = {
  draft: ['enabled', 'disabled'],
  enabled: ['disabled', 'expired', 'archived'],
  disabled: ['enabled', 'expired', 'archived'],
  expired: ['archived'],
  archived: []
};

/**
 * Approval requirements by risk tier and transition type
 * Returns number of approvals required
 */
const APPROVAL_REQUIREMENTS = {
  low: { enable: 0, disable: 0, archive: 1 },
  medium: { enable: 1, disable: 0, archive: 1 },
  high: { enable: 2, disable: 0, archive: 1 }
};

/**
 * Transition a flag to a new lifecycle state
 * @param {string} flagKey - Flag key to transition
 * @param {string} newState - Target lifecycle state
 * @param {Object} options - Transition options
 * @param {string} options.reason - Reason for transition
 * @param {string} options.actorId - Who is making the transition
 * @param {string} options.actorType - Type of actor (user, system, pipeline)
 * @returns {Promise<Object>} Updated flag
 */
export async function transitionLifecycleState(flagKey, newState, options = {}) {
  const supabase = getSupabase();
  const { reason: _reason, actorId: _actorId = 'system', actorType: _actorType = 'system' } = options;

  // Get current flag
  const flag = await getFlag(flagKey);
  if (!flag) {
    throw new Error(`Flag '${flagKey}' not found`);
  }

  const currentState = flag.lifecycle_state || 'enabled';

  // Validate transition
  if (!VALID_TRANSITIONS[currentState]?.includes(newState)) {
    throw new Error(`Invalid transition: ${currentState} → ${newState}. Valid transitions: ${VALID_TRANSITIONS[currentState]?.join(', ') || 'none'}`);
  }

  // Check approval requirements for enable transitions
  if (newState === 'enabled' && ['medium', 'high'].includes(flag.risk_tier)) {
    const requiredApprovals = APPROVAL_REQUIREMENTS[flag.risk_tier]?.enable || 0;
    if (requiredApprovals > 0) {
      // Check for pending/approved approval request
      const { data: approval } = await supabase
        .from('leo_feature_flag_approvals')
        .select('*')
        .eq('flag_key', flagKey)
        .eq('transition_type', 'enable')
        .eq('status', 'approved')
        .single();

      if (!approval || approval.approvals_received < requiredApprovals) {
        throw new Error(`Transition to 'enabled' requires ${requiredApprovals} approval(s) for ${flag.risk_tier}-risk flags`);
      }
    }
  }

  // Determine is_enabled based on lifecycle state
  const isEnabled = newState === 'enabled';

  // Update flag
  const { data, error } = await supabase
    .from('leo_feature_flags')
    .update({
      lifecycle_state: newState,
      is_enabled: isEnabled,
      updated_at: new Date().toISOString()
    })
    .eq('flag_key', flagKey)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to transition flag '${flagKey}': ${error.message}`);
  }

  return data;
}

/**
 * Request approval for a lifecycle transition
 * @param {string} flagKey - Flag key
 * @param {string} transitionType - Type of transition (enable, disable, archive)
 * @param {string} requesterId - Who is requesting
 * @returns {Promise<Object>} Approval request
 */
export async function requestApproval(flagKey, transitionType, requesterId) {
  const supabase = getSupabase();

  const flag = await getFlag(flagKey);
  if (!flag) {
    throw new Error(`Flag '${flagKey}' not found`);
  }

  const requiredApprovals = APPROVAL_REQUIREMENTS[flag.risk_tier]?.[transitionType] || 0;

  const { data, error } = await supabase
    .from('leo_feature_flag_approvals')
    .insert({
      flag_key: flagKey,
      transition_type: transitionType,
      required_approvals: requiredApprovals,
      requester_id: requesterId,
      status: requiredApprovals === 0 ? 'approved' : 'pending'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create approval request: ${error.message}`);
  }

  return data;
}

/**
 * Approve a pending transition request
 * @param {string} approvalId - Approval request ID
 * @param {string} approverId - Who is approving
 * @returns {Promise<Object>} Updated approval
 */
export async function approveTransition(approvalId, approverId) {
  const supabase = getSupabase();

  // Get current approval
  const { data: approval, error: fetchError } = await supabase
    .from('leo_feature_flag_approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (fetchError || !approval) {
    throw new Error('Approval request not found');
  }

  if (approval.status !== 'pending') {
    throw new Error(`Approval already ${approval.status}`);
  }

  // Check if approver already approved
  if (approval.approver_ids.includes(approverId)) {
    throw new Error('You have already approved this request');
  }

  const newApprovalCount = approval.approvals_received + 1;
  const newStatus = newApprovalCount >= approval.required_approvals ? 'approved' : 'pending';

  const { data, error } = await supabase
    .from('leo_feature_flag_approvals')
    .update({
      approvals_received: newApprovalCount,
      approver_ids: [...approval.approver_ids, approverId],
      status: newStatus,
      resolved_at: newStatus === 'approved' ? new Date().toISOString() : null
    })
    .eq('id', approvalId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to approve: ${error.message}`);
  }

  return data;
}

/**
 * Set flag ownership
 * @param {string} flagKey - Flag key
 * @param {string} ownerType - Owner type (user, team)
 * @param {string} ownerId - Owner ID
 * @param {string} changedBy - Who is making the change
 * @returns {Promise<Object>} Updated flag
 */
export async function setOwnership(flagKey, ownerType, ownerId, _changedBy) {
  const supabase = getSupabase();

  if (ownerType && !['user', 'team'].includes(ownerType)) {
    throw new Error(`Invalid owner_type: ${ownerType}. Must be 'user' or 'team'`);
  }

  const { data, error } = await supabase
    .from('leo_feature_flags')
    .update({
      owner_type: ownerType,
      owner_id: ownerId,
      updated_at: new Date().toISOString()
    })
    .eq('flag_key', flagKey)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set ownership: ${error.message}`);
  }

  return data;
}

/**
 * Mark a flag as temporary with expiry date
 * @param {string} flagKey - Flag key
 * @param {Date|string} expiryAt - Expiry date
 * @param {string} changedBy - Who is making the change
 * @returns {Promise<Object>} Updated flag
 */
export async function setTemporary(flagKey, expiryAt, _changedBy) {
  const supabase = getSupabase();

  const expiryDate = expiryAt instanceof Date ? expiryAt.toISOString() : expiryAt;

  const { data, error } = await supabase
    .from('leo_feature_flags')
    .update({
      is_temporary: true,
      expiry_at: expiryDate,
      updated_at: new Date().toISOString()
    })
    .eq('flag_key', flagKey)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set temporary flag: ${error.message}`);
  }

  return data;
}

/**
 * Get expired flags that need to be transitioned
 * @returns {Promise<Array>} Array of expired flags
 */
export async function getExpiredFlags() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('leo_feature_flags')
    .select('*')
    .eq('is_temporary', true)
    .not('expiry_at', 'is', null)
    .lt('expiry_at', new Date().toISOString())
    .neq('lifecycle_state', 'expired')
    .neq('lifecycle_state', 'archived');

  if (error) {
    throw new Error(`Failed to get expired flags: ${error.message}`);
  }

  return data || [];
}

/**
 * Process expired flags - transition them to 'expired' state
 * @returns {Promise<number>} Number of flags processed
 */
export async function processExpiredFlags() {
  const expiredFlags = await getExpiredFlags();
  let processed = 0;

  for (const flag of expiredFlags) {
    try {
      await transitionLifecycleState(flag.flag_key, 'expired', {
        reason: 'Automatic expiry based on expiry_at date',
        actorType: 'system'
      });
      processed++;
      console.log(`[FEATURE FLAGS] Expired: ${flag.flag_key}`);
    } catch (err) {
      console.error(`[FEATURE FLAGS] Failed to expire ${flag.flag_key}: ${err.message}`);
    }
  }

  return processed;
}

// =============================================================================
// Policy Operations
// =============================================================================

/**
 * Set rollout policy for a flag in a specific environment
 * @param {Object} params - Policy parameters
 * @param {string} params.flagKey - Flag key
 * @param {string} params.environment - Target environment (production, staging, development)
 * @param {number} params.rolloutPercentage - Percentage of users (0-100)
 * @param {Object} params.userTargeting - User targeting rules
 * @param {string} params.changedBy - Who is making the change
 * @returns {Promise<Object>} Created/updated policy
 */
export async function setPolicy({ flagKey, environment = 'production', rolloutPercentage = 100, userTargeting = {}, changedBy }) {
  const supabase = getSupabase();

  // Get flag ID
  const flag = await getFlag(flagKey);
  if (!flag) {
    throw new Error(`Flag '${flagKey}' not found`);
  }

  // Get existing policy for audit
  const existingPolicy = flag.leo_feature_flag_policies?.find(p => p.environment === environment);

  // Upsert policy
  const { data, error } = await supabase
    .from('leo_feature_flag_policies')
    .upsert({
      flag_id: flag.id,
      environment,
      rollout_percentage: rolloutPercentage,
      user_targeting: {
        allowlist: userTargeting.allowlist || { subject_ids: [] },
        blocklist: userTargeting.blocklist || { subject_ids: [] }
      }
    }, {
      onConflict: 'flag_id,environment'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set policy for '${flagKey}': ${error.message}`);
  }

  await logAudit({
    flagKey,
    action: existingPolicy ? 'policy_updated' : 'policy_created',
    previousState: existingPolicy || null,
    newState: data,
    changedBy,
    environment
  });

  return data;
}

/**
 * Get policy for a flag in a specific environment
 * @param {string} flagKey - Flag key
 * @param {string} environment - Target environment
 * @returns {Promise<Object|null>} Policy or null
 */
export async function getPolicy(flagKey, environment = 'production') {
  const flag = await getFlag(flagKey);
  if (!flag) return null;

  return flag.leo_feature_flag_policies?.find(p => p.environment === environment) || null;
}

// =============================================================================
// Kill Switch Operations
// =============================================================================

/**
 * Get kill switch status
 * @param {string} switchKey - Kill switch key (e.g., 'CONST-009')
 * @returns {Promise<Object|null>} Kill switch status
 */
export async function getKillSwitch(switchKey) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('leo_kill_switches')
    .select('*')
    .eq('switch_key', switchKey)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get kill switch '${switchKey}': ${error.message}`);
  }

  return data || null;
}

/**
 * Activate a kill switch (emergency use)
 * @param {string} switchKey - Kill switch key
 * @param {string} activatedBy - Who is activating
 * @returns {Promise<Object>} Updated kill switch
 */
export async function activateKillSwitch(switchKey, activatedBy) {
  const supabase = getSupabase();

  const killSwitch = await getKillSwitch(switchKey);
  if (!killSwitch) {
    throw new Error(`Kill switch '${switchKey}' not found`);
  }

  const { data, error } = await supabase
    .from('leo_kill_switches')
    .update({
      is_active: true,
      activated_at: new Date().toISOString(),
      activated_by: activatedBy,
      deactivated_at: null,
      deactivated_by: null
    })
    .eq('switch_key', switchKey)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to activate kill switch '${switchKey}': ${error.message}`);
  }

  await logAudit({
    flagKey: switchKey,
    action: 'kill_switch_activated',
    previousState: killSwitch,
    newState: data,
    changedBy: activatedBy
  });

  console.warn(`[KILL SWITCH] ${switchKey} ACTIVATED by ${activatedBy}`);

  return data;
}

/**
 * Deactivate a kill switch
 * @param {string} switchKey - Kill switch key
 * @param {string} deactivatedBy - Who is deactivating
 * @returns {Promise<Object>} Updated kill switch
 */
export async function deactivateKillSwitch(switchKey, deactivatedBy) {
  const supabase = getSupabase();

  const killSwitch = await getKillSwitch(switchKey);
  if (!killSwitch) {
    throw new Error(`Kill switch '${switchKey}' not found`);
  }

  const { data, error } = await supabase
    .from('leo_kill_switches')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: deactivatedBy
    })
    .eq('switch_key', switchKey)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to deactivate kill switch '${switchKey}': ${error.message}`);
  }

  await logAudit({
    flagKey: switchKey,
    action: 'kill_switch_deactivated',
    previousState: killSwitch,
    newState: data,
    changedBy: deactivatedBy
  });

  console.log(`[KILL SWITCH] ${switchKey} deactivated by ${deactivatedBy}`);

  return data;
}

/**
 * Check if the feature flag kill switch (CONST-009) is active
 * @returns {Promise<boolean>} True if kill switch is active
 */
export async function isFeatureFlagKillSwitchActive() {
  const killSwitch = await getKillSwitch('CONST-009');
  return killSwitch?.is_active === true;
}

// Default export for CommonJS compatibility
export default {
  createFlag,
  getFlag,
  listFlags,
  updateFlag,
  deleteFlag,
  setPolicy,
  getPolicy,
  getKillSwitch,
  activateKillSwitch,
  deactivateKillSwitch,
  isFeatureFlagKillSwitchActive,
  // Lifecycle governance (SD-LEO-SELF-IMPROVE-001K)
  transitionLifecycleState,
  requestApproval,
  approveTransition,
  setOwnership,
  setTemporary,
  getExpiredFlags,
  processExpiredFlags,
  VALID_TRANSITIONS,
  APPROVAL_REQUIREMENTS
};
