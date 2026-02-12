#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSession() {
  const { data, _error } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .single();

  if (data && data.metadata && data.metadata.auto_proceed !== undefined) {
    console.log('SESSION_AUTO_PROCEED=' + data.metadata.auto_proceed);
  } else {
    console.log('SESSION_NEW=true');
  }
}

checkSession();
