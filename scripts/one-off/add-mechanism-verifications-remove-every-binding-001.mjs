import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-REMOVE-EVERY-BINDING-001';

const mechanism_verifications = [
  {
    verified_by: 'Alpha-2 (LEAD-phase Explore investigation, sub_agent_execution_results 46e8b56c)',
    verified_at: 'lib/agents/venture-ceo-factory.js:49-64',
    note: 'CEO role definition -- delegation_authority carries can_advance_stage:true and requires_advisory_approval:[13,14,15,16] verbatim, read directly from the live file.',
  },
  {
    verified_by: 'Alpha-2 (LEAD-phase Explore investigation, sub_agent_execution_results 46e8b56c)',
    verified_at: 'lib/agents/venture-ceo-factory.js:76-86',
    note: 'VP_PRODUCT role definition -- stage_ownership:[10,11,12] and post_stage_mandate embedding "past S12" verified verbatim, read directly from the live file.',
  },
  {
    verified_by: 'Alpha-2 (LEAD-phase Explore investigation, sub_agent_execution_results 46e8b56c)',
    verified_at: 'lib/agents/venture-ceo-factory.js:364,604-618',
    note: 'CEO delegation_authority (including can_advance_stage/requires_advisory_approval) is persisted verbatim into agent_registry.delegation_authority on every venture instantiation -- verified by direct code read of the insert path.',
  },
  {
    verified_by: 'Alpha-2 (LEAD-phase Explore investigation, sub_agent_execution_results 46e8b56c)',
    verified_at: 'lib/org/role-registry-resolver.mjs:29,47-49',
    note: 'ROLE_FIELD_KEYS lists stage_ownership and splitRoleLayers() routes it into the structure layer -- verified by direct code read; confirmed zero live callers of this module anywhere in the repo via grep.',
  },
  {
    verified_by: 'Alpha-2 (LEAD-phase Explore investigation, sub_agent_execution_results 46e8b56c)',
    verified_at: 'lib/org/factory-identity-fold.cjs:101-106',
    note: 'recordIdentityForAgent() builds context_profile from exactly 4 fields (agent_registry_id, agent_type, hierarchy_path, capabilities) -- stage_ownership/can_advance_stage/requires_advisory_approval are never copied into it, verified by direct code read.',
  },
];

const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
if (error) throw new Error(error.message);

const metadata = { ...sd.metadata, mechanism_verifications };
const { error: updErr } = await supabase.from('strategic_directives_v2').update({ metadata }).eq('id', sd.id);
if (updErr) throw new Error(updErr.message);
console.log('mechanism_verifications added:', mechanism_verifications.length);
