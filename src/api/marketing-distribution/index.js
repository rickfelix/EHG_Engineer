/**
 * Marketing Content Distribution API
 * SD-MARKETING-AUTOMATION-001
 *
 * Endpoints:
 *   GET  /api/v2/marketing/queue/:venture_id - Get content review queue
 *   POST /api/v2/marketing/queue - Add content to queue
 *   PUT  /api/v2/marketing/queue/:id/review - Approve/reject content
 *   POST /api/v2/marketing/distribute/:id - Mark as distributed
 *   GET  /api/v2/marketing/history/:venture_id - Get distribution history
 *   GET  /api/v2/marketing/channels - Get available channels
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Validation schemas
const addToQueueSchema = z.object({
  venture_id: z.string().uuid(),
  content_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  content_body: z.string().min(1),
  content_type: z.string().optional(),
  target_channels: z.array(z.string().uuid()).optional(),
  utm_campaign: z.string().optional(),
  scheduled_for: z.string().datetime().optional()
});

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional()
});

const distributeSchema = z.object({
  channel_id: z.string().uuid(),
  platform: z.string(),
  posted_at: z.string().datetime().optional()
});

/**
 * Get content review queue for a venture
 * GET /api/v2/marketing/queue/:venture_id
 */
export async function getQueue(req, res) {
  try {
    const { venture_id } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    if (!venture_id) {
      return res.status(400).json({ error: 'venture_id required' });
    }

    let query = supabase
      .from('marketing_content_queue')
      .select(`
        *,
        reviewed_by_user:reviewed_by(email),
        channels:target_channels
      `)
      .eq('venture_id', venture_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: queue, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Get queue summary
    const { data: summary } = await supabase.rpc('get_content_queue_summary', {
      p_venture_id: venture_id
    });

    return res.status(200).json({
      queue: queue || [],
      summary: summary || {},
      count: queue?.length || 0
    });

  } catch (error) {
    console.error('Get queue error:', error);
    return res.status(500).json({ error: 'Failed to fetch queue' });
  }
}

/**
 * Add content to review queue
 * POST /api/v2/marketing/queue
 */
export async function addToQueue(req, res) {
  try {
    const data = addToQueueSchema.parse(req.body);

    const queueItem = {
      id: uuidv4(),
      venture_id: data.venture_id,
      content_id: data.content_id || null,
      title: data.title,
      content_body: data.content_body,
      content_type: data.content_type || 'general',
      target_channels: data.target_channels || [],
      utm_campaign: data.utm_campaign,
      scheduled_for: data.scheduled_for ? new Date(data.scheduled_for) : null,
      status: 'pending_review',
      created_at: new Date().toISOString()
    };

    const { data: inserted, error } = await supabase
      .from('marketing_content_queue')
      .insert(queueItem)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({
      success: true,
      queue_item: inserted
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }
    console.error('Add to queue error:', error);
    return res.status(500).json({ error: 'Failed to add to queue' });
  }
}

/**
 * Review content (approve/reject)
 * PUT /api/v2/marketing/queue/:id/review
 */
export async function reviewContent(req, res) {
  try {
    const { id } = req.params;
    const data = reviewSchema.parse(req.body);
    const userId = req.user?.id || null; // From auth middleware

    if (!id) {
      return res.status(400).json({ error: 'Queue item ID required' });
    }

    const newStatus = data.action === 'approve' ? 'approved' : 'rejected';

    const { data: updated, error } = await supabase
      .from('marketing_content_queue')
      .update({
        status: newStatus,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!updated) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    return res.status(200).json({
      success: true,
      action: data.action,
      queue_item: updated
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }
    console.error('Review content error:', error);
    return res.status(500).json({ error: 'Failed to review content' });
  }
}

/**
 * Mark content as distributed
 * POST /api/v2/marketing/distribute/:id
 */
export async function distributeContent(req, res) {
  try {
    const { id } = req.params;
    const data = distributeSchema.parse(req.body);
    const userId = req.user?.id || null;

    if (!id) {
      return res.status(400).json({ error: 'Queue item ID required' });
    }

    // Get queue item
    const { data: queueItem, error: qError } = await supabase
      .from('marketing_content_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (qError || !queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    // Generate UTM params
    const { data: utmParams } = await supabase.rpc('generate_utm_params', {
      p_venture_id: queueItem.venture_id,
      p_channel_id: data.channel_id,
      p_campaign: queueItem.utm_campaign
    });

    // Create distribution history record
    const historyRecord = {
      id: uuidv4(),
      venture_id: queueItem.venture_id,
      queue_item_id: id,
      channel_id: data.channel_id,
      content_title: queueItem.title,
      content_snippet: queueItem.content_body.substring(0, 200),
      platform: data.platform,
      status: 'posted',
      utm_source: utmParams?.utm_source || 'direct',
      utm_medium: utmParams?.utm_medium || 'social',
      utm_campaign: utmParams?.utm_campaign || queueItem.utm_campaign,
      utm_content: utmParams?.utm_content,
      posted_at: data.posted_at || new Date().toISOString(),
      posted_by: userId,
      created_at: new Date().toISOString()
    };

    const { data: history, error: hError } = await supabase
      .from('distribution_history')
      .insert(historyRecord)
      .select()
      .single();

    if (hError) {
      return res.status(500).json({ error: hError.message });
    }

    // Update queue item status
    await supabase
      .from('marketing_content_queue')
      .update({
        status: 'posted',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    return res.status(200).json({
      success: true,
      distribution: history,
      utm_params: utmParams
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }
    console.error('Distribute content error:', error);
    return res.status(500).json({ error: 'Failed to distribute content' });
  }
}

/**
 * Get distribution history for a venture
 * GET /api/v2/marketing/history/:venture_id
 */
export async function getHistory(req, res) {
  try {
    const { venture_id } = req.params;
    const { platform, limit = 50, offset = 0, start_date, end_date } = req.query;

    if (!venture_id) {
      return res.status(400).json({ error: 'venture_id required' });
    }

    let query = supabase
      .from('distribution_history')
      .select(`
        *,
        channel:channel_id(name, platform)
      `)
      .eq('venture_id', venture_id)
      .order('posted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (platform) {
      query = query.eq('platform', platform);
    }

    if (start_date) {
      query = query.gte('posted_at', start_date);
    }

    if (end_date) {
      query = query.lte('posted_at', end_date);
    }

    const { data: history, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Calculate summary stats
    const stats = {
      total_distributions: history?.length || 0,
      total_clicks: history?.reduce((sum, h) => sum + (h.clicks || 0), 0) || 0,
      platforms: [...new Set(history?.map(h => h.platform) || [])]
    };

    return res.status(200).json({
      history: history || [],
      stats,
      count: history?.length || 0
    });

  } catch (error) {
    console.error('Get history error:', error);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
}

/**
 * Get available distribution channels
 * GET /api/v2/marketing/channels
 */
export async function getChannels(_req, res) {
  try {
    const { data: channels, error } = await supabase
      .from('distribution_channels')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      channels: channels || [],
      count: channels?.length || 0
    });

  } catch (error) {
    console.error('Get channels error:', error);
    return res.status(500).json({ error: 'Failed to fetch channels' });
  }
}

export default {
  getQueue,
  addToQueue,
  reviewContent,
  distributeContent,
  getHistory,
  getChannels
};
