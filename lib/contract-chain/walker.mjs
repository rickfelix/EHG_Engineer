// lib/contract-chain/walker.mjs
// Sibling D FR-D-3: contract-chain walker (D-app week 8 cohort, feature-flag-gated).
// Walks from any entity (sd/prd/handoff/user_story) back to root SD via contract_chain_links.
// Uses Sibling B vocab-version-validator for (schema_version, vocabulary_version) tuple validation.

import { validateVocabTuple } from '../../scripts/lib/vocab-version-validator.mjs';

const MAX_DEPTH = 20;

async function getFeatureFlag(supabase) {
  if (!supabase) return false;
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'contract_chain_d_app_enabled')
    .maybeSingle();
  const v = data?.value;
  if (v && typeof v === 'object') return v.enabled === true;
  if (typeof v === 'string') {
    try { return JSON.parse(v).enabled === true; } catch { return false; }
  }
  return false;
}

export async function walkContractChain({ entityType, entityId, supabase, options = {} }) {
  const flagOn = await getFeatureFlag(supabase);
  if (!flagOn) {
    return { chain: [], complete: null, missing_links: [], gated_off: true };
  }

  const chain = [];
  const missing_links = [];
  let currentType = entityType;
  let currentId = entityId;
  let depth = 0;

  while (currentId && depth < MAX_DEPTH) {
    const { data: link, error } = await supabase
      .from('contract_chain_links')
      .select('id, parent_contract_type, parent_contract_id, child_contract_type, child_contract_id, link_status, schema_version, vocabulary_version')
      .eq('child_contract_type', currentType)
      .eq('child_contract_id', currentId)
      .eq('link_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !link) {
      if (depth === 0) missing_links.push({ type: currentType, id: currentId, reason: 'no_link_to_parent' });
      break;
    }

    const tuple = validateVocabTuple({
      schema_version: link.schema_version,
      vocabulary_version: link.vocabulary_version,
      vocab: { terms: [{ term: 'placeholder', added_at: '2020-01-01T00:00:00Z' }] },
    });
    if (tuple.verdict === 'CONTRACT_MALFORMED') {
      missing_links.push({ link_id: link.id, reason: 'malformed_tuple', detail: tuple.reason });
    }

    chain.push({
      link_id: link.id,
      parent_type: link.parent_contract_type,
      parent_id: link.parent_contract_id,
      child_type: link.child_contract_type,
      child_id: link.child_contract_id,
    });

    currentType = link.parent_contract_type;
    currentId = link.parent_contract_id;
    depth++;
  }

  const complete = chain.length > 0 && missing_links.length === 0 && currentType === 'sd';
  return { chain, complete, missing_links };
}
