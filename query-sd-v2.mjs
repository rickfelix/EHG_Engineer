#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Query Strategic Directive
const { data: sds, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-STAGE4-AGENT-PROGRESS-001');

if (sdError) {
  console.error('SD Query Error:', sdError);
} else {
  console.log('='.repeat(80));
  console.log('STRATEGIC DIRECTIVE: SD-STAGE4-AGENT-PROGRESS-001');
  console.log('='.repeat(80));
  console.log(JSON.stringify(sds, null, 2));
}
