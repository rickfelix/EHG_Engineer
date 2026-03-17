#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Search by ID from creation output
const { data: byId, error: errId } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-d4703d1e-4b2c-43ec-a1df-586d80077a6c');

console.log('Search by ID (PRD-d4703d1e-4b2c-43ec-a1df-586d80077a6c):');
console.log('Found:', byId?.length || 0);
if (byId && byId.length > 0) {
  console.log('PRD:', byId[0].id, '-', byId[0].title);
  console.log('Directive:', byId[0].directive_id);
  console.log('Status:', byId[0].status);
  console.log('Phase:', byId[0].phase);
}

// Search by directive_id
const { data: byDirective, error: errDir } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('directive_id', 'SD-REALTIME-001');

console.log('\nSearch by directive_id (SD-REALTIME-001):');
console.log('Found:', byDirective?.length || 0);
if (byDirective && byDirective.length > 0) {
  byDirective.forEach(prd => {
    console.log('- PRD:', prd.id, '-', prd.title);
  });
}

// Search by title pattern
const { data: byTitle, error: errTitle } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .ilike('title', '%realtime%');

console.log('\nSearch by title pattern (*realtime*):');
console.log('Found:', byTitle?.length || 0);
if (byTitle && byTitle.length > 0) {
  byTitle.forEach(prd => {
    console.log('- PRD:', prd.id, '-', prd.title, '(SD:', prd.directive_id + ')');
  });
}
