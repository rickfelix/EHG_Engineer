#!/usr/bin/env node
// Sibling F LEAD-FINAL parent unblock signal (FR-F-5).
// Writes app_config.child_f_completed.signal_at=now() to signal parent PLAN-TO-LEAD readiness.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const signal = {
  signal_at: new Date().toISOString(),
  sd_key: 'SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-F',
  status: 'completed',
};

const { error, data } = await supabase
  .from('app_config')
  .update({ value: signal })
  .eq('key', 'child_f_completed')
  .select('key, value')
  .single();
if (error) { console.error(error); process.exit(1); }
console.log('Parent unblock signal written:', data);
