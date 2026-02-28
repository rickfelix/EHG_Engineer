/**
 * Cross-Venture Capability Graph
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 *
 * Queries venture_capabilities to identify shared capabilities across
 * ventures and compute cross-venture reuse metrics.
 */

/**
 * Build a cross-venture capability graph showing which capabilities
 * are shared across multiple ventures.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{success: boolean, sharedCapabilities: Array, totalCapabilities: number, ventureCount: number, reuseScore: number}>}
 */
export async function buildCrossVentureGraph(supabase) {
  if (!supabase) {
    return { success: false, sharedCapabilities: [], totalCapabilities: 0, ventureCount: 0, reuseScore: 0 };
  }

  try {
    // Get all capabilities with their venture associations
    const { data: capabilities, error } = await supabase
      .from('venture_capabilities')
      .select('id, capability_key, capability_type, venture_id, maturity_level, status');

    if (error) {
      return { success: false, error: error.message, sharedCapabilities: [], totalCapabilities: 0, ventureCount: 0, reuseScore: 0 };
    }

    if (!capabilities || capabilities.length === 0) {
      return { success: true, sharedCapabilities: [], totalCapabilities: 0, ventureCount: 0, reuseScore: 0 };
    }

    // Group by capability_key to find shared capabilities
    const capabilityMap = new Map();
    const ventureSet = new Set();

    for (const cap of capabilities) {
      ventureSet.add(cap.venture_id);
      if (!capabilityMap.has(cap.capability_key)) {
        capabilityMap.set(cap.capability_key, []);
      }
      capabilityMap.get(cap.capability_key).push(cap);
    }

    // Identify capabilities shared across 2+ ventures
    const sharedCapabilities = [];
    for (const [key, instances] of capabilityMap) {
      const uniqueVentures = new Set(instances.map(i => i.venture_id));
      if (uniqueVentures.size >= 2) {
        sharedCapabilities.push({
          capability_key: key,
          capability_type: instances[0].capability_type,
          venture_count: uniqueVentures.size,
          venture_ids: [...uniqueVentures],
          instances: instances.map(i => ({
            venture_id: i.venture_id,
            maturity_level: i.maturity_level,
            status: i.status,
          })),
        });
      }
    }

    // Sort by venture_count descending (most shared first)
    sharedCapabilities.sort((a, b) => b.venture_count - a.venture_count);

    // Compute reuse score: ratio of shared capability instances to total
    const totalCapKeys = capabilityMap.size;
    const sharedCapKeys = sharedCapabilities.length;
    const reuseScore = totalCapKeys > 0 ? Math.round((sharedCapKeys / totalCapKeys) * 100) : 0;

    return {
      success: true,
      sharedCapabilities,
      totalCapabilities: totalCapKeys,
      ventureCount: ventureSet.size,
      reuseScore,
    };
  } catch (err) {
    return { success: false, error: err.message, sharedCapabilities: [], totalCapabilities: 0, ventureCount: 0, reuseScore: 0 };
  }
}

/**
 * Get the cross-venture graph summary for a specific capability.
 *
 * @param {string} capabilityKey - The capability key to look up
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{shared: boolean, ventureCount: number, ventures: Array}>}
 */
export async function getCapabilityVentures(capabilityKey, supabase) {
  if (!supabase) {
    return { shared: false, ventureCount: 0, ventures: [] };
  }

  const { data, error } = await supabase
    .from('venture_capabilities')
    .select('venture_id, maturity_level, status')
    .eq('capability_key', capabilityKey);

  if (error || !data) {
    return { shared: false, ventureCount: 0, ventures: [] };
  }

  const uniqueVentures = [...new Set(data.map(d => d.venture_id))];

  return {
    shared: uniqueVentures.length >= 2,
    ventureCount: uniqueVentures.length,
    ventures: data,
  };
}
