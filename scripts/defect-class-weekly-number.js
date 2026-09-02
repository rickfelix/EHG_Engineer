#!/usr/bin/env node
// SD-FDBK-INFRA-LOOP-REWARDS-CATCHES-001 FR-4: the weekly number = classes that recurred
// after a verified fix (never QFs/SDs minted). Reads v_defect_class_weekly_recurrence,
// optionally windowed to a week, and also surfaces the UNCLASSIFIED count so it is never
// silently dropped from the read (Risk mitigation in the PRD).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
dotenv.config();

function isMainModule() {
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

function getClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * @param {{ weekStart?: string, weekEnd?: string, supabase?: object }} opts
 * @returns {Promise<{ recurredClassCount: number, recurredClasses: object[], unclassifiedCount: number }>}
 */
export async function computeWeeklyNumber({ weekStart = null, weekEnd = null, supabase = null } = {}) {
  const client = supabase || getClient();

  let query = client.from('v_defect_class_weekly_recurrence').select('*');
  if (weekStart) query = query.gte('first_recurrence_at', weekStart);
  if (weekEnd) query = query.lt('first_recurrence_at', weekEnd);

  const { data: recurredClasses, error: recurErr } = await query;
  if (recurErr) throw recurErr;

  const { count: unclassifiedCount, error: unclassErr } = await client
    .from('defect_class_specimens')
    .select('id', { count: 'exact', head: true })
    .is('class_key', null);
  if (unclassErr) throw unclassErr;

  return {
    recurredClassCount: (recurredClasses || []).length,
    recurredClasses: recurredClasses || [],
    unclassifiedCount: unclassifiedCount ?? 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const result = await computeWeeklyNumber({
    weekStart: opt('week-start') || null,
    weekEnd: opt('week-end') || null,
  });
  console.log(`Weekly number (classes recurred after verified fix): ${result.recurredClassCount}`);
  console.log(`UNCLASSIFIED specimens (must be emptied by weekly review): ${result.unclassifiedCount}`);
  if (result.recurredClasses.length) {
    console.log(JSON.stringify(result.recurredClasses, null, 2));
  }
}

if (isMainModule()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
