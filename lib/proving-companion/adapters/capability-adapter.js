/**
 * Capability Adapter — sources enhancements from sd_capabilities.
 * Consistent source_adapter_pattern interface.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getCapabilityEnhancements(fromStage, toStage) {
  const { data: capabilities } = await supabase
    .from('sd_capabilities')
    .select('capability_key, name, capability_type, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return (capabilities || []).map(c => ({
    title: `Capability: ${c.name || c.capability_key}`,
    description: `Type: ${c.capability_type}`,
    relevance: 0.6,
    source_date: c.created_at
  }));
}
