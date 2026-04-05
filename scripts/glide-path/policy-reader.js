import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Returns the currently active policy row.
 * @param {string} [policyKey='glide-path'] - The policy key to look up.
 * @returns {Promise<object>} The active policy row.
 * @throws If no active policy exists.
 */
export async function getActivePolicy(policyKey = 'glide-path') {
  const { data, error } = await supabase
    .from('portfolio_allocation_policies')
    .select('*')
    .eq('policy_key', policyKey)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error(`No active policy found for key "${policyKey}": ${error?.message || 'not found'}`);
  }
  return data;
}

/**
 * Returns a specific policy version.
 * @param {string} policyKey
 * @param {number} version
 * @returns {Promise<object>}
 */
export async function getPolicyVersion(policyKey, version) {
  const { data, error } = await supabase
    .from('portfolio_allocation_policies')
    .select('*')
    .eq('policy_key', policyKey)
    .eq('policy_version', version)
    .single();

  if (error || !data) {
    throw new Error(`Policy "${policyKey}" v${version} not found: ${error?.message || 'not found'}`);
  }
  return data;
}
