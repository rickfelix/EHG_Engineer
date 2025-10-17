#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSDUUID(sdKey) {
  try {
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status')
      .order('created_at', { ascending: false });

    if (sdKey && sdKey !== 'list') {
      query = query.eq('sd_key', sdKey);
    }

    if (sdKey === 'list') {
      query = query.limit(10);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.error(`No SD found with key: ${sdKey}`);
      process.exit(1);
    }

    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Exception:', err.message);
    process.exit(1);
  }
}

const sdKey = process.argv[2] || 'list';
getSDUUID(sdKey);
