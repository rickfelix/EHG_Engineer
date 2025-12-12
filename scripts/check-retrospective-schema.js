#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  // Get sample retrospective to see valid values
  const { data, error } = await supabase
    .from('retrospectives')
    .select('generated_by, retro_type, trigger_event, learning_category')
    .limit(10);

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Sample values:');
    const uniqueGenerated = [...new Set(data.map(r => r.generated_by))];
    const uniqueRetro = [...new Set(data.map(r => r.retro_type))];
    const uniqueTrigger = [...new Set(data.map(r => r.trigger_event))];
    const uniqueCategory = [...new Set(data.map(r => r.learning_category))];
    console.log('generated_by:', uniqueGenerated);
    console.log('retro_type:', uniqueRetro);
    console.log('trigger_event:', uniqueTrigger);
    console.log('learning_category:', uniqueCategory);
  }
}

checkSchema();
