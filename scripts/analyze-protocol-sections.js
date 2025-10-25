#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function analyzeSections() {
  // Get active protocol ID first
  const { data: activeProtocol } = await supabase
    .from('leo_protocols')
    .select('id')
    .eq('status', 'active')
    .single();

  if (!activeProtocol) {
    console.error('No active protocol found');
    process.exit(1);
  }

  const { data: sections, error } = await supabase
    .from('leo_protocol_sections')
    .select('id, protocol_id, section_type, title, content, order_index')
    .eq('protocol_id', activeProtocol.id)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('=== LEO Protocol Sections Analysis ===');
  console.log('Protocol ID: ' + activeProtocol.id);
  console.log('Total sections: ' + sections.length + '\n');

  let totalChars = 0;
  const sectionSizes = [];
  
  sections.forEach(s => {
    const chars = s.content ? s.content.length : 0;
    totalChars += chars;
    sectionSizes.push({ 
      id: s.id, 
      title: s.title, 
      type: s.section_type,
      chars, 
      order: s.order_index 
    });
  });

  console.log('Total characters in all sections: ' + totalChars + '\n');

  // Find duplicates by title
  const titleCounts = {};
  sections.forEach(s => {
    titleCounts[s.title] = (titleCounts[s.title] || 0) + 1;
  });

  const duplicates = Object.entries(titleCounts).filter(([_, count]) => count > 1);
  
  if (duplicates.length > 0) {
    console.log('=== DUPLICATE TITLES (' + duplicates.length + ') ===');
    duplicates.forEach(([title, count]) => {
      console.log('\n' + count + 'x: ' + title);
      const dups = sections.filter(s => s.title === title);
      dups.forEach(d => {
        const chars = d.content ? d.content.length : 0;
        console.log('  - ID: ' + d.id + ' | Order: ' + d.order_index + ' | Chars: ' + chars);
      });
    });
    console.log('');
  }

  // Find largest sections
  console.log('\n=== TOP 15 LARGEST SECTIONS ===');
  sectionSizes.sort((a, b) => b.chars - a.chars);
  sectionSizes.slice(0, 15).forEach((s, i) => {
    console.log((i+1) + '. ' + s.chars + ' chars - ' + s.title);
    console.log('   ID: ' + s.id + ' | Type: ' + s.type + ' | Order: ' + s.order);
  });

  // Output sections for compression
  console.log('\n=== SECTIONS FOR COMPRESSION (>5000 chars) ===');
  const forCompression = sectionSizes.filter(s => s.chars > 5000);
  console.log('Found ' + forCompression.length + ' sections:\n');
  forCompression.forEach(s => {
    console.log('ID ' + s.id + ' | ' + s.chars + ' chars | ' + s.title);
  });
}

analyzeSections().catch(console.error);
