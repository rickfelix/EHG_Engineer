#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PRD_ID = 'PRD-SD-VISION-V2-006';

// Check current status
const { data: prd, error: fetchError } = await supabase
  .from('product_requirements_v2')
  .select('id, status')
  .eq('id', PRD_ID)
  .single();

console.log('Current PRD status:', prd);

// Update to approved
const { data, error } = await supabase
  .from('product_requirements_v2')
  .update({ 
    status: 'approved',
    updated_at: new Date().toISOString()
  })
  .eq('id', PRD_ID)
  .select('id, status')
  .single();

if (error) {
  console.error('Error updating PRD status:', error);
} else {
  console.log('Updated PRD status:', data);
}
