/**
 * PRD Requirement Extractor
 *
 * Reads product_requirements_v2.functional_requirements JSONB for a given SD.
 * Returns structured array of requirements or error state.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Extract functional requirements from PRD for an SD.
 * @param {string} sdKey - The SD key to look up
 * @returns {Promise<{requirements: Array, error: string|null, partial: boolean, prd_id: string|null}>}
 */
export async function extractRequirements(sdKey) {
  const sb = getSupabase();

  try {
    // Find PRD for this SD
    const { data: prd, error: prdError } = await sb
      .from('product_requirements_v2')
      .select('id, functional_requirements, status')
      .eq('sd_id', sdKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (prdError || !prd) {
      return { requirements: [], error: 'PRD_NOT_FOUND', partial: false, prd_id: null };
    }

    const rawReqs = prd.functional_requirements;

    if (!rawReqs) {
      return { requirements: [], error: 'PRD_NOT_FOUND', partial: false, prd_id: prd.id };
    }

    // Parse requirements - handle both array and object formats
    let reqArray;
    if (Array.isArray(rawReqs)) {
      reqArray = rawReqs;
    } else if (typeof rawReqs === 'object' && rawReqs !== null) {
      // Some PRDs store requirements as an object with keys
      reqArray = Object.values(rawReqs);
    } else if (typeof rawReqs === 'string') {
      try {
        reqArray = JSON.parse(rawReqs);
      } catch {
        return { requirements: [], error: 'PARSE_ERROR', partial: false, prd_id: prd.id };
      }
    } else {
      return { requirements: [], error: 'PARSE_ERROR', partial: false, prd_id: prd.id };
    }

    if (!Array.isArray(reqArray)) {
      return { requirements: [], error: 'PARSE_ERROR', partial: false, prd_id: prd.id };
    }

    // Normalize each requirement
    const requirements = [];
    let hasParseErrors = false;

    for (const req of reqArray) {
      if (!req || typeof req !== 'object') {
        hasParseErrors = true;
        continue;
      }

      requirements.push({
        id: req.id || req.requirement_id || req.fr_id || `FR-${requirements.length + 1}`,
        requirement: req.requirement || req.title || req.name || '',
        description: req.description || req.details || '',
        priority: normalizePriority(req.priority),
        acceptance_criteria: req.acceptance_criteria || req.criteria || []
      });
    }

    return {
      requirements,
      error: hasParseErrors ? 'PARTIAL_PARSE' : null,
      partial: hasParseErrors,
      prd_id: prd.id,
      prd_status: prd.status
    };
  } catch (err) {
    return { requirements: [], error: 'PARSE_ERROR', partial: false, prd_id: null, message: err.message };
  }
}

function normalizePriority(p) {
  if (!p) return 'MEDIUM';
  const upper = String(p).toUpperCase();
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(upper)) return upper;
  if (upper === 'P0' || upper === 'MUST') return 'CRITICAL';
  if (upper === 'P1' || upper === 'SHOULD') return 'HIGH';
  if (upper === 'P2' || upper === 'COULD') return 'MEDIUM';
  return 'MEDIUM';
}
