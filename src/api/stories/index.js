import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Feature flags (default OFF)
const FEATURE_FLAGS = {
  FEATURE_AUTO_STORIES: process.env.FEATURE_AUTO_STORIES === 'true',
  FEATURE_STORY_AGENT: process.env.FEATURE_STORY_AGENT === 'true',
  FEATURE_STORY_UI: process.env.FEATURE_STORY_UI === 'true',
  FEATURE_STORY_GATES: process.env.FEATURE_STORY_GATES === 'true'
};

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Rate limit exceeded'
});

// Schema validation - accept either sd_key or sd_id
const generateSchema = z.object({
  sd_key: z.string().optional(),  // Can be SD-YYYY-MM-XXX format or UUID
  sd_id: z.string().optional(),   // Direct SD ID
  prd_id: z.string(),  // Can be UUID or string ID
  mode: z.enum(['dry_run', 'create', 'upsert']).default('create')
}).refine(data => data.sd_key || data.sd_id, {
  message: "Either sd_key or sd_id must be provided"
});

const verifySchema = z.object({
  story_keys: z.array(z.string()).min(1),
  test_run_id: z.string(),
  build_id: z.string(),
  status: z.enum(['passing', 'failing', 'not_run']),
  coverage_pct: z.number().min(0).max(100).optional(),
  artifacts: z.array(z.string()).optional()
});

// POST /api/stories/generate
export async function generateStories(req, res) {
  if (!FEATURE_FLAGS.FEATURE_AUTO_STORIES) {
    return res.status(403).json({
      error: 'Feature disabled',
      flag: 'FEATURE_AUTO_STORIES'
    });
  }

  try {
    const data = generateSchema.parse(req.body);

    // Use either sd_key or sd_id
    const sdIdentifier = data.sd_key || data.sd_id;

    // Call stored function (it handles both formats)
    const { data: result, error } = await supabase.rpc(
      'fn_generate_stories_from_prd',
      {
        p_sd_key: sdIdentifier,
        p_prd_id: data.prd_id,
        p_mode: data.mode
      }
    );

    if (error) throw error;

    // Audit log (if table exists)
    try {
      await supabase.from('story_audit_log').insert({
        operation: 'generate',
        sd_key: sdIdentifier,
        user_id: req.user?.id || 'api',
        payload: data
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

// GET /api/stories
export async function listStories(req, res) {
  const { sd_key, status, limit = 20, offset = 0 } = req.query;

  let query = supabase
    .from('v_story_verification_status')
    .select('*');

  if (sd_key) query = query.eq('sd_key', sd_key);
  if (status) query = query.eq('status', status);

  query = query
    .order('sequence_no', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({
    stories: data,
    total: count,
    page: Math.floor(offset / limit) + 1
  });
}

// POST /api/stories/verify
export async function verifyStories(req, res) {
  try {
    const data = verifySchema.parse(req.body);

    // Validate single SD
    const sdKeys = new Set();
    for (const key of data.story_keys) {
      const [sdKey] = key.split(':');
      sdKeys.add(sdKey);
    }

    if (sdKeys.size > 1) {
      return res.status(400).json({
        error: 'Cross-SD updates not allowed',
        sd_keys: Array.from(sdKeys)
      });
    }

    const sdKey = Array.from(sdKeys)[0];

    // Update verification status
    const updates = [];
    for (const storyKey of data.story_keys) {
      const [sd, backlogId] = storyKey.split(':');

      const { error } = await supabase
        .from('sd_backlog_map')
        .update({
          verification_status: data.status,
          verification_source: {
            test_run_id: data.test_run_id,
            build_id: data.build_id,
            coverage_pct: data.coverage_pct,
            artifacts: data.artifacts || []
          },
          last_verified_at: new Date().toISOString()
        })
        .eq('sd_id', sd)
        .eq('backlog_id', backlogId);

      if (!error) updates.push(storyKey);
    }

    // Audit log
    await supabase.from('story_audit_log').insert({
      operation: 'verify',
      sd_key: sdKey,
      story_key: data.story_keys.join(','),
      user_id: req.user?.id || 'ci-system',
      payload: data
    });

    return res.json({
      status: 'success',
      updated: updates.length,
      story_keys: updates
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

// Apply rate limiting
export default {
  generateStories: [limiter, generateStories],
  listStories,
  verifyStories: [limiter, verifyStories]
};