/**
 * Story API Endpoints
 * Handles story generation, listing, and verification
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Schema validation
const GenerateSchema = z.object({
  sd_key: z.string().optional(),
  sd_id: z.string().optional(),
  prd_id: z.string(),
  mode: z.enum(['dry_run', 'create', 'upsert']).default('upsert')
}).refine(data => data.sd_key || data.sd_id, {
  message: "Either sd_key or sd_id must be provided"
});

const ListSchema = z.object({
  sd_key: z.string().min(1),
  status: z.enum(['passing', 'failing', 'not_run']).optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0)
});

const VerifySchema = z.object({
  story_keys: z.array(z.string().min(8)).min(1),
  test_run_id: z.string().min(1),
  build_id: z.string().min(1),
  status: z.enum(['passing', 'failing', 'not_run']),
  coverage_pct: z.number().min(0).max(100).optional(),
  artifacts: z.array(z.string()).optional()
});

// Generate stories endpoint
export async function generate(req, res) {
  // Check feature flag
  if (process.env.FEATURE_AUTO_STORIES !== 'true') {
    return res.status(403).json({
      error: 'Feature disabled',
      flag: 'FEATURE_AUTO_STORIES'
    });
  }

  try {
    const data = GenerateSchema.parse(req.body);
    const sdIdentifier = data.sd_key || data.sd_id;

    // Call stored function
    const { data: result, error } = await supabase.rpc(
      'fn_generate_stories_from_prd',
      {
        p_sd_key: sdIdentifier,
        p_prd_id: data.prd_id,
        p_mode: data.mode
      }
    );

    if (error) {
      console.error('Story generation error:', error);
      return res.status(400).json({ error: error.message });
    }

    // Audit log (optional, table may not exist)
    try {
      await supabase.from('story_audit_log').insert({
        operation: 'generate',
        sd_key: sdIdentifier,
        user_id: req.user?.id || 'api',
        payload: data,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      // Audit log table might not exist, continue
    }

    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: error.message
    });
  }
}

// List stories endpoint
export async function list(req, res) {
  try {
    const params = ListSchema.parse(req.query);

    let query = supabase
      .from('v_story_verification_status')
      .select('*')
      .eq('sd_key', params.sd_key)
      .order('sequence_no', { ascending: true })
      .range(params.offset, params.offset + params.limit - 1);

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Story list error:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({
      stories: data || [],
      total: data?.length || 0,
      page: Math.floor(params.offset / params.limit) + 1,
      limit: params.limit,
      offset: params.offset
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: error.message
    });
  }
}

// Verify stories endpoint (webhook from CI)
export async function verify(req, res) {
  try {
    const data = VerifySchema.parse(req.body);

    // Enforce single SD constraint
    const sdKeys = new Set(data.story_keys.map(k => k.split(':')[0]));
    if (sdKeys.size !== 1) {
      return res.status(400).json({
        error: 'Cross-SD updates not allowed',
        sd_keys: Array.from(sdKeys)
      });
    }

    // Update each story
    const updates = [];
    for (const storyKey of data.story_keys) {
      const update = supabase
        .from('sd_backlog_map')
        .update({
          verification_status: data.status,
          last_verified_at: new Date().toISOString(),
          coverage_pct: data.coverage_pct || 0,
          verification_source: {
            test_run_id: data.test_run_id,
            build_id: data.build_id,
            artifacts: data.artifacts || [],
            timestamp: new Date().toISOString()
          }
        })
        .eq('story_key', storyKey);

      updates.push(update);
    }

    // Execute all updates
    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      console.error('Verification errors:', errors);
      return res.status(400).json({
        error: 'Some updates failed',
        details: errors.map(e => e.error)
      });
    }

    // Audit log
    try {
      await supabase.from('story_audit_log').insert({
        operation: 'verify',
        sd_key: Array.from(sdKeys)[0],
        user_id: 'ci',
        payload: data,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      // Audit log table might not exist, continue
    }

    return res.json({
      status: 'success',
      updated: data.story_keys.length,
      build_id: data.build_id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: error.message
    });
  }
}

// Get release gate status
export async function releaseGate(req, res) {
  try {
    const { sd_key } = req.query;

    if (!sd_key) {
      return res.status(400).json({ error: 'sd_key required' });
    }

    const { data, error } = await supabase
      .from('v_sd_release_gate')
      .select('*')
      .eq('sd_key', sd_key)
      .single();

    if (error) {
      console.error('Release gate error:', error);
      return res.status(400).json({ error: error.message });
    }

    return res.json(data || {
      ready: true,
      total_stories: 0,
      passing_count: 0,
      failing_count: 0,
      not_run_count: 0,
      passing_pct: 100
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}

// Health check endpoint
export async function health(req, res) {
  try {
    const flags = {
      FEATURE_AUTO_STORIES: process.env.FEATURE_AUTO_STORIES === 'true',
      FEATURE_STORY_AGENT: process.env.FEATURE_STORY_AGENT === 'true',
      FEATURE_STORY_UI: process.env.FEATURE_STORY_UI === 'true',
      FEATURE_STORY_GATES: process.env.FEATURE_STORY_GATES === 'true'
    };

    // Check if views are accessible
    let viewsOk = false;
    try {
      const { error: storyError } = await supabase
        .from('v_story_verification_status')
        .select('story_key')
        .limit(1);

      const { error: gateError } = await supabase
        .from('v_sd_release_gate')
        .select('sd_key')
        .limit(1);

      viewsOk = !storyError && !gateError;
    } catch (e) {
      viewsOk = false;
    }

    return res.json({
      status: 'healthy',
      flags,
      views_ok: viewsOk,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
}