/**
 * Todoist Adapter — sources enhancements from eva_todoist_intake.
 * Consistent source_adapter_pattern interface.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getTodoistEnhancements(fromStage, toStage) {
  const { data: tasks } = await supabase
    .from('eva_todoist_intake')
    .select('task_content, priority, labels, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return (tasks || []).map(t => ({
    title: `Todoist: ${t.task_content}`,
    description: Array.isArray(t.labels) ? t.labels.join(', ') : '',
    relevance: t.priority ? (5 - t.priority) / 4 : 0.5,
    source_date: t.created_at
  }));
}
