/**
 * Brainstorm Adapter — sources enhancements from brainstorm_sessions.
 * Consistent source_adapter_pattern interface.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getBrainstormEnhancements(fromStage, toStage) {
  const { data: sessions } = await supabase
    .from('brainstorm_sessions')
    .select('topic, outcome_type, key_decisions, created_at')
    .in('outcome_type', ['enhancement', 'feature', 'improvement'])
    .order('created_at', { ascending: false })
    .limit(10);

  return (sessions || []).map(s => ({
    title: `Brainstorm: ${s.topic}`,
    description: Array.isArray(s.key_decisions) ? s.key_decisions.slice(0, 2).join('; ') : '',
    relevance: 0.7,
    source_date: s.created_at
  }));
}
