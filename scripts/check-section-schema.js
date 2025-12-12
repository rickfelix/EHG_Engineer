#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase
    .from('leo_protocol_sections')
    .select('context_tier, section_type')
    .limit(10);

  if (data && data.length > 0) {
    const uniqueTiers = [...new Set(data.map(r => r.context_tier))];
    const uniqueTypes = [...new Set(data.map(r => r.section_type))];
    console.log('context_tier values:', uniqueTiers);
    console.log('section_type values:', uniqueTypes);
  }
  if (error) {
    console.log('Error:', error.message);
  }
}

check();
