/**
 * GET /api/aegis/rules
 * SD-AEGIS-GOVERNANCE-001: AEGIS Rules API
 *
 * Retrieve governance rules with filters
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

  const { constitution, category, severity, is_active } = req.query;

  try {
    let query = supabase
      .from('aegis_rules')
      .select(`
        id,
        rule_code,
        rule_name,
        rule_text,
        category,
        severity,
        enforcement_action,
        validation_type,
        validation_config,
        is_active,
        created_at,
        constitution:aegis_constitutions(id, code, name, domain, enforcement_mode)
      `)
      .order('severity', { ascending: true })
      .order('rule_code', { ascending: true });

    // Filter by constitution code
    if (constitution && typeof constitution === 'string') {
      const { data: constData } = await supabase
        .from('aegis_constitutions')
        .select('id')
        .eq('code', constitution)
        .single();

      if (constData) {
        query = query.eq('constitution_id', constData.id);
      } else {
        return res.status(404).json({
          error: 'Constitution not found',
          constitution
        });
      }
    }

    if (category && typeof category === 'string') {
      query = query.eq('category', category);
    }

    if (severity && typeof severity === 'string') {
      query = query.eq('severity', severity.toUpperCase());
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    } else {
      // Default to active rules only
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch AEGIS rules:', error);
      return res.status(500).json({
        error: 'Failed to fetch rules',
        message: error.message
      });
    }

    // Group by constitution for UI consumption
    const byConstitution: Record<string, typeof data> = {};
    (data || []).forEach(rule => {
      const code = (rule.constitution as { code: string })?.code || 'UNKNOWN';
      if (!byConstitution[code]) {
        byConstitution[code] = [];
      }
      byConstitution[code].push(rule);
    });

    // Count by severity
    const bySeverity: Record<string, number> = {};
    (data || []).forEach(rule => {
      bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
    });

    return res.status(200).json({
      rules: data || [],
      byConstitution,
      bySeverity,
      total: data?.length || 0,
      activeCount: data?.filter(r => r.is_active).length || 0
    });

  } catch (error) {
    console.error('AEGIS rules error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
