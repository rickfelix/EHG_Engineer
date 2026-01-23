/**
 * GET /api/aegis/constitutions
 * SD-AEGIS-GOVERNANCE-001: AEGIS Constitutions API
 *
 * Retrieve governance constitutions
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  const { domain, enforcement_mode, is_active } = req.query;

  try {
    let query = supabase
      .from('aegis_constitutions')
      .select(`
        id,
        code,
        name,
        description,
        domain,
        enforcement_mode,
        version,
        is_active,
        created_at,
        updated_at
      `)
      .order('code', { ascending: true });

    if (domain && typeof domain === 'string') {
      query = query.eq('domain', domain);
    }

    if (enforcement_mode && typeof enforcement_mode === 'string') {
      query = query.eq('enforcement_mode', enforcement_mode);
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    } else {
      // Default to active constitutions only
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch AEGIS constitutions:', error);
      return res.status(500).json({
        error: 'Failed to fetch constitutions',
        message: error.message
      });
    }

    // Get rule counts for each constitution
    const { data: rules, error: rulesError } = await supabase
      .from('aegis_rules')
      .select('constitution_id, severity')
      .eq('is_active', true);

    const rulesByConstitution: Record<string, { total: number; critical: number }> = {};
    if (!rulesError && rules) {
      rules.forEach(r => {
        if (!rulesByConstitution[r.constitution_id]) {
          rulesByConstitution[r.constitution_id] = { total: 0, critical: 0 };
        }
        rulesByConstitution[r.constitution_id].total++;
        if (r.severity === 'CRITICAL') {
          rulesByConstitution[r.constitution_id].critical++;
        }
      });
    }

    // Enrich with rule counts
    const enriched = (data || []).map(c => ({
      ...c,
      rules: rulesByConstitution[c.id]?.total || 0,
      critical_rules: rulesByConstitution[c.id]?.critical || 0
    }));

    // Group by domain
    const byDomain: Record<string, typeof enriched> = {};
    enriched.forEach(c => {
      if (!byDomain[c.domain]) {
        byDomain[c.domain] = [];
      }
      byDomain[c.domain].push(c);
    });

    return res.status(200).json({
      constitutions: enriched,
      byDomain,
      total: enriched.length,
      totalRules: rules?.length || 0,
      domains: [...new Set(enriched.map(c => c.domain))]
    });

  } catch (error) {
    console.error('AEGIS constitutions error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
