#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function setSession() {
  const autoProceed = process.argv[2] === 'true';
  const sessionId = 'session_' + Date.now();

  const { error } = await supabase
    .from('claude_sessions')
    .upsert({
      session_id: sessionId,
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      metadata: { auto_proceed: autoProceed }
    }, { onConflict: 'session_id' });

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Session preference saved: auto_proceed=' + autoProceed);
  }
}

setSession();
