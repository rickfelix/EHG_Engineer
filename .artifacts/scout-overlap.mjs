import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SUBJECT_ID = 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5';
const TERMS = ['security definer','alter default privileges','revoke','execute grant','anon','grant'];

function hits(txt) {
  const t = (txt || '').toLowerCase();
  return TERMS.filter(term => t.includes(term));
}

const out = {};

// ---- TASK 1: non-completed SDs
{
  const { data, error } = await s
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, created_at, description, scope')
    .not('status', 'in', '("completed","cancelled","archived")')
    .limit(2000);
  if (error) { out.task1_error = error.message; }
  else {
    const matches = data
      .filter(r => r.id !== SUBJECT_ID)
      .map(r => {
        const h = new Set([...hits(r.title), ...hits(r.description), ...hits(r.scope)]);
        return { r, h: [...h] };
      })
      .filter(x => x.h.length > 0)
      .map(({ r, h }) => ({
        sd_key: r.sd_key, id: r.id, title: r.title, status: r.status,
        phase: r.current_phase, created: (r.created_at || '').slice(0, 10),
        terms: h,
        desc_snip: (r.description || '').slice(0, 400).replace(/\s+/g, ' ')
      }));
    out.task1_total_noncompleted = data.length;
    out.task1_matches = matches;
  }
}

// ---- TASK 2: completed SDs since 2026-05-01
{
  const { data, error } = await s
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, created_at, completion_date, description, scope')
    .in('status', ['completed', 'archived'])
    .gte('created_at', '2026-05-01')
    .limit(3000);
  if (error) { out.task2_error = error.message; }
  else {
    const matches = data
      .filter(r => r.id !== SUBJECT_ID)
      .map(r => {
        const h = new Set([...hits(r.title), ...hits(r.description), ...hits(r.scope)]);
        return { r, h: [...h] };
      })
      .filter(x => x.h.length > 0)
      .map(({ r, h }) => ({
        sd_key: r.sd_key, title: r.title, status: r.status,
        created: (r.created_at || '').slice(0, 10),
        done: (r.completion_date || '').slice(0, 10),
        terms: h,
        desc_snip: (r.description || '').slice(0, 400).replace(/\s+/g, ' ')
      }));
    out.task2_total_completed_since_may = data.length;
    out.task2_matches = matches;
  }
}

// ---- TASK 3: quick_fixes
{
  const { data, error } = await s.from('quick_fixes').select('*').limit(2000);
  if (error) { out.task3_error = error.message; }
  else {
    out.task3_total = data.length;
    out.task3_columns = data[0] ? Object.keys(data[0]) : [];
    const matches = data
      .map(r => {
        const blob = JSON.stringify(r);
        return { r, h: hits(blob) };
      })
      .filter(x => x.h.length > 0)
      .map(({ r, h }) => ({
        key: r.qf_key || r.key || r.id,
        title: r.title,
        status: r.status,
        created: (r.created_at || '').slice(0, 10),
        terms: h,
        snip: (r.description || r.problem_statement || '').slice(0, 300).replace(/\s+/g, ' ')
      }));
    out.task3_matches = matches;
  }
}

// ---- TASK 5: sd_backlog_map
{
  const byUuid = await s.from('sd_backlog_map').select('*').eq('sd_id', SUBJECT_ID).limit(50);
  out.task5_by_uuid = byUuid.error ? { error: byUuid.error.message } : { count: byUuid.data.length, rows: byUuid.data.slice(0, 3) };

  // find the subject sd_key first
  const sub = await s.from('strategic_directives_v2').select('sd_key,title,status,current_phase,description,created_at').eq('id', SUBJECT_ID).maybeSingle();
  out.subject = sub.error ? { error: sub.error.message } : {
    sd_key: sub.data?.sd_key, title: sub.data?.title, status: sub.data?.status,
    phase: sub.data?.current_phase, created: (sub.data?.created_at||'').slice(0,10)
  };
  out.subject_desc = (sub.data?.description || '').slice(0, 1200).replace(/\s+/g, ' ');
  if (sub.data?.sd_key) {
    const byKey = await s.from('sd_backlog_map').select('*').eq('sd_id', sub.data.sd_key).limit(50);
    out.task5_by_sdkey = byKey.error ? { error: byKey.error.message } : { count: byKey.data.length, rows: byKey.data.slice(0, 3) };
  }
  // sample a row to learn the shape of sd_id
  const sample = await s.from('sd_backlog_map').select('*').limit(3);
  out.task5_sample_shape = sample.error ? { error: sample.error.message } : {
    columns: sample.data[0] ? Object.keys(sample.data[0]) : [],
    sample_sd_ids: sample.data.map(r => r.sd_id)
  };
}

console.log(JSON.stringify(out, null, 2));
