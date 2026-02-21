#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolveOwnSession } from '../lib/resolve-own-session.js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSession() {
  const { data } = await resolveOwnSession(supabase, {
    select: 'metadata',
    warnOnFallback: false
  });

  if (data && data.metadata && data.metadata.auto_proceed !== undefined) {
    console.log('SESSION_AUTO_PROCEED=' + data.metadata.auto_proceed);
  } else {
    console.log('SESSION_NEW=true');
  }
}

checkSession();
