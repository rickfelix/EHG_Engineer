/**
 * YouTube Adapter — sources enhancements from eva_youtube_scores.
 * Consistent source_adapter_pattern interface.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getYouTubeEnhancements(fromStage, toStage) {
  const { data: videos } = await supabase
    .from('eva_youtube_scores')
    .select('video_title, relevance_score, key_insights, created_at')
    .gte('relevance_score', 0.5)
    .order('relevance_score', { ascending: false })
    .limit(10);

  return (videos || []).map(v => ({
    title: `YouTube insight: ${v.video_title}`,
    description: Array.isArray(v.key_insights) ? v.key_insights.slice(0, 2).join('; ') : '',
    relevance: v.relevance_score,
    source_date: v.created_at
  }));
}
