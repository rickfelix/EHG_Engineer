#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id, id, title')
  .eq('id', 'SD-KNOWLEDGE-001')
  .single();

console.log('Strategic Directive:', sd.id);
console.log('UUID:', sd.uuid_id);

const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('sd_uuid', sd.uuid_id);

if (prds && prds.length > 0) {
  const prd = prds[0];
  console.log('\nPRD Details:');
  console.log('  ID:', prd.id);
  console.log('  Status:', prd.status);
  console.log('  Phase:', prd.phase);
  console.log('  Deliverables:', JSON.stringify(prd.deliverables, null, 2));
  console.log('  EXEC Checklist Items:', prd.exec_checklist?.length || 0);
  if (prd.exec_checklist && prd.exec_checklist.length > 0) {
    console.log('\nEXEC Checklist:');
    prd.exec_checklist.forEach((item, idx) => {
      console.log(`    ${idx + 1}. [${item.checked ? 'X' : ' '}] ${item.title || item.description}`);
    });
  }
  console.log('\nMetadata keys:', Object.keys(prd.metadata || {}));
} else {
  console.log('No PRD found');
}
